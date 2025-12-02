import axios, { AxiosInstance } from 'axios';

export interface OpenAlexSearchParams {
  search?: string;
  filter?: string;
  sort?: string;
  per_page?: number;
  page?: number;
  cursor?: string;
  mailto?: string;
}

export interface OpenAlexConcept {
  id: string;
  display_name: string;
  level: number;
  score: number;
}

export interface OpenAlexAuthorship {
  author: {
    id: string;
    display_name: string;
    orcid?: string;
  };
  institutions: Array<{
    id: string;
    display_name: string;
    ror?: string;
    country_code?: string;
  }>;
}

export interface OpenAlexPrimaryLocation {
  source?: {
    id?: string;
    display_name?: string;
  };
  landing_page_url?: string;
  pdf_url?: string;
}

export interface OpenAlexWork {
  id: string;
  display_name: string;
  publication_year?: number;
  publication_date?: string;
  host_venue?: {
    display_name?: string;
    url?: string;
  };
  primary_location?: OpenAlexPrimaryLocation;
  abstract_inverted_index?: Record<string, number[]>;
  concepts?: OpenAlexConcept[];
  authorships?: OpenAlexAuthorship[];
  summary_stats?: {
    cited_by_count?: number;
    is_open_access?: boolean;
  };
  type?: string;
  language?: string;
  open_access?: {
    is_open_access?: boolean;
    oa_status?: string;
  };
}

export interface OpenAlexWorksResponse {
  results: OpenAlexWork[];
  meta: {
    count: number;
    db_response_time_ms: number;
    next_cursor?: string | null;
    per_page: number;
    page?: number;
  };
}

/**
 * Lightweight API client for OpenAlex.org
 *
 * The API is free but requests should include a contact email to
 * avoid being throttled. Provide OPENALEX_CONTACT_EMAIL in the env
 * and we'll append it automatically.
 */
export class OpenAlexApiService {
  private readonly client: AxiosInstance;
  private readonly contactEmail?: string;

  constructor(contactEmail?: string) {
    this.contactEmail = contactEmail;
    this.client = axios.create({
      baseURL: 'https://api.openalex.org',
      timeout: 15000,
      headers: {
        'User-Agent': 'LLMDevNewsAggregator/1.0 (+https://github.com/tylerpina/LLM_Dev_Final_Project)'
      }
    });
  }

  async searchWorks(params: OpenAlexSearchParams = {}): Promise<OpenAlexWorksResponse> {
    const response = await this.client.get('/works', {
      params: this.withContactInfo(params)
    });

    return response.data;
  }

  async getWork(openAlexId: string): Promise<OpenAlexWork> {
    const response = await this.client.get(`/works/${openAlexId}`, {
      params: this.withContactInfo()
    });

    return response.data;
  }

  private withContactInfo(params: Record<string, any> = {}): Record<string, any> {
    if (this.contactEmail && !params.mailto) {
      return { ...params, mailto: this.contactEmail };
    }
    return params;
  }

  /**
   * Helper to rebuild OpenAlex abstract indexes into readable text.
   * Exposed for downstream consumers that need plain strings.
   */
  static reconstructAbstract(index?: Record<string, number[]> | null): string {
    if (!index) {
      return '';
    }

    const positions: Array<{ word: string; position: number }> = [];
    for (const [word, indices] of Object.entries(index)) {
      indices.forEach(pos => positions.push({ word, position: pos }));
    }

    if (positions.length === 0) {
      return '';
    }

    positions.sort((a, b) => a.position - b.position);

    const orderedWords: string[] = [];
    positions.forEach(({ word, position }) => {
      orderedWords[position] = word;
    });

    return orderedWords.filter(Boolean).join(' ');
  }
}

