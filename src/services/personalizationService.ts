import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './embeddingService';
import { VectorStore } from './vectorStore';
import { logger } from '../utils/logger';
import { DatabaseService, DBUserProfile } from './databaseService';

export interface UserInteraction {
  userId: string;
  query: string;
  timestamp: Date;
  articleId?: string;
  articleTitle?: string;
  articleContent?: string;
  interactionType: 'query' | 'click' | 'view' | 'like';
}

export interface UserProfile {
  userId: string;
  interests: string[];
  interactionCount: number;
  createdAt: Date;
  lastActive: Date;
}

export interface RecommendationResult {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Personalization service using vector embeddings and persistent storage
 */
export class PersonalizationService {
  private embeddingService: EmbeddingService;
  private databaseService: DatabaseService;
  private userInteractionsStore: VectorStore;
  private articlesStore: VectorStore;
  private userProfiles: Map<string, UserProfile> = new Map();

  constructor(embeddingService: EmbeddingService, databaseService: DatabaseService) {
    this.embeddingService = embeddingService;
    this.databaseService = databaseService;
    this.userInteractionsStore = new VectorStore();
    this.articlesStore = new VectorStore();
  }

  /**
   * Initialize the vector database collections
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Personalization service initialized successfully');
    } catch (error) {
      logger.error('Error initializing personalization service:', error);
      throw error;
    }
  }

  /**
   * Track a user interaction (query, click, etc.)
   */
  async trackInteraction(interaction: UserInteraction): Promise<void> {
    try {
      // Generate embedding for the query or content
      const textToEmbed = interaction.query || interaction.articleContent || '';
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);

      // Store in vector store
      const id = uuidv4();
      this.userInteractionsStore.add([{
        id,
        embedding,
        metadata: {
          userId: interaction.userId,
          query: interaction.query,
          timestamp: interaction.timestamp.toISOString(),
          articleId: interaction.articleId || '',
          articleTitle: interaction.articleTitle || '',
          interactionType: interaction.interactionType,
        },
        document: textToEmbed,
      }]);

      // Persist interaction to database
      this.databaseService.saveUserInteraction({
        id,
        userId: interaction.userId,
        query: interaction.query,
        timestamp: interaction.timestamp.toISOString(),
        articleId: interaction.articleId,
        articleTitle: interaction.articleTitle,
        articleContent: interaction.articleContent,
        interactionType: interaction.interactionType,
        embedding: JSON.stringify(embedding),
      });

      // Update user profile
      await this.updateUserProfile(interaction);

      logger.info(`Tracked ${interaction.interactionType} for user ${interaction.userId}`);
    } catch (error) {
      logger.error('Error tracking interaction:', error);
      throw error;
    }
  }

  /**
   * Update user interests explicitly
   */
  async updateUserInterests(userId: string, interests: string[]): Promise<void> {
    try {
      let profile = this.getUserProfile(userId);

      if (!profile) {
        profile = {
          userId,
          interests: [],
          interactionCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        };
      }

      // Update interests (deduplicate)
      profile.interests = [...new Set(interests)];
      profile.lastActive = new Date();

      // Update memory cache
      this.userProfiles.set(userId, profile);

      // Persist to database
      this.databaseService.upsertUserProfile({
        userId: profile.userId,
        interests: JSON.stringify(profile.interests),
        interactionCount: profile.interactionCount,
        createdAt: profile.createdAt.toISOString(),
        lastActive: profile.lastActive.toISOString(),
      });

      logger.info(`Updated interests for user ${userId}: ${interests.join(', ')}`);
    } catch (error) {
      logger.error('Error updating user interests:', error);
      throw error;
    }
  }

  /**
   * Update user profile based on interaction
   */
  private async updateUserProfile(interaction: UserInteraction): Promise<void> {
    let profile = this.getUserProfile(interaction.userId);

    if (!profile) {
      profile = {
        userId: interaction.userId,
        interests: [],
        interactionCount: 0,
        createdAt: new Date(),
        lastActive: new Date(),
      };
    }

    profile.interactionCount++;
    profile.lastActive = new Date();

    // Extract interests from query (simple keyword extraction)
    if (interaction.query) {
      const keywords = interaction.query
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3);
      
      keywords.forEach(keyword => {
        if (!profile!.interests.includes(keyword)) {
          profile!.interests.push(keyword);
        }
      });

      // Keep only top 50 interests
      if (profile.interests.length > 50) {
        profile.interests = profile.interests.slice(-50);
      }
    }

    // Update memory cache
    this.userProfiles.set(interaction.userId, profile);

    // Persist to database
    this.databaseService.upsertUserProfile({
      userId: profile.userId,
      interests: JSON.stringify(profile.interests),
      interactionCount: profile.interactionCount,
      createdAt: profile.createdAt.toISOString(),
      lastActive: profile.lastActive.toISOString(),
    });
  }

  /**
   * Get personalized recommendations for a user
   */
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<RecommendationResult[]> {
    try {
      // Get user's past interactions from memory
      let userHistory = this.userInteractionsStore.get({ userId }, 20);

      // If no history in memory, try to load from DB
      if (userHistory.length === 0) {
        await this.loadUserInteractionsFromDB(userId);
        userHistory = this.userInteractionsStore.get({ userId }, 20);
      }

      if (userHistory.length === 0) {
        logger.info(`No history found for user ${userId}, returning empty recommendations`);
        return [];
      }

      // Calculate average embedding from user's history
      const avgEmbedding = this.calculateAverageEmbedding(
        userHistory.map(doc => doc.embedding)
      );

      // Find similar articles
      const results = this.articlesStore.query(avgEmbedding, limit);

      // Format recommendations
      const recommendations: RecommendationResult[] = results.map(result => ({
        id: result.id,
        title: result.metadata?.title || 'No title',
        content: result.document,
        score: 1 - result.distance, // Convert distance to similarity score
        metadata: result.metadata,
      }));

      return recommendations;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw error;
    }
  }

  /**
   * Load user interactions from database into vector store
   */
  private async loadUserInteractionsFromDB(userId: string): Promise<void> {
    try {
      const interactions = this.databaseService.getUserInteractions(userId, 20);
      if (interactions.length > 0) {
        const vectorDocs = interactions
          .filter(i => i.embedding) // Only those with embeddings
          .map(i => ({
            id: i.id,
            embedding: JSON.parse(i.embedding!),
            metadata: {
              userId: i.userId,
              query: i.query,
              timestamp: i.timestamp,
              articleId: i.articleId || '',
              articleTitle: i.articleTitle || '',
              interactionType: i.interactionType,
            },
            document: i.query || i.articleContent || '',
          }));
        
        if (vectorDocs.length > 0) {
          this.userInteractionsStore.add(vectorDocs);
          logger.info(`Loaded ${vectorDocs.length} interactions from DB for user ${userId}`);
        }
      }
    } catch (error) {
      logger.warn('Failed to load interactions from DB:', error);
    }
  }

  /**
   * Index an article for future recommendations
   */
  async indexArticle(
    articleId: string,
    title: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Generate embedding for article
      const textToEmbed = `${title} ${content}`;
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);

      // Store in vector store
      this.articlesStore.add([{
        id: articleId,
        embedding,
        metadata: { title, ...metadata },
        document: content,
      }]);

      logger.info(`Indexed article: ${articleId}`);
    } catch (error) {
      logger.error('Error indexing article:', error);
      throw error;
    }
  }

  /**
   * Get similar content based on a query
   */
  async findSimilarContent(
    query: string,
    userId?: string,
    limit: number = 10
  ): Promise<RecommendationResult[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // If user provided, track this query
      if (userId) {
        await this.trackInteraction({
          userId,
          query,
          timestamp: new Date(),
          interactionType: 'query',
        });
      }

      // Search for similar articles
      const results = this.articlesStore.query(queryEmbedding, limit);

      // Format results
      const recommendations: RecommendationResult[] = results.map(result => ({
        id: result.id,
        title: result.metadata?.title || 'No title',
        content: result.document,
        score: 1 - result.distance,
        metadata: result.metadata,
      }));

      return recommendations;
    } catch (error) {
      logger.error('Error finding similar content:', error);
      throw error;
    }
  }

  /**
   * Get user profile (from memory or DB)
   */
  getUserProfile(userId: string): UserProfile | undefined {
    let profile = this.userProfiles.get(userId);
    
    if (!profile) {
      // Try to fetch from DB
      const dbProfile = this.databaseService.getUserProfile(userId);
      if (dbProfile) {
        try {
          profile = {
            userId: dbProfile.userId,
            interests: JSON.parse(dbProfile.interests),
            interactionCount: dbProfile.interactionCount,
            createdAt: new Date(dbProfile.createdAt),
            lastActive: new Date(dbProfile.lastActive)
          };
          // Cache in memory
          this.userProfiles.set(userId, profile);
        } catch (e) {
          logger.error('Error parsing user profile from DB:', e);
        }
      }
    }
    
    return profile;
  }

  /**
   * Get all user profiles (from memory only - efficient list)
   * Note: This only returns currently active/cached profiles. 
   * For full list, we would need a DB method.
   */
  getAllUserProfiles(): UserProfile[] {
    return Array.from(this.userProfiles.values());
  }

  /**
   * Calculate average embedding from multiple embeddings
   */
  private calculateAverageEmbedding(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      throw new Error('Cannot calculate average of empty embeddings array');
    }

    const dimensions = embeddings[0].length;
    const avgEmbedding = new Array(dimensions).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      avgEmbedding[i] /= embeddings.length;
    }

    return avgEmbedding;
  }

  /**
   * Clear all data (useful for testing)
   */
  async clearAllData(): Promise<void> {
    try {
      this.userInteractionsStore.clear();
      this.articlesStore.clear();
      this.userProfiles.clear();
      logger.info('Cleared all personalization data');
    } catch (error) {
      logger.error('Error clearing data:', error);
      throw error;
    }
  }
}
