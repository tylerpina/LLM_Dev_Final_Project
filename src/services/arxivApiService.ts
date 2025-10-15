import axios from 'axios';

export interface ArxivParams {
  search_query?: string; // ArXiv search query
  id_list?: string; // comma-separated list of ArXiv IDs
  start?: number; // start index for pagination
  max_results?: number; // max results to return (default 10, max 2000)
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

export interface ArxivEntry {
  id: string;
  updated: string;
  published: string;
  title: string;
  summary: string;
  authors: Array<{ name: string }>;
  links: Array<{ href: string; rel: string; type?: string }>;
  categories: string[];
}

export interface ArxivResponse {
  feed: {
    xmlns: string;
    xmlns_opensearch: string;
    xmlns_arxiv: string;
    link: Array<{ href: string; rel: string; type: string }>;
    title: string;
    id: string;
    updated: string;
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    entry: ArxivEntry[];
  };
}

export class ArxivApiService {
  private readonly baseUrl = 'http://export.arxiv.org/api/query';

  constructor() {
    // ArXiv API doesn't require authentication
  }

  async search(params: ArxivParams = {}): Promise<ArxivResponse> {
    const searchParams = {
      search_query: params.search_query || 'all',
      id_list: params.id_list,
      start: params.start || 0,
      max_results: Math.min(params.max_results || 10, 2000),
      sortBy: params.sortBy || 'relevance',
      sortOrder: params.sortOrder || 'descending'
    };

    const response = await axios.get(this.baseUrl, {
      params: searchParams,
      timeout: 15000,
      headers: {
        'Accept': 'application/atom+xml'
      }
    });

    // Parse XML response to JSON-like structure
    return this.parseArxivResponse(response.data);
  }

  private parseArxivResponse(xmlData: string): ArxivResponse {
    // Simple XML parsing for ArXiv response
    // In production, you'd want to use a proper XML parser like xml2js
    const entries: ArxivEntry[] = [];
    
    // Extract basic info using regex (simplified approach)
    const entryMatches = xmlData.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    
    for (const entryXml of entryMatches) {
      const id = this.extractXmlValue(entryXml, 'id') || '';
      const title = this.extractXmlValue(entryXml, 'title') || '';
      const summary = this.extractXmlValue(entryXml, 'summary') || '';
      const updated = this.extractXmlValue(entryXml, 'updated') || '';
      const published = this.extractXmlValue(entryXml, 'published') || '';
      
      // Extract authors
      const authorMatches = entryXml.match(/<author>[\s\S]*?<\/author>/g) || [];
      const authors = authorMatches.map(authorXml => ({
        name: this.extractXmlValue(authorXml, 'name') || ''
      }));

      // Extract categories
      const categoryMatches = entryXml.match(/<category term="([^"]+)"/g) || [];
      const categories = categoryMatches.map(match => 
        match.match(/term="([^"]+)"/)?.[1] || ''
      ).filter(Boolean);

      // Extract links
      const linkMatches = entryXml.match(/<link href="([^"]+)" rel="([^"]+)"(?: type="([^"]+)")?/g) || [];
      const links = linkMatches.map(linkMatch => {
        const match = linkMatch.match(/href="([^"]+)" rel="([^"]+)"(?: type="([^"]+)")?/);
        return {
          href: match?.[1] || '',
          rel: match?.[2] || '',
          type: match?.[3]
        };
      });

      entries.push({
        id: id.replace('http://arxiv.org/abs/', ''),
        updated,
        published,
        title,
        summary,
        authors,
        links,
        categories
      });
    }

    // Extract feed metadata
    const totalResults = parseInt(this.extractXmlValue(xmlData, 'opensearch:totalResults') || '0');
    const startIndex = parseInt(this.extractXmlValue(xmlData, 'opensearch:startIndex') || '0');
    const itemsPerPage = parseInt(this.extractXmlValue(xmlData, 'opensearch:itemsPerPage') || '10');

    return {
      feed: {
        xmlns: 'http://www.w3.org/2005/Atom',
        xmlns_opensearch: 'http://a9.com/-/spec/opensearch/1.1/',
        xmlns_arxiv: 'http://arxiv.org/schemas/atom',
        link: [],
        title: 'ArXiv Query Results',
        id: 'http://arxiv.org/api/query',
        updated: new Date().toISOString(),
        totalResults,
        startIndex,
        itemsPerPage,
        entry: entries
      }
    };
  }

  private extractXmlValue(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  async getPaper(arxivId: string): Promise<ArxivResponse> {
    return this.search({ id_list: arxivId });
  }

  async searchByCategory(category: string, params: Omit<ArxivParams, 'search_query'> = {}): Promise<ArxivResponse> {
    return this.search({ 
      search_query: `cat:${category}`,
      ...params 
    });
  }
}
