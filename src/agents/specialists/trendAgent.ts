import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext, TrendAgentResult, Article } from "../types";

/**
 * Trend Detection Agent
 * Identifies patterns, emerging topics, and temporal trends in articles
 */
export class TrendAgent extends BaseAgent<TrendAgentResult> {
  constructor() {
    super(AgentRole.TREND);
  }

  protected async process(context: AgentContext): Promise<TrendAgentResult> {
    const articles = context.rawData?.articles || [];

    if (articles.length === 0) {
      this.log("warn", "No articles to analyze for trends");
      return this.getDefaultResult();
    }

    this.log("info", "📈 TrendAgent: Detecting trends and patterns...", {
      articleCount: articles.length,
    });

    // Analyze trends using LLM
    const trendAnalysis = await this.analyzeTrends(articles, context.query);

    this.log("info", "📈 TrendAgent: Analysis completed", {
      mainTopics: trendAnalysis.mainTopics.length,
      emergingThemes: trendAnalysis.emergingThemes.length,
      insights: trendAnalysis.keyInsights.length,
    });

    return trendAnalysis;
  }

  /**
   * Analyze trends across articles
   */
  private async analyzeTrends(
    articles: Article[],
    query: string
  ): Promise<TrendAgentResult> {
    try {
      // Prepare article summaries for analysis
      const articleSummaries = articles
        .map((a, idx) => {
          const date = a.publishedAt
            ? new Date(a.publishedAt).toLocaleDateString()
            : "Unknown date";
          return `[${idx}] ${a.title} (${a.source}, ${date})`;
        })
        .join("\n");

      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          mainTopics: z
            .array(z.string())
            .describe("Main topics or themes found across articles"),
          emergingThemes: z
            .array(z.string())
            .describe(
              "Emerging or trending themes that appear to be gaining attention"
            ),
          keyInsights: z
            .array(z.string())
            .describe("Key insights or patterns observed in the coverage"),
          temporalPattern: z
            .string()
            .describe(
              "Description of temporal patterns (e.g., increasing/decreasing coverage, recent spike)"
            ),
        }),
        prompt: `Analyze trends and patterns in these news articles related to: "${query}"

Articles:
${articleSummaries}

Identify:
1. Main topics or themes (3-5 topics)
2. Emerging themes that seem to be trending or gaining attention
3. Key insights or patterns in the coverage
4. Temporal patterns (are some topics getting more/less coverage recently?)
5. Frequency of key terms or entities

Look for:
- Repeated topics across different sources
- New developments or breaking stories
- Shifts in focus or narrative
- Geographical or temporal clustering`,
        temperature: 0.4,
      });

      return {
        mainTopics: result.object.mainTopics,
        emergingThemes: result.object.emergingThemes,
        keyInsights: result.object.keyInsights,
        temporalPattern: result.object.temporalPattern,
      };
    } catch (error) {
      this.log("error", "Failed to analyze trends", { error });
      return this.getDefaultResult();
    }
  }

  protected async getReasoning(context: AgentContext, data: TrendAgentResult): Promise<string> {
    return `Trend Agent analyzed ${context.rawData?.articles?.length || 0} articles to identify patterns:
- Main topics discovered: ${data.mainTopics.length} 
- Emerging themes: ${data.emergingThemes.length}
- Key insights generated: ${data.keyInsights.length}
- Temporal pattern: ${data.temporalPattern}

The agent used pattern recognition to identify recurring topics, emerging trends, and temporal patterns across multiple sources to provide broader context beyond individual articles.`;
  }

  protected getDefaultResult(): TrendAgentResult {
    return {
      mainTopics: [],
      emergingThemes: [],
      keyInsights: [],
      temporalPattern: "No temporal pattern data available",
    };
  }
}
