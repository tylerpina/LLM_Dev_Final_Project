import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext, NewsAgentResult, Article } from "../types";
import { UniversalMcpServer } from "../../mcp/universalMcp";

/**
 * News Fetcher Agent
 * Responsible for fetching relevant news from all available sources
 */
export class NewsAgent extends BaseAgent<NewsAgentResult> {
  private mcpServer: UniversalMcpServer;

  constructor(mcpServer: UniversalMcpServer) {
    super(AgentRole.NEWS);
    this.mcpServer = mcpServer;
  }

  protected async process(context: AgentContext): Promise<NewsAgentResult> {
    // Step 1: Extract search terms if not provided
    this.log("info", "📰 NewsAgent: Extracting search terms...");
    const searchTerms =
      context.searchTerms || (await this.extractSearchTerms(context.query));

    this.log("info", "📰 NewsAgent: Search terms extracted", { searchTerms });

    // Step 2: Fetch from all available sources in parallel
    const availableSources = this.mcpServer.getAvailableProviders();
    this.log("info", "📰 NewsAgent: Fetching from sources...", {
      sources: availableSources,
    });
    const fetchPromises = availableSources.map((source) =>
      this.fetchFromSource(source, searchTerms, context)
    );

    const results = await Promise.allSettled(fetchPromises);

    // Step 3: Aggregate articles from all sources
    const articles: Article[] = [];
    const successfulSources: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        articles.push(...result.value);
        successfulSources.push(availableSources[index]);
      } else if (result.status === "rejected") {
        this.log("warn", `Failed to fetch from ${availableSources[index]}`, {
          error: result.reason,
        });
      }
    });

    this.log("info", "📰 NewsAgent: Fetching completed", {
      totalArticles: articles.length,
      sources: successfulSources,
      searchTerms,
    });

    return {
      articles,
      totalFetched: articles.length,
      sources: successfulSources,
      searchTermsUsed: searchTerms,
    };
  }

  /**
   * Extract search terms from query using LLM
   */
  private async extractSearchTerms(query: string): Promise<string[]> {
    try {
      const result = await generateObject({
        model: this.getModel(),
        schema: z.object({
          searchTerms: z
            .array(z.string())
            .describe("Key search terms extracted from the query"),
          primaryTerm: z.string().describe("Most important search term"),
        }),
        prompt: `Extract the most important search terms from this query for news article search.
Focus on concrete topics, entities, and keywords that would be useful for finding relevant articles.

Query: "${query}"

Extract 2-5 search terms, with the most important one as the primary term.`,
        temperature: 0.3,
      });

      return [result.object.primaryTerm, ...result.object.searchTerms].slice(
        0,
        5
      );
    } catch (error) {
      this.log("warn", "Failed to extract search terms, using query as-is", {
        error,
      });
      return [query];
    }
  }

  /**
   * Fetch articles from a specific source
   */
  private async fetchFromSource(
    source: string,
    searchTerms: string[],
    context: AgentContext
  ): Promise<Article[]> {
    const searchQuery = searchTerms.join(" ");
    const articles: Article[] = [];

    try {
      if (source === "newsapi") {
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/news/top-headlines",
          query: {
            q: searchQuery,
            pageSize: "10",
          },
          provider: "newsapi",
        });

        if (result.data?.articles) {
          articles.push(
            ...result.data.articles.map((article: any) => ({
              id: `newsapi-${article.url}`,
              title: article.title || "No title",
              source: article.source?.name || "NewsAPI",
              url: article.url,
              description: article.description || "",
              content: article.content || article.description || "",
              publishedAt: article.publishedAt,
              author: article.author,
            }))
          );
        }
      } else if (source === "guardian") {
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/guardian/search",
          query: {
            q: searchQuery,
            "page-size": "10",
          },
          provider: "guardian",
        });

        if (result.data?.response?.results) {
          articles.push(
            ...result.data.response.results.map((article: any) => ({
              id: `guardian-${article.id}`,
              title: article.webTitle || "No title",
              source: "The Guardian",
              url: article.webUrl,
              description: article.fields?.trailText || "",
              content:
                article.fields?.bodyText || article.fields?.trailText || "",
              publishedAt: article.webPublicationDate,
              author: article.fields?.byline,
            }))
          );
        }
      } else if (source === "arxiv") {
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/arxiv/search",
          query: {
            search_query: searchTerms.join("+"),
            max_results: "10",
          },
          provider: "arxiv",
        });

        if (result.data?.feed?.entry) {
          const entries = Array.isArray(result.data.feed.entry)
            ? result.data.feed.entry
            : [result.data.feed.entry];

          articles.push(
            ...entries.map((entry: any) => ({
              id: `arxiv-${entry.id}`,
              title: entry.title || "No title",
              source: "ArXiv",
              url: entry.links?.[0]?.href || entry.id,
              description: entry.summary || "",
              content: entry.summary || "",
              publishedAt: entry.published,
              author: entry.author?.[0]?.name || "Unknown",
            }))
          );
        }
      }
    } catch (error: any) {
      this.log("error", `Error fetching from ${source}`, {
        error: error.message,
        searchQuery,
      });
    }

    return articles;
  }

  protected getDefaultResult(): NewsAgentResult {
    return {
      articles: [],
      totalFetched: 0,
      sources: [],
      searchTermsUsed: [],
    };
  }
}
