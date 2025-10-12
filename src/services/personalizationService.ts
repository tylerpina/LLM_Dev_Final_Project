import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './embeddingService';
import { VectorStore } from './vectorStore';
import { logger } from '../utils/logger';

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
 * Personalization service using vector embeddings and in-memory vector store
 */
export class PersonalizationService {
  private embeddingService: EmbeddingService;
  private userInteractionsStore: VectorStore;
  private articlesStore: VectorStore;
  private userProfiles: Map<string, UserProfile> = new Map();

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
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

      // Update user profile
      await this.updateUserProfile(interaction);

      logger.info(`Tracked ${interaction.interactionType} for user ${interaction.userId}`);
    } catch (error) {
      logger.error('Error tracking interaction:', error);
      throw error;
    }
  }

  /**
   * Update user profile based on interaction
   */
  private async updateUserProfile(interaction: UserInteraction): Promise<void> {
    let profile = this.userProfiles.get(interaction.userId);

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

    this.userProfiles.set(interaction.userId, profile);
  }

  /**
   * Get personalized recommendations for a user
   */
  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<RecommendationResult[]> {
    try {
      // Get user's past interactions
      const userHistory = this.userInteractionsStore.get({ userId }, 20);

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
   * Get user profile
   */
  getUserProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  /**
   * Get all user profiles
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

