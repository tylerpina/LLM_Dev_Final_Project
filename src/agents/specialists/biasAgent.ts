import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext, BiasAgentResult, Article } from "../types";

/**
 * Bias Detection Agent
 * Identifies potential biases, source diversity, and perspective gaps
 */
export class BiasAgent extends BaseAgent<BiasAgentResult> {
  // Known news source biases (simplified categorization)
  private readonly SOURCE_BIAS_MAP: Record<
    string,
    "left" | "right" | "neutral"
  > = {
    "The Guardian": "left",
    "BBC News": "neutral",
    CNN: "left",
    "Fox News": "right",
    Reuters: "neutral",
    "Associated Press": "neutral",
    "The New York Times": "left",
    "The Wall Street Journal": "right",
    NPR: "left",
    ArXiv: "neutral", // Academic
    NewsAPI: "neutral", // Aggregator
  };

  constructor() {
    super(AgentRole.BIAS);
  }

  protected async process(context: AgentContext): Promise<BiasAgentResult> {
    const articles = context.rawData?.articles || [];

    if (articles.length === 0) {
      this.log("warn", "No articles to analyze for bias");
      return this.getDefaultResult();
    }

    // Analyze source diversity
    const sourceDiversity = this.analyzeSourceDiversity(articles);

    // Analyze content bias using LLM
    const biasAnalysis = await this.analyzeContentBias(articles, context.query);

    this.log("info", "Bias analysis completed", {
      sourceDiversity,
      warningsCount: biasAnalysis.biasWarnings.length,
    });

    return {
      sourceDiversity,
      biasWarnings: biasAnalysis.biasWarnings,
      perspectives: biasAnalysis.perspectives,
      recommendation: this.generateRecommendation(
        sourceDiversity,
        biasAnalysis
      ),
    };
  }

  /**
   * Analyze diversity of news sources
   */
  private analyzeSourceDiversity(articles: Article[]) {
    const counts = {
      leftLeaning: 0,
      rightLeaning: 0,
      neutral: 0,
      total: articles.length,
    };

    articles.forEach((article) => {
      const bias = this.SOURCE_BIAS_MAP[article.source] || "neutral";
      if (bias === "left") counts.leftLeaning++;
      else if (bias === "right") counts.rightLeaning++;
      else counts.neutral++;
    });

    return counts;
  }

  /**
   * Analyze content bias using LLM
   */
  private async analyzeContentBias(articles: Article[], query: string) {
    try {
      // Group articles by source for analysis
      const articleSummaries = articles
        .slice(0, 10) // Limit to top 10 to avoid token limits
        .map(
          (a, idx) => `[${idx}] ${a.source}: ${a.title}\n${a.description || ""}`
        )
        .join("\n\n");

      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          biasWarnings: z
            .array(z.string())
            .describe(
              "Potential biases or concerns identified in the coverage"
            ),
          perspectives: z
            .array(z.string())
            .describe("Different perspectives or viewpoints represented"),
          missingPerspectives: z
            .array(z.string())
            .describe(
              "Perspectives or viewpoints that appear to be missing or underrepresented"
            ),
          framingAnalysis: z
            .string()
            .describe(
              "Analysis of how the story is framed across different sources"
            ),
        }),
        prompt: `Analyze potential biases and perspective diversity in these news articles about: "${query}"

Articles:
${articleSummaries}

Identify:
1. Potential biases in the coverage (political, geographical, ideological, etc.)
2. Different perspectives or viewpoints that ARE represented
3. Missing perspectives or underrepresented viewpoints
4. How different sources frame the same story

Look for:
- One-sided coverage
- Loaded language or framing
- Missing voices or stakeholders
- Geographical bias (e.g., only Western sources)
- Corporate or political interests
- Confirmation bias`,
        temperature: 0.3,
      });

      return {
        biasWarnings: result.object.biasWarnings,
        perspectives: [
          ...result.object.perspectives,
          ...result.object.missingPerspectives.map((p) => `Missing: ${p}`),
        ],
        framingAnalysis: result.object.framingAnalysis,
      };
    } catch (error) {
      this.log("error", "Failed to analyze content bias", { error });
      return {
        biasWarnings: [],
        perspectives: [],
        framingAnalysis: "",
      };
    }
  }

  /**
   * Generate recommendation based on bias analysis
   */
  private generateRecommendation(
    sourceDiversity: BiasAgentResult["sourceDiversity"],
    biasAnalysis: { biasWarnings: string[]; perspectives: string[] }
  ): string {
    const { leftLeaning, rightLeaning, neutral, total } = sourceDiversity;

    // Check for source diversity issues
    const leftPct = leftLeaning / total;
    const rightPct = rightLeaning / total;
    const neutralPct = neutral / total;

    const recommendations: string[] = [];

    // Source balance
    if (leftPct > 0.7) {
      recommendations.push("Coverage is heavily from left-leaning sources");
    } else if (rightPct > 0.7) {
      recommendations.push("Coverage is heavily from right-leaning sources");
    } else if (neutralPct > 0.8) {
      recommendations.push("Good balance of neutral sources");
    } else if (Math.abs(leftPct - rightPct) < 0.2 && leftPct + rightPct > 0.5) {
      recommendations.push(
        "Balanced representation of different political perspectives"
      );
    }

    // Bias warnings
    if (biasAnalysis.biasWarnings.length > 2) {
      recommendations.push(
        "Multiple potential biases identified - consider seeking additional sources"
      );
    } else if (biasAnalysis.biasWarnings.length === 0) {
      recommendations.push("No significant biases detected in coverage");
    }

    // Missing perspectives
    const missingPerspectives = biasAnalysis.perspectives.filter((p) =>
      p.startsWith("Missing:")
    );
    if (missingPerspectives.length > 0) {
      recommendations.push("Some perspectives may be underrepresented");
    }

    return recommendations.join(". ") || "Coverage appears reasonably balanced";
  }

  protected getDefaultResult(): BiasAgentResult {
    return {
      sourceDiversity: {
        leftLeaning: 0,
        rightLeaning: 0,
        neutral: 0,
        total: 0,
      },
      biasWarnings: [],
      perspectives: [],
      recommendation: "No bias analysis data available",
    };
  }
}
