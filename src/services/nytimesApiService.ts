import axios from 'axios';

export interface ArticleSearchParams {
  q?: string; // query
  fq?: string; // filtered query
  begin_date?: string; // YYYYMMDD
  end_date?: string; // YYYYMMDD
  sort?: 'newest' | 'oldest' | 'relevance';
  page?: number;
  facet_field?: string[];
  facet_filter?: boolean;
  fl?: string[]; // field list
}

export interface ArchiveParams {
  year: number;
  month: number;
  q?: string;
  fq?: string;
  f?: string; // facet field
  page?: number;
}

export interface NYTimesArticle {
  abstract: string;
  web_url: string;
  snippet: string;
  lead_paragraph: string;
  print_section?: string;
  print_page?: number;
  source: string;
  multimedia: Array<{
    rank: number;
    subtype: string;
    caption: string;
    credit: string;
    type: string;
    url: string;
    height: number;
    width: number;
    legacy: {
      xlarge: string;
      xlargewidth: number;
      xlargeheight: number;
    };
    subType: string;
    crop_name: string;
  }>;
  headline: {
    main: string;
    kicker?: string;
    content_kicker?: string;
    print_headline?: string;
    name?: string;
    seo?: string;
    sub?: string;
  };
  keywords: Array<{
    name: string;
    value: string;
    rank: number;
    major: string;
  }>;
  pub_date: string;
  document_type: string;
  news_desk: string;
  section_name: string;
  subsection_name?: string;
  byline: {
    original: string;
    person: Array<{
      firstname: string;
      middlename?: string;
      lastname: string;
      qualifier?: string;
      title?: string;
      role: string;
      organization: string;
    }>;
    organization?: string;
  };
  type_of_material: string;
  _id: string;
  word_count: number;
  uri: string;
}

export interface ArticleSearchResponse {
  status: string;
  copyright: string;
  response: {
    docs: NYTimesArticle[];
    meta: {
      hits: number;
      offset: number;
      time: number;
    };
  };
}

export interface ArchiveResponse {
  copyright: string;
  response: {
    docs: NYTimesArticle[];
    meta: {
      hits: number;
      offset: number;
      time: number;
    };
  };
}

export class NYTimesApiService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.nytimes.com/svc';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('NYTIMES_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  async searchArticles(params: ArticleSearchParams = {}): Promise<ArticleSearchResponse> {
    const url = `${this.baseUrl}/search/v2/articlesearch.json`;
    
    const requestParams: any = {
      'api-key': this.apiKey,
      ...params,
    };

    // Convert arrays to comma-separated strings for API
    if (params.facet_field) {
      requestParams['facet.field'] = params.facet_field.join(',');
    }
    if (params.fl) {
      requestParams.fl = params.fl.join(',');
    }

    const response = await axios.get(url, {
      params: requestParams,
      timeout: 15000,
    });

    return response.data;
  }

  async getArchiveArticles(params: ArchiveParams): Promise<ArchiveResponse> {
    const { year, month } = params;
    const url = `${this.baseUrl}/archive/v1/${year}/${month.toString().padStart(2, '0')}.json`;
    
    const requestParams: any = {
      'api-key': this.apiKey,
    };

    // Add optional parameters
    if (params.q) requestParams.q = params.q;
    if (params.fq) requestParams.fq = params.fq;
    if (params.f) requestParams.f = params.f;
    if (params.page) requestParams.page = params.page;

    const response = await axios.get(url, {
      params: requestParams,
      timeout: 15000,
    });

    return response.data;
  }

  // Helper method to convert NYTimes articles to a standardized format
  convertToStandardFormat(articles: NYTimesArticle[]) {
    return articles.map(article => ({
      id: article._id,
      title: article.headline.main,
      source: 'The New York Times',
      url: article.web_url,
      description: article.abstract || article.snippet || article.lead_paragraph,
      content: article.lead_paragraph,
      publishedAt: article.pub_date,
      author: article.byline?.original || 'The New York Times',
      section: article.section_name,
      subsection: article.subsection_name,
      news_desk: article.news_desk,
      word_count: article.word_count,
      keywords: article.keywords?.map(k => k.value).join(', ') || '',
      multimedia: article.multimedia || []
    }));
  }
}
