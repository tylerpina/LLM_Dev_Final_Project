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
        category TEXT DEFAULT 'general'
      );
    `);

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fetchedAt ON headlines(fetchedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_source ON headlines(source);
    `);
  }

  /**
   * Insert a new headline
   */
  insertHeadline(headline: Omit<Headline, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO headlines (title, description, source, url, publishedAt, fetchedAt, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      headline.title,
      headline.description,
      headline.source,
      headline.url,
      headline.publishedAt,
      headline.fetchedAt,
      headline.category
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Bulk insert headlines
   */
  insertHeadlines(headlines: Omit<Headline, 'id'>[]): number {
    const insertMany = this.db.transaction((headlines: Omit<Headline, 'id'>[]) => {
      const stmt = this.db.prepare(`
        INSERT INTO headlines (title, description, source, url, publishedAt, fetchedAt, category)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const headline of headlines) {
        stmt.run(
          headline.title,
          headline.description,
          headline.source,
          headline.url,
          headline.publishedAt,
          headline.fetchedAt,
          headline.category
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



