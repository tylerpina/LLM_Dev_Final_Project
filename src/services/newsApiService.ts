import axios from 'axios';

export interface TopHeadlinesParams {
	country?: string; // e.g., 'us'
	category?: string; // e.g., 'technology'
	q?: string; // query
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
		const response = await axios.get(url, {
			params: {
				apiKey: this.apiKey,
				...params,
			},
			timeout: 10000,
		});
		return response.data;
	}
}
