import {
  AgentRole,
  AgentContext,
  OrchestrationResult,
  AgentMetrics,
} from "./types";
import { UniversalMcpServer } from "../mcp/universalMcp";
import { PersonalizationService } from "../services/personalizationService";

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
  private metrics: AgentMetrics[] = [];

  constructor(
    openaiApiKey: string,
    mcpServer: UniversalMcpServer,
    personalizationService: PersonalizationService | null
  ) {
    this.personalizationService = personalizationService;

    // Initialize all agents
    this.coordinatorAgent = new CoordinatorAgent(personalizationService);
    this.newsAgent = new NewsAgent(mcpServer);
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
      const specialistResults = await this.executeSpecialistAgents(
        context,
        coordination.agentsToRun
      );

      logger.info("✅ All specialist agents complete", {
        newsArticles: specialistResults.news?.totalFetched || 0,
        hasSentiment: !!specialistResults.sentiment,
        hasTrend: !!specialistResults.trend,
        hasBias: !!specialistResults.bias,
      });

      // Phase 3: Personalization (sequential, needs specialist results)
      logger.info("🎯 Phase 3: Starting Personalization Agent...", { userId });
      context.rawData = specialistResults;
      const personalizationResult = await this.personalizationAgent.execute(
        context
      );

      logger.info("✅ Personalization complete", {
        rankedArticles: personalizationResult.data?.rankedArticles.length || 0,
        insights: personalizationResult.data?.personalizedInsights.length || 0,
      });

      // Add personalization to context
      specialistResults.personalization = personalizationResult.success
        ? personalizationResult.data
        : null;

      // Phase 4: Synthesis (final)
      logger.info("📝 Phase 4: Starting Synthesis Agent...");
      const synthesisResult = await this.synthesisAgent.execute(context);

      logger.info("✅ Synthesis complete", {
        reportLength: synthesisResult.data?.length || 0,
      });

      if (!synthesisResult.success) {
        throw new Error("Synthesis failed: " + synthesisResult.error);
      }

      // Calculate total execution time and costs
      const executionTimeMs = Date.now() - startTime;
      const estimatedCost = this.calculateTotalCost();

      // Extract sources
      const sources = this.extractSources(specialistResults);

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
  ): Promise<any> {
    const results: any = {};

    // Always run news agent first (others depend on it)
    if (agentsToRun.includes(AgentRole.NEWS)) {
      const newsResult = await this.newsAgent.execute(context);
      results.news = newsResult.success ? newsResult.data : null;

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
        }))
      );
    }

    if (agentsToRun.includes(AgentRole.TREND)) {
      parallelAgents.push(
        this.trendAgent.execute(context).then((result) => ({
          key: "trend",
          data: result.success ? result.data : null,
        }))
      );
    }

    if (agentsToRun.includes(AgentRole.BIAS)) {
      parallelAgents.push(
        this.biasAgent.execute(context).then((result) => ({
          key: "bias",
          data: result.success ? result.data : null,
        }))
      );
    }

    // Wait for all parallel agents to complete
    if (parallelAgents.length > 0) {
      const parallelResults = await Promise.allSettled(parallelAgents);

      parallelResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          results[result.value.key] = result.value.data;
        }
      });
    }

    return results;
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
        sources.push({
          provider: article.source,
          url: article.url,
          title: article.title,
        });
      });
    }

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
