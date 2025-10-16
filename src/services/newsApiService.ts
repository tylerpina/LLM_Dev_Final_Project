import axios from 'axios';

export interface TopHeadlinesParams {
	country?: string; // e.g., 'us'
	category?: string; // e.g., 'technology'
	q?: string; // query
	pageSize?: number;
	page?: number;
}

export interface EverythingParams {
	q: string; // Search query (required)
	searchIn?: string; // 'title', 'description', or 'content'
	sources?: string; // Comma-separated source IDs
	domains?: string; // Comma-separated domains
	excludeDomains?: string;
	from?: string; // Date in ISO format
	to?: string; // Date in ISO format
	language?: string; // e.g., 'en'
	sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
	pageSize?: number;
	page?: number;
}

export class NewsApiService {
	private readonly apiKey: string;
	private readonly baseUrl = 'https://newsapi.org/v2';

	constructor(apiKey: string) {
		if (!apiKey) {
			throw new Error('NEWSAPI_KEY is required');
		}
		this.apiKey = apiKey;
	}

	async getTopHeadlines(params: TopHeadlinesParams = {}) {
		const url = `${this.baseUrl}/top-headlines`;
		
		try {
			const response = await axios.get(url, {
				params: {
					apiKey: this.apiKey,
					...params,
				},
				timeout: 10000,
			});
			
			console.log(`[NewsAPI] Fetched ${response.data?.articles?.length || 0} articles`);
			return response.data;
		} catch (error: any) {
			console.error('[NewsAPI] Error fetching headlines:', {
				message: error.message,
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data
			});
			throw error;
		}
	}

	async searchEverything(params: EverythingParams) {
		const url = `${this.baseUrl}/everything`;
		
		try {
			const response = await axios.get(url, {
				params: {
					apiKey: this.apiKey,
					...params,
				},
				timeout: 10000,
			});
			
			console.log(`[NewsAPI Everything] Fetched ${response.data?.articles?.length || 0} articles for query: ${params.q}`);
			return response.data;
		} catch (error: any) {
			console.error('[NewsAPI Everything] Error searching:', {
				message: error.message,
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
				query: params.q
			});
			throw error;
		}
	}
}
