import axios from 'axios';

export interface GuardianParams {
  q?: string; // query
  section?: string; // e.g., 'technology', 'world'
  page?: number;
  'page-size'?: number;
  'from-date'?: string; // YYYY-MM-DD
  'to-date'?: string; // YYYY-MM-DD
}

export class GuardianApiService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://content.guardianapis.com';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GUARDIAN_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  async search(params: GuardianParams = {}) {
    const url = `${this.baseUrl}/search`;
    const response = await axios.get(url, {
      params: {
        'api-key': this.apiKey,
        'show-fields': 'headline,trailText,thumbnail,short-url',
        ...params,
      },
      timeout: 10000,
    });
    return response.data;
  }

  async getSections() {
    const url = `${this.baseUrl}/sections`;
    const response = await axios.get(url, {
      params: {
        'api-key': this.apiKey,
      },
      timeout: 10000,
    });
    return response.data;
  }
}