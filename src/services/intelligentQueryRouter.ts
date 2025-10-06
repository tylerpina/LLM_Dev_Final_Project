import OpenAI from 'openai';
import { UniversalMcpServer } from '../mcp/universalMcp';
import { PromptManager, PromptConfig } from './promptManager';

export interface QueryAnalysis {
  intent: 'news' | 'research' | 'analysis' | 'trend' | 'general';
  sources: string[]; // which APIs to query
  searchTerms: string[];
  maxResults: number;
  requiresSynthesis: boolean;
}

export interface QueryResponse {
  analysis: QueryAnalysis;
  rawData: any[];
  synthesizedResponse: string;
  sources: Array<{
    provider: string;
    url?: string;
    title?: string;
  }>;
  timestamp: string;
}

export class IntelligentQueryRouter {
  private openai: OpenAI;
  private mcpServer: UniversalMcpServer;
  private promptManager: PromptManager;

  constructor(openaiKey: string, mcpServer: UniversalMcpServer, promptConfig?: Partial<PromptConfig>) {
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.mcpServer = mcpServer;
    this.promptManager = new PromptManager(promptConfig);
  }

  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const prompt = this.promptManager.getAnalysisPrompt(query);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150  // Reduced for cost savings
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      return analysis as QueryAnalysis;
    } catch (error) {
      // Fallback analysis
      return {
        intent: 'general',
        sources: ['newsapi'],
        searchTerms: [query],
        maxResults: 5,
        requiresSynthesis: true
      };
    }
  }

  async executeQuery(analysis: QueryAnalysis): Promise<any[]> {
    const results: any[] = [];

    for (const source of analysis.sources) {
      try {
        let result;
        
        if (source === 'newsapi') {
          result = await this.mcpServer.handle({
            method: 'GET',
            path: '/news/top-headlines',
            query: {
              q: analysis.searchTerms.join(' '),
              pageSize: analysis.maxResults.toString()
            },
            provider: 'newsapi'
          });
        } else if (source === 'guardian') {
          result = await this.mcpServer.handle({
            method: 'GET',
            path: '/guardian/search',
            query: {
              q: analysis.searchTerms.join(' '),
              'page-size': analysis.maxResults.toString()
            },
            provider: 'guardian'
          });
        } else if (source === 'arxiv') {
          result = await this.mcpServer.handle({
            method: 'GET',
            path: '/arxiv/search',
            query: {
              search_query: analysis.searchTerms.join('+'),
              max_results: analysis.maxResults.toString()
            },
            provider: 'arxiv'
          });
        }

        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error querying ${source}:`, error);
      }
    }

    return results;
  }

  async synthesizeResponse(query: string, rawData: any[]): Promise<string> {
    const dataSummary = rawData.map(result => {
      const provider = result.provider;
      const data = result.data;
      
      if (provider === 'newsapi') {
        return `NewsAPI: ${data.articles?.slice(0, 3).map((a: any) => `${a.title} - ${a.source?.name}`).join('; ')}`;
      } else if (provider === 'guardian') {
        return `Guardian: ${data.response?.results?.slice(0, 3).map((r: any) => `${r.webTitle}`).join('; ')}`;
      } else if (provider === 'arxiv') {
        return `ArXiv: ${data.feed?.entry?.slice(0, 3).map((e: any) => `${e.title}`).join('; ')}`;
      }
      return `${provider}: Data available`;
    }).join('\n');

    const prompt = this.promptManager.getSynthesisPrompt(query, dataSummary);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: this.promptManager.getMaxTokens()
      });

      return response.choices[0].message.content || 'Unable to generate response';
    } catch (error) {
      return 'Error generating synthesized response';
    }
  }

  async processQuery(query: string): Promise<QueryResponse> {
    // Step 1: Analyze the query
    const analysis = await this.analyzeQuery(query);
    
    // Step 2: Execute queries across sources
    const rawData = await this.executeQuery(analysis);
    
    // Step 3: Synthesize response
    const synthesizedResponse = await this.synthesizeResponse(query, rawData);
    
    // Step 4: Extract source information
    const sources = rawData.map(result => ({
      provider: result.provider,
      url: result.data?.articles?.[0]?.url || result.data?.response?.results?.[0]?.webUrl || result.data?.feed?.entry?.[0]?.links?.[0]?.href,
      title: result.data?.articles?.[0]?.title || result.data?.response?.results?.[0]?.webTitle || result.data?.feed?.entry?.[0]?.title
    }));

    return {
      analysis,
      rawData,
      synthesizedResponse,
      sources,
      timestamp: new Date().toISOString()
    };
  }

  // Method to update prompt configuration
  updatePromptConfig(config: Partial<PromptConfig>) {
    this.promptManager.updateConfig(config);
  }

  // Method to change response style
  setResponseStyle(style: string) {
    this.promptManager.setResponseStyle(style);
  }

  // Method to get current configuration
  getPromptConfig(): PromptConfig {
    return this.promptManager.getConfig();
  }
}
