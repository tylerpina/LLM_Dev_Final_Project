import { NewsApiService } from '../services/newsApiService';

export interface McpRequest {
	method: string;
	path: string;
	query?: Record<string, string | string[]>;
}

export class NewsMcpServer {
	private readonly news: NewsApiService;

	constructor(apiKey: string) {
		this.news = new NewsApiService(apiKey);
	}

	async handle(req: McpRequest): Promise<any> {
		if (req.method === 'GET' && req.path === '/news/top-headlines') {
			const { country, category, q, pageSize, page } = req.query || {};
			return this.news.getTopHeadlines({
				country: (country as string) || 'us',
				category: category as string | undefined,
				q: q as string | undefined,
				pageSize: pageSize ? Number(pageSize) : undefined,
				page: page ? Number(page) : undefined,
			});
		}
		throw new Error('Unsupported method/path');
	}
}
