import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import {
  AgentRole,
  AgentContext,
  PersonalizationResult,
  Article,
} from "../types";
import { PersonalizationService } from "../../services/personalizationService";

/**
 * Personalization Agent
 * Filters and ranks results based on user profile and interests
 */
export class PersonalizationAgent extends BaseAgent<PersonalizationResult> {
  private personalizationService: PersonalizationService | null;

  constructor(personalizationService: PersonalizationService | null) {
    super(AgentRole.PERSONALIZATION);
    this.personalizationService = personalizationService;
  }

  protected async process(
    context: AgentContext
  ): Promise<PersonalizationResult> {
    const articles = context.rawData?.articles || [];

    if (articles.length === 0) {
      this.log("warn", "No articles to personalize");
      return this.getDefaultResult();
    }

    // If no personalization service or no user profile, return articles as-is
    const userProfile = this.personalizationService?.getUserProfile(
      context.userId
    );
    if (
      !this.personalizationService ||
      !userProfile ||
      userProfile.interactionCount === 0
    ) {
      this.log(
        "info",
        "No personalization data available, returning unranked articles"
      );
      return {
        rankedArticles: articles.map((article: Article) => ({
          article,
          relevanceScore: 0.5,
          matchedInterests: [],
        })),
        personalizedInsights: [
          "Start interacting to build your personalized profile!",
        ],
        recommendedFollowUps: [],
      };
    }

    // Score and rank articles based on user interests
    const rankedArticles = await this.rankArticles(
      articles,
      userProfile,
      context.query
    );

    // Generate personalized insights
    const insights = await this.generateInsights(
      rankedArticles,
      userProfile,
      context.query
    );

    // Track this query interaction
    await this.personalizationService.trackInteraction({
      userId: context.userId,
      query: context.query,
      timestamp: new Date(),
      interactionType: "query",
    });

    this.log("info", "Personalization completed", {
      totalArticles: articles.length,
      topScore: rankedArticles[0]?.relevanceScore || 0,
      insightsGenerated: insights.personalizedInsights.length,
    });

    return insights;
  }

  /**
   * Rank articles based on user interests
   */
  private async rankArticles(
    articles: Article[],
    userProfile: any,
    query: string
  ): Promise<PersonalizationResult["rankedArticles"]> {
    try {
      // Use LLM to score each article against user interests
      const articlesText = articles
        .map((a, idx) => `[${idx}] ${a.title}\n${a.description || ""}`)
        .join("\n\n");

      const userInterestsText = userProfile.interests.slice(0, 10).join(", ");

      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          scores: z.array(
            z.object({
              index: z.number().describe("Article index"),
              relevanceScore: z
                .number()
                .min(0)
                .max(1)
                .describe("Relevance score 0-1 based on user interests"),
              matchedInterests: z
                .array(z.string())
                .describe("User interests that match this article"),
              reasoning: z.string().describe("Brief explanation of the score"),
            })
          ),
        }),
        prompt: `Score these articles based on how relevant they are to the user's interests.

User's Query: "${query}"
User's Known Interests: ${userInterestsText}

Articles:
${articlesText}

For each article, provide:
1. Relevance score (0-1): How well it matches user interests and query
2. Matched interests: Which of the user's interests does this article relate to?
3. Brief reasoning for the score

Consider:
- Direct topic matches
- Indirect/related topics
- Potential new interests based on query
- Quality and depth of content`,
        temperature: 0.5,
      });

      // Map scores back to articles
      const rankedArticles = result.object.scores
        .map((score) => ({
          article: articles[score.index],
          relevanceScore: score.relevanceScore,
          matchedInterests: score.matchedInterests,
        }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      return rankedArticles;
    } catch (error) {
      this.log("error", "Failed to rank articles, using default order", {
        error,
      });

      // Fallback: return articles with default score
      return articles.map((article) => ({
        article,
        relevanceScore: 0.5,
        matchedInterests: [],
      }));
    }
  }

  /**
   * Generate personalized insights and recommendations
   */
  private async generateInsights(
    rankedArticles: PersonalizationResult["rankedArticles"],
    userProfile: any,
    query: string
  ): Promise<PersonalizationResult> {
    try {
      const topArticles = rankedArticles.slice(0, 5);
      const topArticlesText = topArticles
        .map(
          (ra) =>
            `${ra.article.title} (score: ${ra.relevanceScore.toFixed(
              2
            )}, matches: ${ra.matchedInterests.join(", ") || "none"})`
        )
        .join("\n");

      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          personalizedInsights: z
            .array(z.string())
            .describe("2-3 personalized insights about the results"),
          recommendedFollowUps: z
            .array(z.string())
            .describe("2-3 recommended follow-up queries"),
        }),
        prompt: `Generate personalized insights and recommendations for this user.

User's Query: "${query}"
User's Interests: ${userProfile.interests.slice(0, 10).join(", ")}
User's Interaction Count: ${userProfile.interactionCount}

Top Ranked Articles:
${topArticlesText}

Provide:
1. 2-3 personalized insights (e.g., "Based on your interest in X, you might find...", "These articles align with your focus on Y")
2. 2-3 recommended follow-up queries to explore further

Keep insights specific to the user's profile and the current results.`,
        temperature: 0.6,
      });

      return {
        rankedArticles,
        personalizedInsights: result.object.personalizedInsights,
        recommendedFollowUps: result.object.recommendedFollowUps,
      };
    } catch (error) {
      this.log("error", "Failed to generate insights", { error });

      return {
        rankedArticles,
        personalizedInsights: [
          "Articles ranked based on your profile",
          `You have ${userProfile.interactionCount} interactions in your history`,
        ],
        recommendedFollowUps: [],
      };
    }
  }

  protected getDefaultResult(): PersonalizationResult {
    return {
      rankedArticles: [],
      personalizedInsights: [],
      recommendedFollowUps: [],
    };
  }
}
