import { ApiRegistry, createNewsApiProvider, createGuardianProvider, createArxivProvider } from '../services/apiRegistry';

export interface McpRequest {
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  provider?: string; // which API provider to use
}

export interface McpResponse {
  provider: string;
  data: any;
  timestamp: string;
}

export class UniversalMcpServer {
  private readonly registry: ApiRegistry;

  constructor(newsApiKey: string, guardianApiKey?: string) {
    this.registry = new ApiRegistry();
    
    // Register NewsAPI
    this.registry.register(createNewsApiProvider(newsApiKey));
    
    // Register Guardian if key provided
    if (guardianApiKey) {
      this.registry.register(createGuardianProvider(guardianApiKey));
    }
    
    // Register ArXiv (no API key needed)
    this.registry.register(createArxivProvider());
  }

  async handle(req: McpRequest): Promise<McpResponse> {
    const providerName = req.provider || 'newsapi'; // default to newsapi
    const provider = this.registry.getProvider(providerName);
    
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found. Available: ${this.registry.getProviderNames().join(', ')}`);
    }

    let data: any;

    // Route to appropriate service based on path
    if (req.method === 'GET' && req.path === '/news/top-headlines') {
      if (provider.name === 'newsapi') {
        const { country, category, q, pageSize, page } = req.query || {};
        data = await (provider.service as any).getTopHeadlines({
          country: (country as string) || 'us',
          category: category as string | undefined,
          q: q as string | undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
          page: page ? Number(page) : undefined,
        });
      } else {
        throw new Error(`Top headlines not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/guardian/search') {
      if (provider.name === 'guardian') {
        const { q, section, page, 'page-size': pageSize, 'from-date': fromDate, 'to-date': toDate } = req.query || {};
        data = await (provider.service as any).search({
          q: q as string | undefined,
          section: section as string | undefined,
          page: page ? Number(page) : undefined,
          'page-size': pageSize ? Number(pageSize) : undefined,
          'from-date': fromDate as string | undefined,
          'to-date': toDate as string | undefined,
        });
      } else {
        throw new Error(`Guardian search not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/guardian/sections') {
      if (provider.name === 'guardian') {
        data = await (provider.service as any).getSections();
      } else {
        throw new Error(`Guardian sections not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/arxiv/search') {
      if (provider.name === 'arxiv') {
        const { search_query, id_list, start, max_results, sortBy, sortOrder } = req.query || {};
        data = await (provider.service as any).search({
          search_query: search_query as string | undefined,
          id_list: id_list as string | undefined,
          start: start ? Number(start) : undefined,
          max_results: max_results ? Number(max_results) : undefined,
          sortBy: sortBy as 'relevance' | 'lastUpdatedDate' | 'submittedDate' | undefined,
          sortOrder: sortOrder as 'ascending' | 'descending' | undefined,
        });
      } else {
        throw new Error(`ArXiv search not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/arxiv/paper') {
      if (provider.name === 'arxiv') {
        const { id } = req.query || {};
        if (!id) {
          throw new Error('ArXiv paper ID is required');
        }
        data = await (provider.service as any).getPaper(id as string);
      } else {
        throw new Error(`ArXiv paper lookup not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/arxiv/category') {
      if (provider.name === 'arxiv') {
        const { category, start, max_results, sortBy, sortOrder } = req.query || {};
        if (!category) {
          throw new Error('ArXiv category is required');
        }
        data = await (provider.service as any).searchByCategory(category as string, {
          start: start ? Number(start) : undefined,
          max_results: max_results ? Number(max_results) : undefined,
          sortBy: sortBy as 'relevance' | 'lastUpdatedDate' | 'submittedDate' | undefined,
          sortOrder: sortOrder as 'ascending' | 'descending' | undefined,
        });
      } else {
        throw new Error(`ArXiv category search not supported by ${providerName}`);
      }
    } else {
      throw new Error(`Unsupported method/path: ${req.method} ${req.path}`);
    }

    return {
      provider: providerName,
      data,
      timestamp: new Date().toISOString()
    };
  }

  getAvailableProviders(): string[] {
    return this.registry.getProviderNames();
  }

  getProviderEndpoints(providerName: string): string[] {
    const provider = this.registry.getProvider(providerName);
    return provider?.endpoints || [];
  }
}
