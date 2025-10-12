import * as cron from 'node-cron';
import { DatabaseService, Headline } from './databaseService';
import { UniversalMcpServer } from '../mcp/universalMcp';
import { logger } from '../utils/logger';

export class HeadlineFetcherService {
  private db: DatabaseService;
  private mcpServer: UniversalMcpServer;
  private cronJob?: ReturnType<typeof cron.schedule>;
  private isFetching: boolean = false;

  constructor(db: DatabaseService, mcpServer: UniversalMcpServer) {
    this.db = db;
    this.mcpServer = mcpServer;
  }

  /**
   * Start fetching headlines on a schedule
   */
  startScheduledFetching(cronExpression: string = '0 * * * *'): void {
    // Default: every hour at minute 0
    
    logger.info('Starting headline fetcher', { schedule: cronExpression });

    // Fetch immediately on start
    this.fetchAllHeadlines().catch(err => 
      logger.error('Initial headline fetch failed', err)
    );

    // Schedule recurring fetches
    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('Scheduled headline fetch triggered');
      await this.fetchAllHeadlines();
    });

    logger.info('Headline fetcher scheduled successfully');
  }

  /**
   * Stop scheduled fetching
   */
  stopScheduledFetching(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Headline fetcher stopped');
    }
  }

  /**
   * Fetch headlines from all sources
   */
  async fetchAllHeadlines(): Promise<void> {
    if (this.isFetching) {
      logger.warn('Headline fetch already in progress, skipping');
      return;
    }

    this.isFetching = true;
    const startTime = Date.now();

    try {
      const fetchedAt = new Date().toISOString();
      const headlines: Omit<Headline, 'id'>[] = [];

      // Fetch from NewsAPI
      try {
        const newsApiHeadlines = await this.fetchNewsAPI(fetchedAt);
        headlines.push(...newsApiHeadlines);
        logger.info('Fetched NewsAPI headlines', { count: newsApiHeadlines.length });
      } catch (error) {
        logger.error('Failed to fetch NewsAPI headlines', error);
      }

      // Fetch from Guardian
      try {
        const guardianHeadlines = await this.fetchGuardian(fetchedAt);
        headlines.push(...guardianHeadlines);
        logger.info('Fetched Guardian headlines', { count: guardianHeadlines.length });
      } catch (error) {
        logger.error('Failed to fetch Guardian headlines', error);
      }

      // Fetch from ArXiv
      try {
        const arxivPapers = await this.fetchArXiv(fetchedAt);
        headlines.push(...arxivPapers);
        logger.info('Fetched ArXiv papers', { count: arxivPapers.length });
      } catch (error) {
        logger.error('Failed to fetch ArXiv papers', error);
      }

      // Insert into database
      if (headlines.length > 0) {
        const insertedCount = this.db.insertHeadlines(headlines);
        logger.info('Headlines inserted into database', { 
          count: insertedCount,
          duration: Date.now() - startTime 
        });
      } else {
        logger.warn('No headlines fetched from any source');
      }

    } catch (error) {
      logger.error('Error in headline fetch cycle', error);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Fetch headlines from NewsAPI
   */
  private async fetchNewsAPI(fetchedAt: string): Promise<Omit<Headline, 'id'>[]> {
    const result = await this.mcpServer.handle({
      method: 'GET',
      path: '/news/top-headlines',
      query: { country: 'us', pageSize: '10' },
      provider: 'newsapi'
    });

    const articles = result.data?.articles || [];
    
    return articles.map((article: any) => ({
      title: article.title || 'No title',
      description: article.description || article.content || '',
      source: 'newsapi',
      url: article.url || '',
      publishedAt: article.publishedAt || fetchedAt,
      fetchedAt,
      category: 'news'
    }));
  }

  /**
   * Fetch headlines from Guardian
   */
  private async fetchGuardian(fetchedAt: string): Promise<Omit<Headline, 'id'>[]> {
    const result = await this.mcpServer.handle({
      method: 'GET',
      path: '/guardian/search',
      query: { 
        'page-size': '10',
        'order-by': 'newest',
        'show-fields': 'headline,trailText'
      },
      provider: 'guardian'
    });

    const results = result.data?.response?.results || [];
    
    return results.map((item: any) => ({
      title: item.webTitle || item.fields?.headline || 'No title',
      description: item.fields?.trailText || '',
      source: 'guardian',
      url: item.webUrl || '',
      publishedAt: item.webPublicationDate || fetchedAt,
      fetchedAt,
      category: item.sectionName || 'news'
    }));
  }

  /**
   * Fetch recent papers from ArXiv
   */
  private async fetchArXiv(fetchedAt: string): Promise<Omit<Headline, 'id'>[]> {
    // Fetch recent AI/ML papers
    const result = await this.mcpServer.handle({
      method: 'GET',
      path: '/arxiv/search',
      query: { 
        search_query: 'cat:cs.AI OR cat:cs.LG',
        max_results: '10',
        sortBy: 'submittedDate',
        sortOrder: 'descending'
      },
      provider: 'arxiv'
    });

    const entries = result.data?.feed?.entry || [];
    const entriesArray = Array.isArray(entries) ? entries : [entries];
    
    return entriesArray.map((entry: any) => ({
      title: entry.title?.replace(/\s+/g, ' ').trim() || 'No title',
      description: entry.summary?.replace(/\s+/g, ' ').trim().substring(0, 300) || '',
      source: 'arxiv',
      url: entry.id || entry.links?.[0]?.href || '',
      publishedAt: entry.published || fetchedAt,
      fetchedAt,
      category: 'research'
    }));
  }

  /**
   * Fetch headlines on demand
   */
  async fetchNow(): Promise<number> {
    await this.fetchAllHeadlines();
    return this.db.getRecentHeadlines(1).length;
  }
}

