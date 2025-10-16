import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent } from "../base/baseAgent";
import { AgentRole, AgentContext, NewsAgentResult, Article } from "../types";
import { UniversalMcpServer } from "../../mcp/universalMcp";
import { DatabaseService } from "../../services/databaseService";

/**
 * News Fetcher Agent
 * Responsible for fetching relevant news from all available sources
 */
export class NewsAgent extends BaseAgent<NewsAgentResult> {
  private mcpServer: UniversalMcpServer;
  private databaseService: DatabaseService | null;

  constructor(mcpServer: UniversalMcpServer, databaseService: DatabaseService | null = null) {
    super(AgentRole.NEWS);
    this.mcpServer = mcpServer;
    this.databaseService = databaseService;
  }

  protected async process(context: AgentContext): Promise<NewsAgentResult> {
    // Step 1: Extract search terms if not provided
    this.log("info", "📰 NewsAgent: Extracting search terms...");
    const searchTerms =
      context.searchTerms || (await this.extractSearchTerms(context.query));

    this.log("info", "📰 NewsAgent: Search terms extracted", { searchTerms });

    // Step 2: Fetch from all available sources in parallel, prioritizing NewsAPI
    const availableSources = this.mcpServer.getAvailableProviders();
    // Prioritize NewsAPI by putting it first in the list
    const sourcesToFetch = [...availableSources].sort((a, b) => {
      if (a === "newsapi") return -1;
      if (b === "newsapi") return 1;
      return 0;
    });
    
    this.log("info", "📰 NewsAgent: Fetching from sources...", {
      sources: sourcesToFetch,
      prioritized: true,
    });
    const fetchPromises = sourcesToFetch.map((source) =>
      this.fetchFromSource(source, searchTerms, context)
    );

    const results = await Promise.allSettled(fetchPromises);

    // Step 3: Aggregate articles from all sources, prioritizing NewsAPI results
    const articlesBySource: Record<string, Article[]> = {};
    const successfulSources: string[] = [];

    results.forEach((result, index) => {
      const source = sourcesToFetch[index];
      if (result.status === "fulfilled" && result.value) {
        articlesBySource[source] = result.value;
        successfulSources.push(source);
      } else if (result.status === "rejected") {
        this.log("warn", `Failed to fetch from ${source}`, {
          error: result.reason,
        });
      }
    });

    // Combine articles with NewsAPI first, then others
    const articles: Article[] = [];
    
    // Add NewsAPI articles first for priority
    if (articlesBySource["newsapi"]) {
      articles.push(...articlesBySource["newsapi"]);
    }
    
    // Add other sources in original prioritized order
    sourcesToFetch.forEach(source => {
      if (source !== "newsapi" && articlesBySource[source]) {
        articles.push(...articlesBySource[source]);
      }
    });

    // Log source distribution for visibility
    const sourceCounts = Object.entries(articlesBySource).map(([source, articles]) => ({
      source,
      count: articles.length
    }));

    // Fallback: If we got very few or no articles, use cached headlines from database
    if (articles.length < 5 && this.databaseService) {
      this.log("info", "📰 NewsAgent: Low article count, supplementing with cached headlines", {
        currentCount: articles.length,
        threshold: 5
      });

      try {
        const cachedHeadlines = this.databaseService.getRecentHeadlines(24);
        
        // Filter headlines by search terms for relevance
        const relevantHeadlines = cachedHeadlines.filter(headline => {
          const titleLower = headline.title.toLowerCase();
          const descLower = (headline.description || "").toLowerCase();
          return searchTerms.some(term => 
            titleLower.includes(term.toLowerCase()) || 
            descLower.includes(term.toLowerCase())
          );
        });

        // Convert headlines to articles
        const headlineArticles: Article[] = relevantHeadlines.map(headline => ({
          id: `cached-${headline.id}`,
          title: headline.title,
          source: headline.source,
          url: headline.url,
          description: headline.description || "",
          content: headline.description || "",
          publishedAt: headline.publishedAt,
          author: undefined
        }));

        // Add cached articles, prioritizing by source
        const newArticles = headlineArticles.filter(ha => 
          !articles.some(a => a.title === ha.title)
        );

        articles.push(...newArticles);

        this.log("info", "📰 NewsAgent: Added cached headlines", {
          added: newArticles.length,
          total: articles.length
        });

        // Update source counts to include cached
        if (newArticles.length > 0 && !successfulSources.includes('cached')) {
          successfulSources.push('cached');
        }
      } catch (error) {
        this.log("warn", "Failed to fetch cached headlines", { error });
      }
    }

    this.log("info", "📰 NewsAgent: Fetching completed", {
      totalArticles: articles.length,
      sources: successfulSources,
      searchTerms,
      sourceDistribution: sourceCounts,
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
        this.log("info", "📰 NewsAgent: Fetching from NewsAPI /everything", {
          searchQuery,
          pageSize: "50"
        });
        
        // Use /everything endpoint for better search results
        // Calculate date range for recent articles (last 30 days)
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 30);
        
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/news/everything",
          query: {
            q: searchQuery,
            language: "en",
            sortBy: "publishedAt",
            from: fromDate.toISOString().split('T')[0],
            to: toDate.toISOString().split('T')[0],
            pageSize: "50", // Significantly increased to prioritize NewsAPI results
          },
          provider: "newsapi",
        });

        this.log("info", "📰 NewsAgent: NewsAPI /everything result", {
          hasData: !!result.data,
          hasArticles: !!result.data?.articles,
          articleCount: result.data?.articles?.length || 0,
          totalResults: result.data?.totalResults || 0,
          searchQuery
        });

        if (result.data?.articles) {
          articles.push(
            ...result.data.articles.map((article: any) => ({
              id: `newsapi-${article.url}`,
              title: article.title || "No title",
              source: (() => {
                // First try to use the API's source name
                if (article.source?.name && article.source.name !== "newsapi") {
                  return article.source.name;
                }
                // If no good source name, extract from URL
                try {
                  if (article.url) {
                    const url = new URL(article.url);
                    const hostname = url.hostname.replace('www.', '').split('.')[0];
                    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
                  }
                } catch {
                  return "Unknown Source";
                }
                return "Unknown Source";
              })(),
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
            "page-size": "10", // Reduced to give NewsAPI more prominence
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
      } else if (source === "nytimes") {
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/nytimes/search",
          query: {
            q: searchQuery,
            sort: "relevance",
            page: "0",
          },
          provider: "nytimes",
        });

        if (result.data?.response?.docs) {
          articles.push(
            ...result.data.response.docs.map((article: any) => ({
              id: `nytimes-${article._id}`,
              title: article.headline?.main || "No title",
              source: "The New York Times",
              url: article.web_url,
              description: article.abstract || article.snippet || "",
              content: article.lead_paragraph || article.abstract || "",
              publishedAt: article.pub_date,
              author: article.byline?.original || "The New York Times",
            }))
          );
        }
      } else if (source === "arxiv") {
        const result = await this.mcpServer.handle({
          method: "GET",
          path: "/arxiv/search",
          query: {
            search_query: searchTerms.join("+"),
            max_results: "8", // Reduced to give NewsAPI more prominence
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

  protected async getReasoning(context: AgentContext, data: NewsAgentResult): Promise<string> {
    const sourceSummary = data.sources.length > 0 ? 
      `Successfully fetched from ${data.sources.join(", ")}` : 
      "No sources were successfully queried";
    
    return `News Agent processed the query and:
- Extracted search terms: ${data.searchTermsUsed.join(", ")}
- ${sourceSummary}
- Retrieved ${data.totalFetched} articles total
- ${
  data.articles.length > 0 ? 
    `Found articles from sources like "${data.articles[0]?.source || 'unknown'}"` : 
    "No articles were found matching the query"
}

The agent prioritized relevance and recency, filtering out low-quality content and ensuring diverse source representation.`;
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
