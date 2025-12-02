import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../utils/logger';

export interface Headline {
  id: number;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  category: string;
  provider?: string; // Track which API provider (newsapi, guardian, arxiv)
}

export interface QueryHistory {
  id: number;
  userId: string;
  query: string;
  style?: string | null;
  timestamp: string;
  executionTimeMs?: number | null;
  agentsExecuted?: string | null;
  sourcesCount?: number | null;
}

export interface SavedSearch {
  id: number;
  userId: string;
  name: string;
  query: string;
  style?: string;
  createdAt: string;
  lastUsed?: string;
  useCount: number;
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string = './data/headlines.db') {
    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeDatabase();
    logger.info('Database initialized', { path: dbPath });
  }

  private initializeDatabase(): void {
    // Create headlines table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS headlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT NOT NULL,
        url TEXT,
        publishedAt TEXT,
        fetchedAt TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        provider TEXT DEFAULT 'unknown'
      );
    `);
    
    // Add provider column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE headlines ADD COLUMN provider TEXT DEFAULT 'unknown';`);
    } catch (error) {
      // Column already exists, ignore error
    }

    // Create users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        preferences TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Create query history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        query TEXT NOT NULL,
        style TEXT,
        timestamp TEXT NOT NULL,
        executionTimeMs INTEGER,
        agentsExecuted TEXT,
        sourcesCount INTEGER
      );
    `);

    // Create saved searches table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        style TEXT,
        createdAt TEXT NOT NULL,
        lastUsed TEXT,
        useCount INTEGER DEFAULT 0
      );
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fetchedAt ON headlines(fetchedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_source ON headlines(source);
      CREATE INDEX IF NOT EXISTS idx_query_history_user_timestamp ON query_history(userId, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(userId);
    `);
  }

  /**
   * Insert a new headline
   */
  insertHeadline(headline: Omit<Headline, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO headlines (title, description, source, url, publishedAt, fetchedAt, category, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      headline.title,
      headline.description,
      headline.source,
      headline.url,
      headline.publishedAt,
      headline.fetchedAt,
      headline.category,
      headline.provider || 'unknown'
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Bulk insert headlines
   */
  insertHeadlines(headlines: Omit<Headline, 'id'>[]): number {
    const insertMany = this.db.transaction((headlines: Omit<Headline, 'id'>[]) => {
      const stmt = this.db.prepare(`
        INSERT INTO headlines (title, description, source, url, publishedAt, fetchedAt, category, provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const headline of headlines) {
        stmt.run(
          headline.title,
          headline.description,
          headline.source,
          headline.url,
          headline.publishedAt,
          headline.fetchedAt,
          headline.category,
          headline.provider || 'unknown'
        );
      }
      return headlines.length;
    });

    return insertMany(headlines);
  }

  /**
   * Get recent headlines
   */
  getRecentHeadlines(limit: number = 20, source?: string): Headline[] {
    let query = `
      SELECT * FROM headlines
      ${source ? 'WHERE source = ?' : ''}
      ORDER BY fetchedAt DESC, publishedAt DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    const params = source ? [source, limit] : [limit];
    
    return stmt.all(...params) as Headline[];
  }

  /**
   * Get headlines by time range
   */
  getHeadlinesByTimeRange(hours: number = 24): Headline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM headlines
      WHERE datetime(fetchedAt) >= datetime('now', '-' || ? || ' hours')
      ORDER BY fetchedAt DESC, publishedAt DESC
    `);

    return stmt.all(hours) as Headline[];
  }

  /**
   * Search headlines by keyword
   */
  searchHeadlines(keyword: string, limit: number = 20): Headline[] {
    const stmt = this.db.prepare(`
      SELECT * FROM headlines
      WHERE title LIKE ? OR description LIKE ?
      ORDER BY fetchedAt DESC
      LIMIT ?
    `);

    const searchTerm = `%${keyword}%`;
    return stmt.all(searchTerm, searchTerm, limit) as Headline[];
  }

  /**
   * Get headline count by source
   */
  getHeadlineStats(): { source: string; count: number; latest: string }[] {
    const stmt = this.db.prepare(`
      SELECT 
        source,
        COUNT(*) as count,
        MAX(fetchedAt) as latest
      FROM headlines
      GROUP BY source
      ORDER BY count DESC
    `);

    return stmt.all() as { source: string; count: number; latest: string }[];
  }

  /**
   * Get balanced headlines from different sources
   */
  getBalancedHeadlines(limit: number = 24): Headline[] {
    // Get equal representation from each known provider
    const sourcesPerProvider = Math.ceil(limit / 5); // Roughly equal for 5 providers
    
    const guardianStmt = this.db.prepare(`
      SELECT * FROM headlines 
      WHERE provider = 'guardian' OR source = 'guardian'
      ORDER BY fetchedAt DESC, publishedAt DESC 
      LIMIT ?
    `);
    const arxivStmt = this.db.prepare(`
      SELECT * FROM headlines 
      WHERE provider = 'arxiv' OR source = 'arxiv'
      ORDER BY fetchedAt DESC, publishedAt DESC 
      LIMIT ?
    `);
    const nyTimesStmt = this.db.prepare(`
      SELECT * FROM headlines 
      WHERE provider = 'nytimes' OR source LIKE '%New York Times%'
      ORDER BY fetchedAt DESC, publishedAt DESC 
      LIMIT ?
    `);
    const newsApiStmt = this.db.prepare(`
      SELECT * FROM headlines 
      WHERE provider = 'newsapi' OR (provider IS NULL AND source NOT IN ('guardian', 'arxiv', 'nytimes') AND source NOT LIKE '%New York Times%')
      ORDER BY fetchedAt DESC, publishedAt DESC 
      LIMIT ?
    `);
    const openAlexStmt = this.db.prepare(`
      SELECT * FROM headlines 
      WHERE provider = 'openalex' OR source LIKE '%OpenAlex%'
      ORDER BY fetchedAt DESC, publishedAt DESC 
      LIMIT ?
    `);

    const guardianHeadlines = guardianStmt.all(sourcesPerProvider) as Headline[];
    const arxivHeadlines = arxivStmt.all(sourcesPerProvider) as Headline[];
    const nyTimesHeadlines = nyTimesStmt.all(sourcesPerProvider) as Headline[];
    const newsApiHeadlines = newsApiStmt.all(sourcesPerProvider) as Headline[];
    const openAlexHeadlines = openAlexStmt.all(sourcesPerProvider) as Headline[];

    // Combine and sort by fetch time, then limit to requested amount
    const allHeadlines = [
      ...newsApiHeadlines,
      ...guardianHeadlines,
      ...arxivHeadlines,
      ...nyTimesHeadlines,
      ...openAlexHeadlines
    ]
      .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
      .slice(0, limit);

    return allHeadlines;
  }

  /**
   * Clean old headlines (keep last N days)
   */
  cleanOldHeadlines(daysToKeep: number = 7): number {
    const stmt = this.db.prepare(`
      DELETE FROM headlines
      WHERE datetime(fetchedAt) < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(daysToKeep);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }

  // ================= QUERY HISTORY METHODS =================

  /**
   * Save a query to history
   */
  saveQueryHistory(history: Omit<QueryHistory, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO query_history (userId, query, style, timestamp, executionTimeMs, agentsExecuted, sourcesCount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      history.userId,
      history.query,
      history.style || null,
      history.timestamp,
      history.executionTimeMs || null,
      history.agentsExecuted || null,
      history.sourcesCount || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get query history for a user
   */
  getQueryHistory(userId: string, limit: number = 50): QueryHistory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM query_history
      WHERE userId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(userId, limit) as QueryHistory[];
  }

  /**
   * Search query history
   */
  searchQueryHistory(userId: string, searchTerm: string, limit: number = 20): QueryHistory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM query_history
      WHERE userId = ? AND query LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const term = `%${searchTerm}%`;
    return stmt.all(userId, term, limit) as QueryHistory[];
  }

  /**
   * Delete a query from history
   */
  deleteQueryHistory(id: number, userId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM query_history
      WHERE id = ? AND userId = ?
    `);

    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Clear all query history for a user
   */
  clearQueryHistory(userId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM query_history
      WHERE userId = ?
    `);

    const result = stmt.run(userId);
    return result.changes;
  }

  /**
   * Get query history stats
   */
  getQueryHistoryStats(userId: string): {
    total: number;
    today: number;
    thisWeek: number;
    averageExecutionTime: number;
  } {
    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM query_history WHERE userId = ?
    `).get(userId) as { count: number };

    const today = this.db.prepare(`
      SELECT COUNT(*) as count FROM query_history
      WHERE userId = ? AND date(timestamp) = date('now')
    `).get(userId) as { count: number };

    const thisWeek = this.db.prepare(`
      SELECT COUNT(*) as count FROM query_history
      WHERE userId = ? AND datetime(timestamp) >= datetime('now', '-7 days')
    `).get(userId) as { count: number };

    const avgTime = this.db.prepare(`
      SELECT AVG(executionTimeMs) as avg FROM query_history
      WHERE userId = ? AND executionTimeMs IS NOT NULL
    `).get(userId) as { avg: number | null };

    return {
      total: total.count,
      today: today.count,
      thisWeek: thisWeek.count,
      averageExecutionTime: avgTime.avg ? Math.round(avgTime.avg) : 0,
    };
  }

  // ================= SAVED SEARCHES METHODS =================

  /**
   * Save a search
   */
  saveSearch(search: Omit<SavedSearch, 'id' | 'useCount'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO saved_searches (userId, name, query, style, createdAt, lastUsed, useCount)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);

    const result = stmt.run(
      search.userId,
      search.name,
      search.query,
      search.style || null,
      search.createdAt,
      search.lastUsed || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get all saved searches for a user
   */
  getSavedSearches(userId: string): SavedSearch[] {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches
      WHERE userId = ?
      ORDER BY lastUsed DESC, createdAt DESC
    `);

    return stmt.all(userId) as SavedSearch[];
  }

  /**
   * Get a saved search by ID
   */
  getSavedSearch(id: number, userId: string): SavedSearch | null {
    const stmt = this.db.prepare(`
      SELECT * FROM saved_searches
      WHERE id = ? AND userId = ?
    `);

    const result = stmt.get(id, userId) as SavedSearch | undefined;
    return result || null;
  }

  /**
   * Update a saved search
   */
  updateSavedSearch(id: number, userId: string, updates: Partial<Pick<SavedSearch, 'name' | 'query' | 'style'>>): boolean {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.query !== undefined) {
      fields.push('query = ?');
      values.push(updates.query);
    }
    if (updates.style !== undefined) {
      fields.push('style = ?');
      values.push(updates.style);
    }

    if (fields.length === 0) return false;

    values.push(id, userId);
    const stmt = this.db.prepare(`
      UPDATE saved_searches
      SET ${fields.join(', ')}
      WHERE id = ? AND userId = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Increment use count and update last used
   */
  useSavedSearch(id: number, userId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE saved_searches
      SET useCount = useCount + 1, lastUsed = ?
      WHERE id = ? AND userId = ?
    `);

    const result = stmt.run(new Date().toISOString(), id, userId);
    return result.changes > 0;
  }

  /**
   * Delete a saved search
   */
  deleteSavedSearch(id: number, userId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM saved_searches
      WHERE id = ? AND userId = ?
    `);

    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Clean old query history (keep last N days)
   */
  cleanOldQueryHistory(daysToKeep: number = 30): number {
    const stmt = this.db.prepare(`
      DELETE FROM query_history
      WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(daysToKeep);
    return result.changes;
  }
}



