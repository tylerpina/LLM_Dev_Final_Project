import {
  AgentRole,
  AgentContext,
  OrchestrationResult,
  AgentMetrics,
} from "./types";
import { UniversalMcpServer } from "../mcp/universalMcp";
import { PersonalizationService } from "../services/personalizationService";
import { DatabaseService } from "../services/databaseService";

// Import all agents
import { CoordinatorAgent } from "./coordination/coordinatorAgent";
import { NewsAgent } from "./specialists/newsAgent";
import { SentimentAgent } from "./specialists/sentimentAgent";
import { TrendAgent } from "./specialists/trendAgent";
import { BiasAgent } from "./specialists/biasAgent";
import { PersonalizationAgent } from "./coordination/personalizationAgent";
import { SynthesisAgent } from "./coordination/synthesisAgent";

import { estimateCost, SYSTEM_CONFIG } from "./config";
import logger from "../utils/logger";

/**
 * Multi-Agent Orchestrator
 * Coordinates execution of all agents in the system
 */
export class MultiAgentOrchestrator {
  private coordinatorAgent: CoordinatorAgent;
  private newsAgent: NewsAgent;
  private sentimentAgent: SentimentAgent;
  private trendAgent: TrendAgent;
  private biasAgent: BiasAgent;
  private personalizationAgent: PersonalizationAgent;
  private synthesisAgent: SynthesisAgent;

  private personalizationService: PersonalizationService | null;
  private databaseService: DatabaseService | null;
  private metrics: AgentMetrics[] = [];

  constructor(
    openaiApiKey: string,
    mcpServer: UniversalMcpServer,
    personalizationService: PersonalizationService | null,
    databaseService: DatabaseService | null = null
  ) {
    this.personalizationService = personalizationService;
    this.databaseService = databaseService;

    // Initialize all agents
    this.coordinatorAgent = new CoordinatorAgent(personalizationService);
    this.newsAgent = new NewsAgent(mcpServer, databaseService);
    this.sentimentAgent = new SentimentAgent();
    this.trendAgent = new TrendAgent();
    this.biasAgent = new BiasAgent();
    this.personalizationAgent = new PersonalizationAgent(
      personalizationService
    );
    this.synthesisAgent = new SynthesisAgent();

    logger.info("MultiAgentOrchestrator initialized", {
      hasPersonalization: !!personalizationService,
    });
  }

  /**
   * Main entry point: Process a user query through the multi-agent system
   */
  async processQuery(
    query: string,
    userId: string = "anonymous"
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.metrics = []; // Reset metrics

    logger.info("🚀 Multi-agent orchestration started", { query, userId });

    try {
      // Phase 1: Coordination - Analyze query and plan execution
      logger.info("📋 Phase 1: Starting Coordinator Agent...", { query });
      const context: AgentContext = {
        query,
        userId,
        timestamp: new Date(),
      };

      const coordinationResult = await this.coordinatorAgent.execute(context);

      // Collect agent reasoning
      const agentReasoning: { [key in AgentRole]?: string } = {};
      if (coordinationResult.reasoning) {
        agentReasoning[AgentRole.COORDINATOR] = coordinationResult.reasoning;
      }

      if (!coordinationResult.success) {
        throw new Error("Coordination failed: " + coordinationResult.error);
      }

      const coordination = coordinationResult.data;
      logger.info("✅ Coordinator complete", {
        intent: coordination.intent,
        agentsToRun: coordination.agentsToRun,
        searchTerms: coordination.searchTerms,
      });

      // Update context with coordination results
      context.searchTerms = coordination.searchTerms;
      context.intent = coordination.intent;
      context.agentsToRun = coordination.agentsToRun;
      context.userProfile = this.personalizationService?.getUserProfile(userId);

      // Phase 2: Execute specialist agents in parallel
      logger.info("⚡ Phase 2: Starting specialist agents in parallel...", {
        agents: coordination.agentsToRun,
      });
      const specialistExecution = await this.executeSpecialistAgents(
        context,
        coordination.agentsToRun
      );
      const specialistResults = specialistExecution.results;
      
      // Collect reasoning from specialist agents
      Object.assign(agentReasoning, specialistExecution.reasoning);

      logger.info("✅ All specialist agents complete", {
        newsArticles: specialistResults.news?.totalFetched || 0,
        hasSentiment: !!specialistResults.sentiment,
        hasTrend: !!specialistResults.trend,
        hasBias: !!specialistResults.bias,
      });

      // Fallback: If no articles were fetched due to API timeouts, use cached headlines
      if (specialistResults.news?.totalFetched === 0 && this.databaseService) {
        logger.info("📰 API calls failed, falling back to cached headlines...");
        try {
          const cachedHeadlines = this.databaseService.getBalancedHeadlines(20);
          if (cachedHeadlines.length > 0) {
            // Convert cached headlines to the format expected by other agents
            const cachedArticles = cachedHeadlines.map(headline => ({
              title: headline.title,
              description: headline.description || '',
              source: headline.source,
              url: headline.url,
              publishedAt: headline.publishedAt,
            }));

            // Update the news results with cached data
            specialistResults.news = {
              articles: cachedArticles,
              totalFetched: cachedArticles.length,
              sources: ['cached'],
              searchTermsUsed: context.searchTerms || [context.query],
            };

            logger.info("✅ Using cached headlines as fallback", {
              count: cachedArticles.length,
              sources: [...new Set(cachedHeadlines.map(h => h.source))],
            });
          }
        } catch (error) {
          logger.error("Failed to fetch cached headlines as fallback", error);
        }
      }

      // Phase 3: Personalization (sequential, needs specialist results)
      logger.info("🎯 Phase 3: Starting Personalization Agent...", { userId });
      context.rawData = specialistResults;
      const personalizationResult = await this.personalizationAgent.execute(
        context
      );

      // Collect reasoning from personalization agent
      if (personalizationResult.reasoning) {
        agentReasoning[AgentRole.PERSONALIZATION] = personalizationResult.reasoning;
      }

      logger.info("✅ Personalization complete", {
        rankedArticles: personalizationResult.data?.rankedArticles.length || 0,
        insights: personalizationResult.data?.personalizedInsights.length || 0,
      });

      // Add personalization to context
      specialistResults.personalization = personalizationResult.success
        ? personalizationResult.data
        : null;

      // Extract sources and add to context for synthesis
      const sources = this.extractSources(specialistResults);
      context.sources = sources; // Add sources to context so synthesis agent can include them

      // Phase 4: Synthesis (final)
      logger.info("📝 Phase 4: Starting Synthesis Agent...");
      const synthesisResult = await this.synthesisAgent.execute(context);

      // Collect reasoning from synthesis agent
      if (synthesisResult.reasoning) {
        agentReasoning[AgentRole.SYNTHESIS] = synthesisResult.reasoning;
      }

      logger.info("✅ Synthesis complete", {
        reportLength: synthesisResult.data?.length || 0,
      });

      if (!synthesisResult.success) {
        throw new Error("Synthesis failed: " + synthesisResult.error);
      }

      // Calculate total execution time and costs
      const executionTimeMs = Date.now() - startTime;
      const estimatedCost = this.calculateTotalCost();

      // Debug agent reasoning
      console.log('Collected agent reasoning:', agentReasoning);

      // Build final result
      const result: OrchestrationResult = {
        synthesizedResponse: synthesisResult.data,
        agentsExecuted: [
          AgentRole.COORDINATOR,
          ...coordination.agentsToRun,
          AgentRole.PERSONALIZATION,
          AgentRole.SYNTHESIS,
        ],
        executionTimeMs,
        estimatedCost,
        sources,
        metadata: {
          coordination,
          news: specialistResults.news,
          sentiment: specialistResults.sentiment,
          trend: specialistResults.trend,
          bias: specialistResults.bias,
          personalization: specialistResults.personalization,
        },
        agentReasoning,
        timestamp: new Date().toISOString(),
      };

      logger.info("🎉 Multi-agent orchestration completed", {
        executionTimeMs,
        estimatedCost: `$${estimatedCost.toFixed(4)}`,
        totalAgents: result.agentsExecuted.length,
        query,
        userId,
      });

      return result;
    } catch (error: any) {
      logger.error("Multi-agent orchestration failed", {
        error: error.message,
        stack: error.stack,
      });

      // Return error response
      return this.createErrorResponse(
        query,
        error.message,
        Date.now() - startTime
      );
    }
  }

  /**
   * Execute specialist agents in parallel
   */
  private async executeSpecialistAgents(
    context: AgentContext,
    agentsToRun: AgentRole[]
  ): Promise<{ results: any; reasoning: { [key in AgentRole]?: string } }> {
    const results: any = {};
    const reasoning: { [key in AgentRole]?: string } = {};

    // Always run news agent first (others depend on it)
    if (agentsToRun.includes(AgentRole.NEWS)) {
      const newsResult = await this.newsAgent.execute(context);
      results.news = newsResult.success ? newsResult.data : null;
      if (newsResult.reasoning) {
        reasoning[AgentRole.NEWS] = newsResult.reasoning;
      }

      // Update context with news data for other agents
      context.rawData = { articles: results.news?.articles || [] };
    }

    // Run remaining specialist agents in parallel
    const parallelAgents: Promise<any>[] = [];

    if (agentsToRun.includes(AgentRole.SENTIMENT)) {
      parallelAgents.push(
        this.sentimentAgent.execute(context).then((result) => ({
          key: "sentiment",
          data: result.success ? result.data : null,
          reasoning: result.reasoning,
          role: AgentRole.SENTIMENT,
        }))
      );
    }

    if (agentsToRun.includes(AgentRole.TREND)) {
      parallelAgents.push(
        this.trendAgent.execute(context).then((result) => ({
          key: "trend",
          data: result.success ? result.data : null,
          reasoning: result.reasoning,
          role: AgentRole.TREND,
        }))
      );
    }

    if (agentsToRun.includes(AgentRole.BIAS)) {
      parallelAgents.push(
        this.biasAgent.execute(context).then((result) => ({
          key: "bias",
          data: result.success ? result.data : null,
          reasoning: result.reasoning,
          role: AgentRole.BIAS,
        }))
      );
    }

    // Wait for all parallel agents to complete
    if (parallelAgents.length > 0) {
      const parallelResults = await Promise.allSettled(parallelAgents);

      parallelResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          results[result.value.key] = result.value.data;
          if (result.value.reasoning && result.value.role) {
            const role = result.value.role as AgentRole;
            reasoning[role] = result.value.reasoning;
          }
        }
      });
    }

    return { results, reasoning };
  }

  /**
   * Calculate total cost across all agents
   */
  private calculateTotalCost(): number {
    // Estimate based on typical token usage per agent
    const estimatedTokens = {
      coordinator: { input: 300, output: 150 },
      news: { input: 500, output: 200 },
      sentiment: { input: 1000, output: 300 },
      trend: { input: 1000, output: 300 },
      bias: { input: 1000, output: 300 },
      personalization: { input: 800, output: 400 },
      synthesis: { input: 2000, output: 1500 },
    };

    let totalCost = 0;

    Object.entries(estimatedTokens).forEach(([agent, tokens]) => {
      const model = agent === "synthesis" ? "gpt-4o" : "gpt-4o-mini";
      totalCost += estimateCost(model, tokens.input, tokens.output);
    });

    return totalCost;
  }

  /**
   * Extract sources from specialist results
   */
  private extractSources(results: any): OrchestrationResult["sources"] {
    const sources: OrchestrationResult["sources"] = [];

    if (results.news?.articles) {
      results.news.articles.forEach((article: any) => {
        // Debug logging
        console.log('Extracting source for article:', {
          title: article.title,
          source: article.source,
          url: article.url
        });

        // If source is still "newsapi" or generic, try to extract from URL
        let sourceName = article.source;
        if (sourceName === "newsapi" || sourceName === "NewsAPI" || !sourceName || sourceName === "") {
          try {
            if (article.url) {
              const url = new URL(article.url);
              const hostname = url.hostname.replace('www.', '');
              
              // Map common domains to proper names
              const domainMap: Record<string, string> = {
                'cnn.com': 'CNN',
                'bbc.com': 'BBC News',
                'reuters.com': 'Reuters',
                'nytimes.com': 'The New York Times',
                'washingtonpost.com': 'The Washington Post',
                'theguardian.com': 'The Guardian',
                'npr.org': 'NPR',
                'ap.org': 'Associated Press',
                'foxnews.com': 'Fox News',
                'msnbc.com': 'MSNBC',
                'cbsnews.com': 'CBS News',
                'abcnews.go.com': 'ABC News',
                'nbcnews.com': 'NBC News'
              };
              
              // Try exact domain match first
              if (domainMap[hostname]) {
                sourceName = domainMap[hostname];
              } else {
                // Extract from hostname and format properly
                const parts = hostname.split('.');
                const domain = parts[0];
                sourceName = domain.charAt(0).toUpperCase() + domain.slice(1);
                
                // Handle special cases
                if (sourceName === 'Cnn') sourceName = 'CNN';
                if (sourceName === 'Bbc') sourceName = 'BBC News';
                if (sourceName === 'Npr') sourceName = 'NPR';
              }
              
              console.log('Extracted source name from URL:', sourceName);
            } else {
              sourceName = "Unknown Source";
            }
          } catch {
            sourceName = "Unknown Source";
          }
        }
        
        sources.push({
          provider: sourceName,
          url: article.url,
          title: article.title,
        });
      });
    }

    console.log('Final extracted sources:', sources);
    return sources;
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    query: string,
    error: string,
    executionTimeMs: number
  ): OrchestrationResult {
    return {
      synthesizedResponse: `## Error Processing Query

I encountered an error while processing your query: "${query}"

**Error:** ${error}

Please try again or rephrase your query.`,
      agentsExecuted: [AgentRole.COORDINATOR],
      executionTimeMs,
      estimatedCost: 0,
      sources: [],
      metadata: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Process query with detailed agent outputs (for debugging)
   */
  async processQueryDetailed(
    query: string,
    userId: string = "anonymous"
  ): Promise<any> {
    const context: AgentContext = {
      query,
      userId,
      timestamp: new Date(),
    };

    // Execute all agents and return their individual outputs
    const coordinatorResult = await this.coordinatorAgent.execute(context);

    context.searchTerms = coordinatorResult.data?.searchTerms;
    context.intent = coordinatorResult.data?.intent;

    const newsResult = await this.newsAgent.execute(context);
    context.rawData = { articles: newsResult.data?.articles || [] };

    const sentimentResult = await this.sentimentAgent.execute(context);
    const trendResult = await this.trendAgent.execute(context);
    const biasResult = await this.biasAgent.execute(context);

    const specialistResults: any = {
      news: newsResult.data,
      sentiment: sentimentResult.data,
      trend: trendResult.data,
      bias: biasResult.data,
    };
    context.rawData = specialistResults;

    const personalizationResult = await this.personalizationAgent.execute(
      context
    );
    specialistResults.personalization = personalizationResult.data;

    const synthesisResult = await this.synthesisAgent.execute(context);

    return {
      coordinatorOutput: coordinatorResult,
      newsAgentOutput: newsResult,
      sentimentAgentOutput: sentimentResult,
      trendAgentOutput: trendResult,
      biasAgentOutput: biasResult,
      personalizationOutput: personalizationResult,
      synthesisOutput: synthesisResult,
    };
  }
}
