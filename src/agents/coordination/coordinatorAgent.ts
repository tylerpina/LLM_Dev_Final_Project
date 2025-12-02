import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext, CoordinationResult } from "../types";
import { PersonalizationService } from "../../services/personalizationService";

/**
 * Coordinator Agent
 * Analyzes queries, loads user profiles, and decides orchestration strategy
 */
export class CoordinatorAgent extends BaseAgent<CoordinationResult> {
  private personalizationService: PersonalizationService | null;

  constructor(personalizationService: PersonalizationService | null) {
    super(AgentRole.COORDINATOR);
    this.personalizationService = personalizationService;
  }

  protected async process(context: AgentContext): Promise<CoordinationResult> {
    this.log("info", "🎯 CoordinatorAgent: Analyzing query intent...");

    // Step 1: Load user profile if available
    const userProfile = this.personalizationService?.getUserProfile(
      context.userId
    );

    if (userProfile) {
      this.log("info", "🎯 CoordinatorAgent: User profile loaded", {
        interests: userProfile.interests.slice(0, 3),
        interactionCount: userProfile.interactionCount,
      });
    }

    // Step 2: Analyze query intent and requirements
    const analysis = await this.analyzeQuery(context.query, userProfile);

    // Step 3: Build user context
    const userContext = {
      interests: userProfile?.interests || [],
      recentQueries: [], // Could be enhanced to track recent queries
      hasHistory: !!userProfile && userProfile.interactionCount > 0,
    };

    this.log("info", "🎯 CoordinatorAgent: Planning complete", {
      intent: analysis.intent,
      agentsToRun: analysis.agentsToRun,
      searchTerms: analysis.searchTerms,
      priority: analysis.priority,
    });

    return {
      intent: analysis.intent as CoordinationResult["intent"],
      agentsToRun: analysis.agentsToRun,
      searchTerms: analysis.searchTerms,
      userContext,
      priority: analysis.priority as CoordinationResult["priority"],
    };
  }

  /**
   * Analyze query to determine intent and strategy
   */
  private async analyzeQuery(query: string, userProfile?: any) {
    try {
      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          intent: z
            .enum([
              "news",
              "research",
              "analysis",
              "comparison",
              "trend",
              "general",
            ])
            .describe("Primary intent of the query"),
          searchTerms: z
            .array(z.string())
            .describe("Key search terms to use for fetching articles"),
          needsSentiment: z
            .boolean()
            .describe("Whether sentiment analysis would be valuable"),
          needsTrend: z
            .boolean()
            .describe("Whether trend detection would be valuable"),
          needsBias: z
            .boolean()
            .describe("Whether bias analysis would be valuable"),
          priority: z
            .enum(["speed", "depth", "balanced"])
            .describe(
              "Priority: speed (quick answer), depth (thorough analysis), or balanced"
            ),
          complexity: z
            .number()
            .min(1)
            .max(5)
            .describe("Query complexity (1=simple, 5=very complex)"),
        }),
        prompt: `Analyze this user query to determine the best strategy for gathering and analyzing news.

Query: "${query}"

${
  userProfile
    ? `User has history with interests in: ${userProfile.interests
        .slice(0, 5)
        .join(", ")}`
    : "New user with no history"
}

Determine:
1. Primary intent (news, research, analysis, comparison, trend, general)
2. Key search terms (2-5 terms)
3. Which analyses would be valuable:
   - Sentiment analysis (for understanding tone and emotions)
   - Trend detection (for identifying patterns and emerging themes)
   - Bias analysis (for diverse perspectives and balanced coverage)
4. Priority (speed for simple queries, depth for complex analysis, balanced for most)
5. Query complexity (1-5)

Examples:
- "Latest AI news" → intent: news, simple, speed priority
- "How do different outlets cover climate change?" → intent: comparison, needs all analyses, depth priority
- "What's trending in tech?" → intent: trend, needs trend analysis, balanced priority`,
        temperature: 0.1,
      });

      // Determine which agents to run based on analysis
      const agentsToRun: AgentRole[] = [AgentRole.NEWS]; // Always fetch news

      if (result.object.needsSentiment || result.object.intent === "analysis") {
        agentsToRun.push(AgentRole.SENTIMENT);
      }

      if (result.object.needsTrend || result.object.intent === "trend") {
        agentsToRun.push(AgentRole.TREND);
      }

      if (result.object.needsBias || result.object.intent === "comparison") {
        agentsToRun.push(AgentRole.BIAS);
      }

      // For complex queries, run all agents
      if (result.object.complexity >= 4) {
        agentsToRun.push(AgentRole.SENTIMENT, AgentRole.TREND, AgentRole.BIAS);
      }

      // Remove duplicates
      const uniqueAgents = Array.from(new Set(agentsToRun));

      return {
        intent: result.object.intent as CoordinationResult["intent"],
        searchTerms: result.object.searchTerms,
        agentsToRun: uniqueAgents,
        priority: result.object.priority as CoordinationResult["priority"],
      };
    } catch (error) {
      this.log("error", "Failed to analyze query, using default strategy", {
        error,
      });

      // Fallback: run all agents
      return {
        intent: "general",
        searchTerms: [query],
        agentsToRun: [
          AgentRole.NEWS,
          AgentRole.SENTIMENT,
          AgentRole.TREND,
          AgentRole.BIAS,
        ],
        priority: "balanced",
      };
    }
  }

  protected async getReasoning(context: AgentContext, data: CoordinationResult): Promise<string> {
    const userInfo = context.userProfile ? 
      `User has history with interests: ${context.userProfile.interests.slice(0, 3).join(", ")}` : 
      "New user with no history";
    
    return `Coordinator analyzed query "${context.query}" and determined:
- Intent: ${data.intent} (${data.priority} priority)
- Search terms: ${data.searchTerms.join(", ")}
- Agents to run: ${data.agentsToRun.join(", ")}
- User context: ${userInfo}

This decision was made to optimize the analysis approach based on the query's complexity and user's interests.`;
  }

  protected getDefaultResult(): CoordinationResult {
    return {
      intent: "general",
      agentsToRun: [AgentRole.NEWS],
      searchTerms: [],
      userContext: {
        interests: [],
        recentQueries: [],
        hasHistory: false,
      },
      priority: "balanced",
    };
  }
}
