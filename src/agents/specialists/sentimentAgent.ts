import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import {
  AgentRole,
  AgentContext,
  SentimentAgentResult,
  Article,
} from "../types";

/**
 * Sentiment Analysis Agent
 * Analyzes the sentiment and emotional tone of articles
 */
export class SentimentAgent extends BaseAgent<SentimentAgentResult> {
  constructor() {
    super(AgentRole.SENTIMENT);
  }

  protected async process(
    context: AgentContext
  ): Promise<SentimentAgentResult> {
    const articles = context.rawData?.articles || [];

    if (articles.length === 0) {
      this.log("warn", "No articles to analyze");
      return this.getDefaultResult();
    }

    // Analyze sentiment for each article
    const articleSentiments = await this.analyzeBatch(articles);

    // Calculate overall sentiment
    const sentimentCounts = {
      positive: articleSentiments.filter((s) => s.sentiment === "positive")
        .length,
      negative: articleSentiments.filter((s) => s.sentiment === "negative")
        .length,
      neutral: articleSentiments.filter((s) => s.sentiment === "neutral")
        .length,
    };

    const overallSentiment = this.determineOverallSentiment(sentimentCounts);
    const sentimentTrend = this.generateSentimentTrend(
      sentimentCounts,
      articleSentiments
    );

    this.log("info", "Sentiment analysis completed", {
      total: articles.length,
      sentimentCounts,
      overallSentiment,
    });

    return {
      overallSentiment,
      articleSentiments,
      sentimentTrend,
    };
  }

  /**
   * Analyze sentiment for a batch of articles
   */
  private async analyzeBatch(articles: Article[]) {
    // Process in batches to avoid token limits
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const batchResults = await this.analyzeSentimentBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Analyze sentiment for a batch of articles using LLM
   */
  private async analyzeSentimentBatch(articles: Article[]) {
    try {
      const articlesText = articles
        .map(
          (a, idx) =>
            `[${idx}] Title: ${a.title}\nDescription: ${a.description || "N/A"}`
        )
        .join("\n\n");

      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          sentiments: z.array(
            z.object({
              index: z.number().describe("Article index"),
              sentiment: z
                .enum(["positive", "negative", "neutral"])
                .describe("Overall sentiment"),
              score: z.number().min(0).max(1).describe("Confidence score 0-1"),
              emotions: z
                .array(z.string())
                .describe("Detected emotions (e.g., optimism, concern, anger)"),
            })
          ),
        }),
        prompt: `Analyze the sentiment and emotional tone of these news articles.

Articles:
${articlesText}

For each article, determine:
1. Sentiment: positive, negative, or neutral
2. Confidence score (0-1)
3. Emotional tones present (e.g., optimism, concern, excitement, anger, hope, fear)`,
        temperature: 0.2,
      });

      return result.object.sentiments.map((s) => ({
        articleId: articles[s.index]?.id || `unknown-${s.index}`,
        sentiment: s.sentiment,
        score: s.score,
        emotions: s.emotions,
      }));
    } catch (error) {
      this.log("error", "Failed to analyze sentiment batch", { error });
      // Return neutral sentiment for all articles as fallback
      return articles.map((a) => ({
        articleId: a.id,
        sentiment: "neutral" as const,
        score: 0.5,
        emotions: [],
      }));
    }
  }

  /**
   * Determine overall sentiment from counts
   */
  private determineOverallSentiment(counts: {
    positive: number;
    negative: number;
    neutral: number;
  }): "positive" | "negative" | "neutral" | "mixed" {
    const total = counts.positive + counts.negative + counts.neutral;
    if (total === 0) return "neutral";

    const positivePct = counts.positive / total;
    const negativePct = counts.negative / total;

    // If both positive and negative are significant, it's mixed
    if (positivePct > 0.3 && negativePct > 0.3) return "mixed";

    // Otherwise, return the dominant sentiment
    if (positivePct > negativePct && positivePct > 0.4) return "positive";
    if (negativePct > positivePct && negativePct > 0.4) return "negative";

    return "neutral";
  }

  /**
   * Generate human-readable sentiment trend description
   */
  private generateSentimentTrend(
    counts: { positive: number; negative: number; neutral: number },
    articleSentiments: Array<{ emotions: string[] }>
  ): string {
    const total = counts.positive + counts.negative + counts.neutral;
    if (total === 0) return "No sentiment data available";

    // Collect all emotions
    const allEmotions = articleSentiments.flatMap((a) => a.emotions);
    const topEmotions = this.getTopEmotions(allEmotions, 3);

    const parts = [];

    if (counts.positive > counts.negative) {
      parts.push(
        `Generally positive coverage (${counts.positive}/${total} articles)`
      );
    } else if (counts.negative > counts.positive) {
      parts.push(
        `Generally negative coverage (${counts.negative}/${total} articles)`
      );
    } else {
      parts.push(`Balanced coverage`);
    }

    if (topEmotions.length > 0) {
      parts.push(`with tones of ${topEmotions.join(", ")}`);
    }

    return parts.join(" ");
  }

  /**
   * Get most common emotions
   */
  private getTopEmotions(emotions: string[], limit: number): string[] {
    const counts = emotions.reduce((acc, emotion) => {
      acc[emotion] = (acc[emotion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([emotion]) => emotion);
  }

  protected getDefaultResult(): SentimentAgentResult {
    return {
      overallSentiment: "neutral",
      articleSentiments: [],
      sentimentTrend: "No sentiment data available",
    };
  }
}
