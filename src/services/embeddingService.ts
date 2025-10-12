import OpenAI from 'openai';
import { logger } from '../utils/logger';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

/**
 * Service for generating text embeddings using OpenAI
 */
export class EmbeddingService {
  private openai: OpenAI;
  private model: string = 'text-embedding-3-small';

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for embedding service');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });
      
      return response.data.map((item, index) => ({
        embedding: item.embedding,
        text: texts[index],
      }));
    } catch (error) {
      logger.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

