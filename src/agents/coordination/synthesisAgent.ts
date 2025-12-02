import { generateText } from "ai";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext } from "../types";

/**
 * Synthesis Agent
 * Creates final human-readable report in markdown format
 */
export class SynthesisAgent extends BaseAgent<string> {
  constructor() {
    super(AgentRole.SYNTHESIS);
  }

  protected async process(context: AgentContext): Promise<string> {
    this.log("info", "📝 SynthesisAgent: Building context from all agents...");

    const rawData = context.rawData || {};

    // Build comprehensive context for synthesis
    const synthesisContext = this.buildSynthesisContext(rawData, context);

    this.log("info", "📝 SynthesisAgent: Generating final report...");

    // Generate final markdown report
    const report = await this.generateReport(synthesisContext, context.query);

    this.log("info", "📝 SynthesisAgent: Report generation complete", {
      reportLength: report.length,
      query: context.query,
    });

    return report;
  }

  /**
   * Build structured context for synthesis
   */
  private buildSynthesisContext(rawData: any, context: AgentContext): string {
    const parts: string[] = [];

    // News articles
    if (rawData.news?.articles && rawData.news.articles.length > 0) {
      const articles = rawData.news.articles.slice(0, 20); // Top 20 articles - increased coverage
      parts.push("=== NEWS ARTICLES ===");
      articles.forEach((article: any, idx: number) => {
        parts.push(
          `[${idx + 1}] ${article.title} (${article.source})\n${
            article.description || ""
          }\nURL: ${article.url || "N/A"}`
        );
      });
      parts.push(
        `Total articles fetched: ${
          rawData.news.totalFetched
        } from sources: ${rawData.news.sources.join(", ")}`
      );
    }

    // Sentiment analysis
    if (rawData.sentiment) {
      parts.push("\n=== SENTIMENT ANALYSIS ===");
      parts.push(`Overall Sentiment: ${rawData.sentiment.overallSentiment}`);
      parts.push(`Trend: ${rawData.sentiment.sentimentTrend}`);
      if (rawData.sentiment.articleSentiments.length > 0) {
        const topSentiments = rawData.sentiment.articleSentiments.slice(0, 5);
        parts.push("Top article sentiments:");
        topSentiments.forEach((s: any) => {
          parts.push(
            `- Article sentiment: ${s.sentiment} (score: ${s.score.toFixed(
              2
            )}, emotions: ${s.emotions.join(", ")})`
          );
        });
      }
    }

    // Trend analysis
    if (rawData.trend) {
      parts.push("\n=== TREND ANALYSIS ===");
      if (rawData.trend.mainTopics.length > 0) {
        parts.push(`Main Topics: ${rawData.trend.mainTopics.join(", ")}`);
      }
      if (rawData.trend.emergingThemes.length > 0) {
        parts.push(
          `Emerging Themes: ${rawData.trend.emergingThemes.join(", ")}`
        );
      }
      if (rawData.trend.keyInsights.length > 0) {
        parts.push("Key Insights:");
        rawData.trend.keyInsights.forEach((insight: string) => {
          parts.push(`- ${insight}`);
        });
      }
      parts.push(`Temporal Pattern: ${rawData.trend.temporalPattern}`);
    }

    // Bias analysis
    if (rawData.bias) {
      parts.push("\n=== BIAS ANALYSIS ===");
      const div = rawData.bias.sourceDiversity;
      parts.push(
        `Source Diversity: ${div.leftLeaning} left-leaning, ${div.rightLeaning} right-leaning, ${div.neutral} neutral (total: ${div.total})`
      );
      if (rawData.bias.biasWarnings.length > 0) {
        parts.push("Bias Warnings:");
        rawData.bias.biasWarnings.forEach((warning: string) => {
          parts.push(`- ${warning}`);
        });
      }
      if (rawData.bias.perspectives.length > 0) {
        parts.push("Perspectives:");
        rawData.bias.perspectives.slice(0, 5).forEach((p: string) => {
          parts.push(`- ${p}`);
        });
      }
      parts.push(`Recommendation: ${rawData.bias.recommendation}`);
    }

    // Personalization
    if (rawData.personalization) {
      parts.push("\n=== PERSONALIZATION ===");
      if (rawData.personalization.personalizedInsights.length > 0) {
        parts.push("Personalized Insights:");
        rawData.personalization.personalizedInsights.forEach(
          (insight: string) => {
            parts.push(`- ${insight}`);
          }
        );
      }
      if (rawData.personalization.recommendedFollowUps.length > 0) {
        parts.push("Recommended Follow-ups:");
        rawData.personalization.recommendedFollowUps.forEach(
          (followup: string) => {
            parts.push(`- ${followup}`);
          }
        );
      }
      if (rawData.personalization.rankedArticles.length > 0) {
        const topRanked = rawData.personalization.rankedArticles.slice(0, 3);
        parts.push("Top Personalized Articles:");
        topRanked.forEach((ra: any, idx: number) => {
          parts.push(
            `${idx + 1}. ${
              ra.article.title
            } (relevance: ${ra.relevanceScore.toFixed(2)})`
          );
          if (ra.matchedInterests.length > 0) {
            parts.push(
              `   Matches your interests in: ${ra.matchedInterests.join(", ")}`
            );
          }
        });
      }
    }

    // Add sources information for the synthesis
    if (context.sources && context.sources.length > 0) {
      parts.push("\n=== SOURCES INFORMATION ===");
      const sourcesByProvider = context.sources.reduce((acc: any, source) => {
        if (!acc[source.provider]) {
          acc[source.provider] = [];
        }
        acc[source.provider].push(source);
        return acc;
      }, {});

      for (const [provider, sources] of Object.entries(sourcesByProvider)) {
        parts.push(`\n${provider}:`);
        if (Array.isArray(sources)) {
          sources.forEach((source: any) => {
            parts.push(`- ${source.title || 'Untitled'}${source.url ? ` (${source.url})` : ''}`);
          });
        }
      }
    }

    return parts.join("\n");
  }

  /**
   * Generate final markdown report
   */
  private async generateReport(
    context: string,
    query: string
  ): Promise<string> {
    try {
      const result = await generateText({
        model: this.getModel(),
        prompt: `You are a news intelligence assistant. Create a comprehensive, well-structured markdown report based on the analysis below.

User Query: "${query}"

Analysis Data:
${context}

Create a markdown report with the following structure:

## Summary
[Executive summary answering the user's query directly]

## Key Findings
[Bullet points of the most important findings]

## Latest News
[List top articles with titles, sources, and brief context. Include sentiment indicators where relevant]

## Analysis & Insights
[Combine insights from sentiment, trend, and bias analysis into a cohesive narrative]
[Include sections like "Trending Topics", "Sentiment Overview", "Source Diversity" as appropriate]

## Personalized Recommendations
[If personalization data is available, include personalized insights and recommended follow-ups]

## Sources
[List all news sources used, grouped by provider]

Guidelines:
- Use **bold** for emphasis
- Use proper markdown formatting (##, ###, -, *, etc.)
- Be concise but informative
- Cite specific articles and sources
- Use neutral, professional tone
- Include relevant URLs when available
- Make it easy to scan with clear headings and bullet points
- Synthesize information across agents rather than just listing their outputs
- Highlight contrasts or agreements between different sources`,
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      this.log("error", "Failed to generate report, using fallback", { error });
      return this.generateFallbackReport(context, query);
    }
  }

  /**
   * Generate a simple fallback report if synthesis fails
   */
  private generateFallbackReport(context: string, query: string): string {
    return `## Response to: "${query}"

Based on the available analysis, here is a summary of the findings:

${context}

---

*Note: This is a simplified report due to synthesis limitations. Please try your query again for a more polished response.*`;
  }

  protected async getReasoning(context: AgentContext, data: string): Promise<string> {
    const wordCount = data.split(/\s+/).length;
    const hasHeadings = data.includes('##') || data.includes('###');
    const hasLists = data.includes('-') || data.includes('*');
    
    return `Synthesis Agent consolidated insights from multiple specialist agents:
- Generated ${wordCount} word comprehensive report
- Applied markdown formatting: ${hasHeadings ? 'headings' : 'no headings'}, ${hasLists ? 'lists' : 'no lists'}
- Integrated data from: ${Object.keys(context.rawData || {}).join(', ')}
- Query focus: "${context.query}"

The agent combined technical analysis, sentiment insights, trend patterns, and bias considerations into a cohesive narrative that directly addresses the user's question.`;
  }

  protected getDefaultResult(): string {
    return "## No Results\n\nUnable to generate a report at this time.";
  }
}
