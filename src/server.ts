import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { UniversalMcpServer } from './mcp/universalMcp';
import { IntelligentQueryRouter } from './services/intelligentQueryRouter';
import logger from './utils/logger';

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Initialize MCP server with available API keys
const mcpServer = new UniversalMcpServer(
	process.env.NEWSAPI_KEY || '',
	process.env.GUARDIAN_API_KEY
);

// Initialize OpenAI-powered query router with bullet-point style by default
const queryRouter = new IntelligentQueryRouter(
	process.env.OPENAI_API_KEY || '',
	mcpServer,
	{
		responseStyle: 'bullet-points',
		includeGreeting: false,
		maxResponseLength: 400
	}
);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Request logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

// Log server startup
logger.info('Starting LLM Dev Project server...', {
  port,
  providers: mcpServer.getAvailableProviders(),
  hasOpenAI: !!process.env.OPENAI_API_KEY
});

app.get('/health', (_req, res) => {
	logger.info('Health check requested');
	res.json({ 
		status: 'ok',
		providers: mcpServer.getAvailableProviders(),
		timestamp: new Date().toISOString()
	});
});

// AI-powered conversational endpoint
app.post('/ask', async (req, res) => {
	const startTime = Date.now();
	const { query, style } = req.body;
	
	logger.info('AI query received', { query, style, timestamp: new Date().toISOString() });
	
	try {
		if (!query) {
			logger.warn('Empty query received');
			return res.status(400).json({ error: 'Query is required' });
		}

		// Apply style if provided
		if (style) {
			queryRouter.setResponseStyle(style);
			logger.info('Response style updated', { style });
		}

		const response = await queryRouter.processQuery(query);
		const duration = Date.now() - startTime;
		
		logger.info('AI query completed', {
			query,
			duration: `${duration}ms`,
			sources: response.analysis.sources,
			intent: response.analysis.intent,
			style: queryRouter.getPromptConfig().responseStyle
		});
		
		res.json(response);
	} catch (err: any) {
		const duration = Date.now() - startTime;
		logger.error('AI query failed', {
			query,
			duration: `${duration}ms`,
			error: err.message,
			stack: err.stack
		});
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// Prompt management endpoints
app.get('/prompts/config', (_req, res) => {
	logger.info('Prompt config requested');
	res.json(queryRouter.getPromptConfig());
});

app.post('/prompts/config', async (req, res) => {
	try {
		const { style, config } = req.body;
		
		if (style) {
			queryRouter.setResponseStyle(style);
			logger.info('Response style updated', { style });
		}
		
		if (config) {
			queryRouter.updatePromptConfig(config);
			logger.info('Prompt config updated', { config });
		}
		
		res.json({ 
			success: true, 
			currentConfig: queryRouter.getPromptConfig() 
		});
	} catch (err: any) {
		logger.error('Prompt config update failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/prompts/styles', (_req, res) => {
	logger.info('Available prompt styles requested');
	res.json({
		styles: ['professional', 'conversational', 'technical', 'bullet-points'],
		current: queryRouter.getPromptConfig().responseStyle
	});
});

// Legacy endpoint for backward compatibility
app.get('/news/top-headlines', async (req, res) => {
	logger.info('NewsAPI headlines requested', { query: req.query });
	try {
		const { country = 'us', category, q, pageSize, page } = req.query as Record<string, any>;
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/news/top-headlines',
			query: { country, category, q, pageSize, page },
			provider: 'newsapi'
		});
		logger.info('NewsAPI headlines retrieved', { 
			country, 
			category, 
			q, 
			resultCount: result.data?.articles?.length || 0 
		});
		res.json(result.data);
	} catch (err: any) {
		logger.error('NewsAPI headlines failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// Guardian-specific endpoints
app.get('/guardian/search', async (req, res) => {
	logger.info('Guardian search requested', { query: req.query });
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		logger.info('Guardian search completed', { 
			resultCount: result.data?.response?.results?.length || 0 
		});
		res.json(result);
	} catch (err: any) {
		logger.error('Guardian search failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/guardian/sections', async (req, res) => {
	logger.info('Guardian sections requested');
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/sections',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		logger.info('Guardian sections retrieved', { 
			sectionCount: result.data?.response?.results?.length || 0 
		});
		res.json(result);
	} catch (err: any) {
		logger.error('Guardian sections failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// ArXiv-specific endpoints
app.get('/arxiv/search', async (req, res) => {
	logger.info('ArXiv search requested', { query: req.query });
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		logger.info('ArXiv search completed', { 
			resultCount: result.data?.feed?.entry?.length || 0,
			totalResults: result.data?.feed?.totalResults || 0
		});
		res.json(result);
	} catch (err: any) {
		logger.error('ArXiv search failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/paper', async (req, res) => {
	logger.info('ArXiv paper requested', { query: req.query });
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/paper',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		logger.info('ArXiv paper retrieved', { 
			paperId: req.query.id,
			hasResults: !!result.data?.feed?.entry?.length 
		});
		res.json(result);
	} catch (err: any) {
		logger.error('ArXiv paper failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/category', async (req, res) => {
	logger.info('ArXiv category search requested', { query: req.query });
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/category',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		logger.info('ArXiv category search completed', { 
			category: req.query.category,
			resultCount: result.data?.feed?.entry?.length || 0
		});
		res.json(result);
	} catch (err: any) {
		logger.error('ArXiv category search failed', { error: err.message });
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.listen(port, () => {
	logger.info('Server started successfully', {
		port,
		providers: mcpServer.getAvailableProviders(),
		aiEnabled: !!process.env.OPENAI_API_KEY
	});
	console.log(`🚀 Server listening on port ${port}`);
	console.log(`📊 Available providers: ${mcpServer.getAvailableProviders().join(', ')}`);
	console.log(`🤖 AI-powered endpoint: POST /ask`);
	console.log(`🌐 Web UI: http://localhost:${port}`);
});

app.get('/health', (_req, res) => {
	res.json({ 
		status: 'ok',
		providers: mcpServer.getAvailableProviders(),
		timestamp: new Date().toISOString()
	});
});

// AI-powered conversational endpoint
app.post('/ask', async (req, res) => {
	try {
		const { query } = req.body;
		if (!query) {
			return res.status(400).json({ error: 'Query is required' });
		}

		const response = await queryRouter.processQuery(query);
		res.json(response);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// Legacy endpoint for backward compatibility
app.get('/news/top-headlines', async (req, res) => {
	try {
		const { country = 'us', category, q, pageSize, page } = req.query as Record<string, any>;
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/news/top-headlines',
			query: { country, category, q, pageSize, page },
			provider: 'newsapi'
		});
		res.json(result.data);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// Guardian-specific endpoints
app.get('/guardian/search', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/guardian/sections', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/sections',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// ArXiv-specific endpoints
app.get('/arxiv/search', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/paper', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/paper',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/category', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/category',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
	console.log(`Available providers: ${mcpServer.getAvailableProviders().join(', ')}`);
	console.log(`AI-powered endpoint: POST /ask`);
});

app.get('/health', (_req, res) => {
	res.json({ 
		status: 'ok',
		providers: mcpServer.getAvailableProviders(),
		timestamp: new Date().toISOString()
	});
});

// Legacy endpoint for backward compatibility
app.get('/news/top-headlines', async (req, res) => {
	try {
		const { country = 'us', category, q, pageSize, page } = req.query as Record<string, any>;
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/news/top-headlines',
			query: { country, category, q, pageSize, page },
			provider: 'newsapi'
		});
		res.json(result.data);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// Guardian-specific endpoints
app.get('/guardian/search', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/guardian/sections', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/guardian/sections',
			query: req.query as Record<string, string | string[]>,
			provider: 'guardian'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

// ArXiv-specific endpoints
app.get('/arxiv/search', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/search',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/paper', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/paper',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
	} catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.get('/arxiv/category', async (req, res) => {
	try {
		const result = await mcpServer.handle({
			method: 'GET',
			path: '/arxiv/category',
			query: req.query as Record<string, string | string[]>,
			provider: 'arxiv'
		});
		res.json(result);
  } catch (err: any) {
		res.status(500).json({ error: err?.message || 'Unknown error' });
	}
});

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
	console.log(`Available providers: ${mcpServer.getAvailableProviders().join(', ')}`);
});
