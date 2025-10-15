/**
 * Simple in-memory vector store for embeddings
 * No external dependencies required
 */

export interface VectorDocument {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  document: string;
}

export interface SearchResult {
  id: string;
  distance: number;
  metadata: Record<string, any>;
  document: string;
}

export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  /**
   * Add documents to the store
   */
  add(docs: VectorDocument[]): void {
    for (const doc of docs) {
      this.documents.set(doc.id, doc);
    }
  }

  /**
   * Search for similar documents using cosine similarity
   */
  query(queryEmbedding: number[], limit: number = 10, filter?: Record<string, any>): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [id, doc] of this.documents.entries()) {
      // Apply filter if provided
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      // Calculate cosine distance (1 - similarity)
      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      const distance = 1 - similarity;

      results.push({
        id,
        distance,
        metadata: doc.metadata,
        document: doc.document
      });
    }

    // Sort by distance (ascending) and limit results
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, limit);
  }

  /**
   * Get documents by filter
   */
  get(filter?: Record<string, any>, limit?: number): VectorDocument[] {
    const results: VectorDocument[] = [];

    for (const doc of this.documents.values()) {
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      results.push(doc);

      if (limit && results.length >= limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Delete a document by ID
   */
  delete(id: string): boolean {
    return this.documents.delete(id);
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
  }

  /**
   * Get count of documents
   */
  count(): number {
    return this.documents.size;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

