import { ApiRegistry, createNewsApiProvider, createGuardianProvider, createArxivProvider, createNYTimesProvider, createOpenAlexProvider } from '../services/apiRegistry';

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

  constructor(
    newsApiKey: string,
    guardianApiKey?: string,
    nyTimesApiKey?: string,
    openAlexContactEmail?: string
  ) {
    this.registry = new ApiRegistry();
    
    // Register NewsAPI
    this.registry.register(createNewsApiProvider(newsApiKey));
    
    // Register Guardian if key provided
    if (guardianApiKey) {
      this.registry.register(createGuardianProvider(guardianApiKey));
    }
    
    // Register NYTimes if key provided
    if (nyTimesApiKey) {
      this.registry.register(createNYTimesProvider(nyTimesApiKey));
    }
    
    // Register ArXiv (no API key needed)
    this.registry.register(createArxivProvider());

    // Register OpenAlex (no key required, but pass contact email for polite usage)
    this.registry.register(createOpenAlexProvider(openAlexContactEmail));
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
    } else if (req.method === 'GET' && req.path === '/news/everything') {
      if (provider.name === 'newsapi') {
        const { q, searchIn, sources, domains, excludeDomains, from, to, language, sortBy, pageSize, page } = req.query || {};
        if (!q) {
          throw new Error('Query parameter (q) is required for /news/everything');
        }
        data = await (provider.service as any).searchEverything({
          q: q as string,
          searchIn: searchIn as string | undefined,
          sources: sources as string | undefined,
          domains: domains as string | undefined,
          excludeDomains: excludeDomains as string | undefined,
          from: from as string | undefined,
          to: to as string | undefined,
          language: language as string | undefined,
          sortBy: sortBy as 'relevancy' | 'popularity' | 'publishedAt' | undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
          page: page ? Number(page) : undefined,
        });
      } else {
        throw new Error(`Everything search not supported by ${providerName}`);
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
    } else if (req.method === 'GET' && req.path === '/nytimes/search') {
      if (provider.name === 'nytimes') {
        const { q, fq, begin_date, end_date, sort, page, facet_field, facet_filter, fl } = req.query || {};
        data = await (provider.service as any).searchArticles({
          q: q as string | undefined,
          fq: fq as string | undefined,
          begin_date: begin_date as string | undefined,
          end_date: end_date as string | undefined,
          sort: sort as 'newest' | 'oldest' | 'relevance' | undefined,
          page: page ? Number(page) : undefined,
          facet_field: Array.isArray(facet_field) ? facet_field as string[] : (facet_field ? [facet_field as string] : undefined),
          facet_filter: facet_filter === 'true',
          fl: Array.isArray(fl) ? fl as string[] : (fl ? [fl as string] : undefined),
        });
      } else {
        throw new Error(`NYTimes search not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/nytimes/archive') {
      if (provider.name === 'nytimes') {
        const { year, month, q, fq, f, page } = req.query || {};
        if (!year || !month) {
          throw new Error('NYTimes archive requires year and month parameters');
        }
        data = await (provider.service as any).getArchiveArticles({
          year: Number(year),
          month: Number(month),
          q: q as string | undefined,
          fq: fq as string | undefined,
          f: f as string | undefined,
          page: page ? Number(page) : undefined,
        });
      } else {
        throw new Error(`NYTimes archive not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/openalex/works') {
      if (provider.name === 'openalex') {
        const { search, filter, sort, per_page, page, cursor, mailto } = req.query || {};
        data = await (provider.service as any).searchWorks({
          search: search as string | undefined,
          filter: filter as string | undefined,
          sort: sort as string | undefined,
          per_page: per_page ? Number(per_page) : undefined,
          page: page ? Number(page) : undefined,
          cursor: cursor as string | undefined,
          mailto: mailto as string | undefined,
        });
      } else {
        throw new Error(`OpenAlex works search not supported by ${providerName}`);
      }
    } else if (req.method === 'GET' && req.path === '/openalex/work') {
      if (provider.name === 'openalex') {
        const { id } = req.query || {};
        if (!id) {
          throw new Error('OpenAlex work id is required');
        }
        data = await (provider.service as any).getWork(id as string);
      } else {
        throw new Error(`OpenAlex work lookup not supported by ${providerName}`);
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
