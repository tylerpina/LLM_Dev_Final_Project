import OpenAI from 'openai';
import { UniversalMcpServer } from '../mcp/universalMcp';
import { PromptManager, PromptConfig } from './promptManager';
import { VectorStore } from './vectorStore';
import { EmbeddingService } from './embeddingService';

export interface QueryAnalysis {
  intent: 'news' | 'research' | 'analysis' | 'trend' | 'general';
  sources: string[]; // which APIs to query
  searchTerms: string[];
  maxResults: number;
  requiresSynthesis: boolean;
  dateRange?: {
    startDate: string | null;
    endDate: string | null;
  };
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
  private vectorStore?: VectorStore;
  private embeddingService?: EmbeddingService;

  constructor(
    openaiKey: string, 
    mcpServer: UniversalMcpServer, 
    promptConfig?: Partial<PromptConfig>,
    vectorStore?: VectorStore,
    embeddingService?: EmbeddingService
  ) {
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.mcpServer = mcpServer;
    this.promptManager = new PromptManager(promptConfig);
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
  }

  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const prompt = this.promptManager.getAnalysisPrompt(query);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0].message.content || '{}';
      const analysis = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
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
    const { dateRange } = analysis;

    // Perform Semantic Search if available and relevant
    if (this.vectorStore && this.embeddingService && (analysis.intent === 'research' || analysis.intent === 'analysis' || analysis.intent === 'general')) {
      try {
        const queryEmbedding = await this.embeddingService.generateEmbedding(analysis.searchTerms.join(' '));
        const searchResults = this.vectorStore.query(queryEmbedding, analysis.maxResults);
        
        if (searchResults.length > 0) {
          results.push({
            provider: 'semantic-search',
            data: searchResults,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error performing semantic search:', error);
      }
    }

    for (const source of analysis.sources) {
      try {
        let result;
        
        if (source === 'newsapi') {
          if (dateRange?.startDate) {
            const queryParams: Record<string, string> = {
              q: analysis.searchTerms.join(' '),
              pageSize: analysis.maxResults.toString(),
              from: dateRange.startDate,
              sortBy: 'relevancy'
            };
            
            if (dateRange.endDate) {
              queryParams.to = dateRange.endDate;
            }

            // Use /everything endpoint for date filtering
            result = await this.mcpServer.handle({
              method: 'GET',
              path: '/news/everything',
              query: queryParams,
              provider: 'newsapi'
            });
          } else {
            // Use top-headlines for general queries
            result = await this.mcpServer.handle({
              method: 'GET',
              path: '/news/top-headlines',
              query: {
                q: analysis.searchTerms.join(' '),
                pageSize: analysis.maxResults.toString()
              },
              provider: 'newsapi'
            });
          }
        } else if (source === 'guardian') {
          const query: Record<string, string> = {
            q: analysis.searchTerms.join(' '),
            'page-size': analysis.maxResults.toString()
          };
          
          if (dateRange?.startDate) {
            query['from-date'] = dateRange.startDate;
          }
          if (dateRange?.endDate) {
            query['to-date'] = dateRange.endDate;
          }

          result = await this.mcpServer.handle({
            method: 'GET',
            path: '/guardian/search',
            query,
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
      } else if (provider === 'semantic-search') {
        return `Local Context (Semantic): ${data.slice(0, 3).map((r: any) => r.document.substring(0, 100) + '...').join('; ')}`;
      }
      return `${provider}: Data available`;
    }).join('\n');

    const prompt = this.promptManager.getSynthesisPrompt(query, dataSummary);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
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
    const sources = rawData.flatMap(result => {
      if (result.provider === 'semantic-search') {
        return result.data.map((item: any) => ({
          provider: 'semantic-search',
          url: item.metadata?.url,
          title: item.metadata?.title
        }));
      }

      const item = result.data?.articles?.[0] || result.data?.response?.results?.[0] || result.data?.feed?.entry?.[0];
      if (item) {
        return [{
          provider: result.provider,
          url: item.url || item.webUrl || item.links?.[0]?.href,
          title: item.title || item.webTitle
        }];
      }
      return [];
    });

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
