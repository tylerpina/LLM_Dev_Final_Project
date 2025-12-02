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

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fetchedAt ON headlines(fetchedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_source ON headlines(source);
    `);
  }

  /**
   * Add a new user
   */
  addUser(email: string, name?: string, preferences?: string): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (email, name, preferences)
        VALUES (?, ?, ?)
      `);
      const result = stmt.run(email, name, preferences);
      return result.lastInsertRowid as number;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        logger.warn(`User with email ${email} already exists`);
        const existing = this.getUserByEmail(email);
        return existing ? existing.id : -1;
      }
      throw error;
    }
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): any {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  /**
   * Get all users
   */
  getAllUsers(): any[] {
    const stmt = this.db.prepare('SELECT * FROM users');
    return stmt.all();
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
    const sourcesPerProvider = Math.ceil(limit / 4); // Roughly equal for 4 providers
    
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

    const guardianHeadlines = guardianStmt.all(sourcesPerProvider) as Headline[];
    const arxivHeadlines = arxivStmt.all(sourcesPerProvider) as Headline[];
    const nyTimesHeadlines = nyTimesStmt.all(sourcesPerProvider) as Headline[];
    const newsApiHeadlines = newsApiStmt.all(sourcesPerProvider) as Headline[];

    // Combine and sort by fetch time, then limit to requested amount
    const allHeadlines = [...newsApiHeadlines, ...guardianHeadlines, ...arxivHeadlines, ...nyTimesHeadlines]
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
}



