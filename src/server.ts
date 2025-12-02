import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import { UniversalMcpServer } from "./mcp/universalMcp";
import { IntelligentQueryRouter } from "./services/intelligentQueryRouter";
import { EmbeddingService } from "./services/embeddingService";
import { PersonalizationService } from "./services/personalizationService";
import { DatabaseService } from "./services/databaseService";
import { HeadlineFetcherService } from "./services/headlineFetcherService";
import { VectorStore } from "./services/vectorStore";
import { MultiAgentOrchestrator } from "./agents/orchestrator";
import { agentMonitor } from "./agents/monitor";
import {
  NotificationService,
  EmailProvider,
} from "./services/notificationService";
import { DailyRoundupService } from "./services/dailyRoundupService";
import { DigestService } from "./services/digestService";
import { DigestScheduler } from "./services/digestScheduler";
import logger from "./utils/logger";
import { triggerStartupDigest } from "./utils/startupDigest";

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Detect serverless environment (Vercel, AWS Lambda, etc.)
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Feature flag for multi-agent system
const USE_MULTI_AGENT = process.env.USE_MULTI_AGENT === "true";

// Initialize MCP server with available API keys
const mcpServer = new UniversalMcpServer(
  process.env.NEWSAPI_KEY || "",
  process.env.GUARDIAN_API_KEY,
  process.env.NYTIMES_API_KEY,
  process.env.OPENALEX_CONTACT_EMAIL || "mozaslan@mines.edu"
);

// Log available providers for debugging
logger.info("MCP Server initialized with providers:", {
  providers: mcpServer.getAvailableProviders(),
  hasNewsAPI: mcpServer.getAvailableProviders().includes('newsapi'),
  hasGuardian: mcpServer.getAvailableProviders().includes('guardian'),
  hasNYTimes: mcpServer.getAvailableProviders().includes('nytimes'),
  hasArxiv: mcpServer.getAvailableProviders().includes('arxiv'),
  hasOpenAlex: mcpServer.getAvailableProviders().includes('openalex')
});

// Initialize Vector Store
const vectorStore = new VectorStore();

// Initialize database first
const databaseService = new DatabaseService();

// Initialize personalization services
let embeddingService: EmbeddingService | null = null;
let personalizationService: PersonalizationService | null = null;

if (process.env.OPENAI_API_KEY) {
  embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY);
  // Pass the global vectorStore so personalization can use indexed headlines for recommendations
  personalizationService = new PersonalizationService(embeddingService, databaseService, vectorStore);

  // Initialize async
  personalizationService
    .initialize()
    .then(() => logger.info("Personalization service initialized"))
    .catch((err) =>
      logger.error("Failed to initialize personalization service:", err)
    );
}

// Initialize OpenAI-powered query router with bullet-point style by default
const queryRouter = new IntelligentQueryRouter(
  process.env.OPENAI_API_KEY || "",
  mcpServer,
  {
    responseStyle: "bullet-points",
    includeGreeting: false,
    maxResponseLength: 2500, // Increased for more detailed responses and comprehensive coverage
  },
  vectorStore,
  embeddingService || undefined
);

// Initialize multi-agent orchestrator
let multiAgentOrchestrator: MultiAgentOrchestrator | null = null;

if (process.env.OPENAI_API_KEY) {
  multiAgentOrchestrator = new MultiAgentOrchestrator(
    process.env.OPENAI_API_KEY,
    mcpServer,
    personalizationService
    //databaseService - commented out because not using database yet - TODO: add back in
  );
  logger.info("Multi-agent orchestrator initialized", {
    enabled: USE_MULTI_AGENT,
  });
}

// Initialize notification services
const notificationService = new NotificationService({
  emailProvider: process.env.EMAIL_PROVIDER as EmailProvider | undefined,
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sesRegion: process.env.AWS_SES_REGION,
  sesAccessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
  sesSecretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
  sesConfigurationSetName: process.env.AWS_SES_CONFIG_SET,
  defaultFromEmail: process.env.DIGEST_SENDER_EMAIL,
  defaultFromName: process.env.DIGEST_SENDER_NAME || "LLM Daily Roundup",
});
let dailyRoundupService: DailyRoundupService | null = null;

if (multiAgentOrchestrator) {
  dailyRoundupService = new DailyRoundupService(
    multiAgentOrchestrator,
    notificationService
  );
  // Only start scheduler if not in serverless environment
  if (!isServerless) {
    // Start scheduler (9 AM daily default)
    dailyRoundupService.startScheduler();
    logger.info("Daily Roundup Service initialized");
  } else {
    logger.info("Daily Roundup Service initialized (scheduler disabled in serverless)");
  }
}

const digestService = new DigestService(databaseService, personalizationService);
let digestScheduler: DigestScheduler | null = null;

if (notificationService.supportsEmail()) {
  digestScheduler = new DigestScheduler(digestService, notificationService);
  digestScheduler.start();
  logger.info("Email digest scheduler initialized", {
    cron: process.env.DIGEST_SEND_HOUR || "09:00",
  });
  triggerStartupDigest(digestScheduler);
} else {
  logger.warn(
    "Email provider not configured. Digest scheduler will remain disabled."
  );
}

// Initialize headline fetcher
const headlineFetcherService = new HeadlineFetcherService(
  databaseService,
  mcpServer,
  embeddingService || undefined,
  vectorStore
);

// Only start scheduled tasks if not in serverless environment
if (!isServerless) {
  // Start fetching headlines every hour
  headlineFetcherService.startScheduledFetching("0 * * * *"); // Every hour at minute 0

  // Clean old headlines daily at midnight
  setInterval(() => {
    const deleted = databaseService.cleanOldHeadlines(7); // Keep last 7 days
    logger.info("Cleaned old headlines", { deleted });
  }, 24 * 60 * 60 * 1000);
} else {
  logger.info("Scheduled tasks disabled in serverless environment");
}

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Request logging middleware
app.use(
  morgan("combined", {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  })
);

// Log server startup
logger.info("Starting LLM Dev Project server...", {
  port,
  providers: mcpServer.getAvailableProviders(),
  hasOpenAI: !!process.env.OPENAI_API_KEY,
});

app.get("/health", (_req, res) => {
  logger.info("Health check requested");
  res.json({
    status: "ok",
    providers: mcpServer.getAvailableProviders(),
    personalizationEnabled: !!personalizationService,
    timestamp: new Date().toISOString(),
  });
});

// AI-powered conversational endpoint
app.post("/ask", async (req, res) => {
  const startTime = Date.now();
  const { query, style, userId, useMultiAgent } = req.body;

  // Determine which system to use.
  // Explicit request overrides the env flag; otherwise fallback to env configuration.
  const shouldUseMultiAgent =
    typeof useMultiAgent === "boolean" ? useMultiAgent : USE_MULTI_AGENT;
  const canRunMultiAgent = shouldUseMultiAgent && !!multiAgentOrchestrator;

  logger.info("AI query received", {
    query,
    style,
    userId,
    useMultiAgentRequest: useMultiAgent,
    useMultiAgent: shouldUseMultiAgent,
    canRunMultiAgent,
    USE_MULTI_AGENT_ENV: USE_MULTI_AGENT,
    hasOrchestrator: !!multiAgentOrchestrator,
    timestamp: new Date().toISOString(),
  });

  try {
    if (!query) {
      logger.warn("Empty query received");
      return res.status(400).json({ error: "Query is required" });
    }

    if (shouldUseMultiAgent && !multiAgentOrchestrator) {
      logger.warn(
        "Multi-agent system requested but orchestrator unavailable. Falling back to legacy flow."
      );
    }

    // Use multi-agent system if enabled and available
    if (canRunMultiAgent && multiAgentOrchestrator) {
      const result = await multiAgentOrchestrator.processQuery(
        query,
        userId || "anonymous"
      );
      const duration = Date.now() - startTime;

      logger.info("Multi-agent query completed", {
        query,
        duration: `${duration}ms`,
        agentsUsed: result.agentsExecuted.length,
        estimatedCost: `$${result.estimatedCost.toFixed(4)}`,
      });

      // Track interaction for personalization
      if (personalizationService && userId) {
        try {
          await personalizationService.trackInteraction({
            userId,
            query,
            timestamp: new Date(),
            interactionType: "query",
          });
        } catch (err) {
          logger.warn("Failed to track interaction", { error: err });
        }
      }

      // Save query to history
      try {
        databaseService.saveQueryHistory({
          userId: userId || "anonymous",
          query,
          style: style || undefined,
          timestamp: new Date().toISOString(),
          executionTimeMs: result.executionTimeMs,
          agentsExecuted: JSON.stringify(result.agentsExecuted),
          sourcesCount: result.sources.length,
        });
      } catch (err) {
        logger.warn("Failed to save query to history", { error: err });
      }

      res.json({
        synthesizedResponse: result.synthesizedResponse,
        metadata: {
          agentsExecuted: result.agentsExecuted,
          executionTimeMs: result.executionTimeMs,
          estimatedCost: result.estimatedCost,
          system: "multi-agent",
        },
        sources: result.sources,
        detailedResults: result.metadata,
        agentReasoning: result.agentReasoning,
        timestamp: result.timestamp,
      });
    } else {
      // Fallback to original single-agent system
      // Track interaction if personalization is enabled
      if (personalizationService && userId) {
        await personalizationService.trackInteraction({
          userId,
          query,
          timestamp: new Date(),
          interactionType: "query",
        });
      }

      // Apply style if provided
      if (style) {
        queryRouter.setResponseStyle(style);
        logger.info("Response style updated", { style });
      }

      const response = await queryRouter.processQuery(query);
      const duration = Date.now() - startTime;

      logger.info("AI query completed (legacy system)", {
        query,
        duration: `${duration}ms`,
        sources: response.analysis.sources,
        intent: response.analysis.intent,
        style: queryRouter.getPromptConfig().responseStyle,
      });

      // Save query to history
      try {
        databaseService.saveQueryHistory({
          userId: userId || "anonymous",
          query,
          style: style || undefined,
          timestamp: new Date().toISOString(),
          executionTimeMs: duration,
          agentsExecuted: undefined,
          sourcesCount: response.sources?.length || 0,
        });
      } catch (err) {
        logger.warn("Failed to save query to history", { error: err });
      }

      res.json({
        ...response,
        metadata: {
          ...response.analysis,
          system: "legacy",
          executionTimeMs: duration,
        },
      });
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error("AI query failed", {
      query,
      duration: `${duration}ms`,
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Debug endpoint for detailed agent outputs
app.post("/ask/debug", async (req, res) => {
  try {
    if (!multiAgentOrchestrator) {
      return res.status(503).json({
        error: "Multi-agent system not available. Please set OPENAI_API_KEY.",
      });
    }

    const { query, userId } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    logger.info("Debug query requested", { query, userId });

    const result = await multiAgentOrchestrator.processQueryDetailed(
      query,
      userId || "anonymous"
    );

    res.json(result);
  } catch (err: any) {
    logger.error("Debug query failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Agent monitoring endpoints
app.get("/agents/stats", (_req, res) => {
  try {
    const stats = agentMonitor.getStatistics();
    res.json(stats);
  } catch (err: any) {
    logger.error("Failed to get agent stats", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/agents/performance", (_req, res) => {
  try {
    const performance = agentMonitor.getPerformanceSummary();
    res.json(performance);
  } catch (err: any) {
    logger.error("Failed to get performance summary", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/agents/costs", (_req, res) => {
  try {
    const costs = agentMonitor.getCostEstimates();
    res.json(costs);
  } catch (err: any) {
    logger.error("Failed to get cost estimates", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ================= NOTIFICATION ENDPOINTS =================

app.post("/notifications/roundup", async (req, res) => {
  try {
    if (!dailyRoundupService) {
      return res.status(503).json({ error: "Daily Roundup Service not available (Multi-Agent system disabled)" });
    }

    const { userId } = req.body;
    logger.info("Manual daily roundup requested", { userId });
    
    const result = await dailyRoundupService.generateAndSendRoundup(userId || "test_user");
    
    res.json(result);
  } catch (err: any) {
    logger.error("Manual roundup failed", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/notifications/digest", async (req, res) => {
  try {
    if (!digestScheduler) {
      return res.status(503).json({
        error:
          "Digest scheduler not available. Configure an email provider to enable digests.",
      });
    }

    const { userId, email } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const success = await digestScheduler.sendDigestNow(userId, email);

    res.json({
      success,
      message: success
        ? "Digest email sent successfully"
        : "Digest email failed. Check logs for details.",
    });
  } catch (err: any) {
    logger.error("Manual digest send failed", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/notifications/history/:userId", (req, res) => {
  const { userId } = req.params;
  const history = notificationService.getHistory(userId);
  res.json({ userId, history });
});

// ================= END NOTIFICATION ENDPOINTS =================

// ================= PERSONALIZATION ENDPOINTS =================

// Update user interests
app.post("/personalize/interests", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error: "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const { userId, interests } = req.body;

    if (!userId || !interests || !Array.isArray(interests)) {
      return res.status(400).json({
        error: "userId and interests (array) are required",
      });
    }

    await personalizationService.updateUserInterests(userId, interests);

    logger.info("User interests updated", { userId, count: interests.length });

    res.json({
      success: true,
      message: "Interests updated successfully",
      interests
    });
  } catch (err: any) {
    logger.error("Failed to update interests:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get personalized headlines based on interests
app.get("/headlines/personalized", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    let interests: string[] = [];
    
    // Get user interests if personalization service is available
    if (personalizationService) {
      const profile = personalizationService.getUserProfile(userId);
      if (profile && profile.interests) {
        interests = profile.interests;
      }
    }

    // If no interests found, return standard balanced headlines
    if (interests.length === 0) {
      const headlines = databaseService.getBalancedHeadlines(limit);
      return res.json({
        success: true,
        count: headlines.length,
        headlines,
        personalized: false,
        message: "No interests found, showing general headlines"
      });
    }

    // Fetch headlines matching interests
    const headlines = databaseService.getHeadlinesByCategories(interests, limit);

    logger.info("Personalized headlines retrieved", { 
      userId, 
      interests: interests.length,
      count: headlines.length 
    });

    res.json({
      success: true,
      count: headlines.length,
      headlines,
      personalized: true,
      interests
    });
  } catch (err: any) {
    logger.error("Failed to get personalized headlines:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get personalized recommendations for a user
app.get("/personalize/recommendations/:userId", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    logger.info("Personalized recommendations requested", { userId, limit });

    const recommendations =
      await personalizationService.getPersonalizedRecommendations(
        userId,
        limit
      );

    logger.info("Recommendations retrieved", {
      userId,
      count: recommendations.length,
    });

    res.json({
      userId,
      recommendations,
      count: recommendations.length,
    });
  } catch (err: any) {
    logger.error("Failed to get recommendations:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Search for similar content
app.post("/personalize/search", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const { query, userId, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    logger.info("Semantic search requested", { query, userId, limit });

    const results = await personalizationService.findSimilarContent(
      query,
      userId,
      limit || 10
    );

    logger.info("Semantic search completed", {
      query,
      resultCount: results.length,
    });

    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (err: any) {
    logger.error("Semantic search failed:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Index an article for personalization
app.post("/personalize/index", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const { articleId, title, content, metadata } = req.body;

    if (!articleId || !title || !content) {
      return res.status(400).json({
        error: "articleId, title, and content are required",
      });
    }

    logger.info("Indexing article", { articleId, title });

    await personalizationService.indexArticle(
      articleId,
      title,
      content,
      metadata
    );

    logger.info("Article indexed successfully", { articleId });

    res.json({
      success: true,
      articleId,
      message: "Article indexed successfully",
    });
  } catch (err: any) {
    logger.error("Failed to index article:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Track user interaction
app.post("/personalize/track", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const {
      userId,
      query,
      articleId,
      articleTitle,
      articleContent,
      interactionType,
    } = req.body;

    if (!userId || !interactionType) {
      return res.status(400).json({
        error: "userId and interactionType are required",
      });
    }

    logger.info("Tracking interaction", { userId, interactionType });

    await personalizationService.trackInteraction({
      userId,
      query: query || "",
      timestamp: new Date(),
      articleId,
      articleTitle,
      articleContent,
      interactionType,
    });

    logger.info("Interaction tracked successfully", {
      userId,
      interactionType,
    });

    res.json({
      success: true,
      message: "Interaction tracked successfully",
    });
  } catch (err: any) {
    logger.error("Failed to track interaction:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get user profile
app.get("/personalize/profile/:userId", async (req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const { userId } = req.params;
    const profile = personalizationService.getUserProfile(userId);

    if (!profile) {
      return res.status(404).json({
        error: "User profile not found",
        userId,
      });
    }

    logger.info("User profile retrieved", { userId });

    res.json(profile);
  } catch (err: any) {
    logger.error("Failed to get user profile:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get all user profiles (admin endpoint)
app.get("/personalize/profiles", async (_req, res) => {
  try {
    if (!personalizationService) {
      return res.status(503).json({
        error:
          "Personalization service not available. Please set OPENAI_API_KEY.",
      });
    }

    const profiles = personalizationService.getAllUserProfiles();

    logger.info("All user profiles retrieved", { count: profiles.length });

    res.json({
      profiles,
      count: profiles.length,
    });
  } catch (err: any) {
    logger.error("Failed to get user profiles:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ================= END PERSONALIZATION ENDPOINTS =================

// ================= HEADLINES ENDPOINTS =================

// Get recent headlines
app.get("/headlines", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const source = req.query.source as string;

    const headlines = source 
      ? databaseService.getRecentHeadlines(limit, source)
      : databaseService.getBalancedHeadlines(limit);

    logger.info("Headlines retrieved", { count: headlines.length, source });

    res.json({
      success: true,
      count: headlines.length,
      headlines,
    });
  } catch (err: any) {
    logger.error("Failed to get headlines:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get headlines by time range
app.get("/headlines/recent/:hours", (req, res) => {
  try {
    const hours = parseInt(req.params.hours) || 24;
    const headlines = databaseService.getHeadlinesByTimeRange(hours);

    logger.info("Headlines by time range retrieved", {
      hours,
      count: headlines.length,
    });

    res.json({
      success: true,
      hours,
      count: headlines.length,
      headlines,
    });
  } catch (err: any) {
    logger.error("Failed to get headlines by time range:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Search headlines
app.get("/headlines/search", (req, res) => {
  try {
    const keyword = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!keyword) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const headlines = databaseService.searchHeadlines(keyword, limit);

    logger.info("Headlines search completed", {
      keyword,
      count: headlines.length,
    });

    res.json({
      success: true,
      keyword,
      count: headlines.length,
      headlines,
    });
  } catch (err: any) {
    logger.error("Failed to search headlines:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get headline statistics
app.get("/headlines/stats", (_req, res) => {
  try {
    const stats = databaseService.getHeadlineStats();

    logger.info("Headlines stats retrieved", { sources: stats.length });

    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logger.error("Failed to get headlines stats:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Trigger immediate headline fetch
app.post("/headlines/fetch", async (_req, res) => {
  try {
    logger.info("Manual headline fetch triggered");

    // Trigger fetch in background
    headlineFetcherService
      .fetchNow()
      .then((count) => logger.info("Manual fetch completed", { count }))
      .catch((err) => logger.error("Manual fetch failed", err));

    res.json({
      success: true,
      message: "Headline fetch initiated",
    });
  } catch (err: any) {
    logger.error("Failed to trigger headline fetch:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ================= END HEADLINES ENDPOINTS =================

// ================= QUERY HISTORY ENDPOINTS =================

// Get query history for a user
app.get("/queries/history", (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;

    let history;
    if (search) {
      history = databaseService.searchQueryHistory(userId, search, limit);
    } else {
      history = databaseService.getQueryHistory(userId, limit);
    }

    logger.info("Query history retrieved", { userId, count: history.length });

    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (err: any) {
    logger.error("Failed to get query history:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get query history stats
app.get("/queries/history/stats", (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const stats = databaseService.getQueryHistoryStats(userId);

    logger.info("Query history stats retrieved", { userId });

    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logger.error("Failed to get query history stats:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Delete a query from history
app.delete("/queries/history/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.query.userId as string) || "anonymous";

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid query ID" });
    }

    const deleted = databaseService.deleteQueryHistory(id, userId);

    if (deleted) {
      logger.info("Query deleted from history", { id, userId });
      res.json({ success: true, message: "Query deleted successfully" });
    } else {
      res.status(404).json({ error: "Query not found" });
    }
  } catch (err: any) {
    logger.error("Failed to delete query:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Clear all query history for a user
app.delete("/queries/history", (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const deleted = databaseService.clearQueryHistory(userId);

    logger.info("Query history cleared", { userId, deleted });

    res.json({
      success: true,
      message: "Query history cleared successfully",
      deleted,
    });
  } catch (err: any) {
    logger.error("Failed to clear query history:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ================= END QUERY HISTORY ENDPOINTS =================

// ================= SAVED SEARCHES ENDPOINTS =================

// Get all saved searches for a user
app.get("/queries/saved", (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const searches = databaseService.getSavedSearches(userId);

    logger.info("Saved searches retrieved", { userId, count: searches.length });

    res.json({
      success: true,
      searches,
      count: searches.length,
    });
  } catch (err: any) {
    logger.error("Failed to get saved searches:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Get a specific saved search
app.get("/queries/saved/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.query.userId as string) || "anonymous";

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const search = databaseService.getSavedSearch(id, userId);

    if (search) {
      logger.info("Saved search retrieved", { id, userId });
      res.json({ success: true, search });
    } else {
      res.status(404).json({ error: "Saved search not found" });
    }
  } catch (err: any) {
    logger.error("Failed to get saved search:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Save a new search
app.post("/queries/saved", (req, res) => {
  try {
    const { userId, name, query, style } = req.body;

    if (!userId || !name || !query) {
      return res.status(400).json({
        error: "userId, name, and query are required",
      });
    }

    const id = databaseService.saveSearch({
      userId,
      name,
      query,
      style: style || undefined,
      createdAt: new Date().toISOString(),
    });

    logger.info("Search saved", { id, userId, name });

    res.json({
      success: true,
      id,
      message: "Search saved successfully",
    });
  } catch (err: any) {
    logger.error("Failed to save search:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Update a saved search
app.put("/queries/saved/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.query.userId as string) || req.body.userId || "anonymous";
    const { name, query, style } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const updated = databaseService.updateSavedSearch(id, userId, {
      name,
      query,
      style,
    });

    if (updated) {
      logger.info("Saved search updated", { id, userId });
      res.json({ success: true, message: "Search updated successfully" });
    } else {
      res.status(404).json({ error: "Saved search not found" });
    }
  } catch (err: any) {
    logger.error("Failed to update saved search:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Delete a saved search
app.delete("/queries/saved/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.query.userId as string) || "anonymous";

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const deleted = databaseService.deleteSavedSearch(id, userId);

    if (deleted) {
      logger.info("Saved search deleted", { id, userId });
      res.json({ success: true, message: "Search deleted successfully" });
    } else {
      res.status(404).json({ error: "Saved search not found" });
    }
  } catch (err: any) {
    logger.error("Failed to delete saved search:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Use a saved search (increments use count)
app.post("/queries/saved/:id/use", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req.query.userId as string) || req.body.userId || "anonymous";

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid search ID" });
    }

    const used = databaseService.useSavedSearch(id, userId);

    if (used) {
      const search = databaseService.getSavedSearch(id, userId);
      logger.info("Saved search used", { id, userId });
      res.json({
        success: true,
        search,
        message: "Search marked as used",
      });
    } else {
      res.status(404).json({ error: "Saved search not found" });
    }
  } catch (err: any) {
    logger.error("Failed to use saved search:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ================= END SAVED SEARCHES ENDPOINTS =================

// Prompt management endpoints
app.get("/prompts/config", (_req, res) => {
  logger.info("Prompt config requested");
  res.json(queryRouter.getPromptConfig());
});

app.post("/prompts/config", async (req, res) => {
  try {
    const { style, config } = req.body;

    if (style) {
      queryRouter.setResponseStyle(style);
      logger.info("Response style updated", { style });
    }

    if (config) {
      queryRouter.updatePromptConfig(config);
      logger.info("Prompt config updated", { config });
    }

    res.json({
      success: true,
      currentConfig: queryRouter.getPromptConfig(),
    });
  } catch (err: any) {
    logger.error("Prompt config update failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/prompts/styles", (_req, res) => {
  logger.info("Available prompt styles requested");
  res.json({
    styles: ["professional", "conversational", "technical", "bullet-points"],
    current: queryRouter.getPromptConfig().responseStyle,
  });
});

// Legacy endpoint for backward compatibility
app.get("/news/top-headlines", async (req, res) => {
  logger.info("NewsAPI headlines requested", { query: req.query });
  try {
    const {
      country = "us",
      category,
      q,
      pageSize,
      page,
    } = req.query as Record<string, any>;
    const result = await mcpServer.handle({
      method: "GET",
      path: "/news/top-headlines",
      query: { country, category, q, pageSize, page },
      provider: "newsapi",
    });
    logger.info("NewsAPI headlines retrieved", {
      country,
      category,
      q,
      resultCount: result.data?.articles?.length || 0,
    });
    res.json(result.data);
  } catch (err: any) {
    logger.error("NewsAPI headlines failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Guardian-specific endpoints
app.get("/guardian/search", async (req, res) => {
  logger.info("Guardian search requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/guardian/search",
      query: req.query as Record<string, string | string[]>,
      provider: "guardian",
    });
    logger.info("Guardian search completed", {
      resultCount: result.data?.response?.results?.length || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("Guardian search failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/guardian/sections", async (req, res) => {
  logger.info("Guardian sections requested");
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/guardian/sections",
      query: req.query as Record<string, string | string[]>,
      provider: "guardian",
    });
    logger.info("Guardian sections retrieved", {
      sectionCount: result.data?.response?.results?.length || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("Guardian sections failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// ArXiv-specific endpoints
app.get("/arxiv/search", async (req, res) => {
  logger.info("ArXiv search requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/arxiv/search",
      query: req.query as Record<string, string | string[]>,
      provider: "arxiv",
    });
    logger.info("ArXiv search completed", {
      resultCount: result.data?.feed?.entry?.length || 0,
      totalResults: result.data?.feed?.totalResults || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("ArXiv search failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/arxiv/paper", async (req, res) => {
  logger.info("ArXiv paper requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/arxiv/paper",
      query: req.query as Record<string, string | string[]>,
      provider: "arxiv",
    });
    logger.info("ArXiv paper retrieved", {
      paperId: req.query.id,
      hasResults: !!result.data?.feed?.entry?.length,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("ArXiv paper failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/arxiv/category", async (req, res) => {
  logger.info("ArXiv category search requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/arxiv/category",
      query: req.query as Record<string, string | string[]>,
      provider: "arxiv",
    });
    logger.info("ArXiv category search completed", {
      category: req.query.category,
      resultCount: result.data?.feed?.entry?.length || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("ArXiv category search failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// NYTimes-specific endpoints
app.get("/nytimes/search", async (req, res) => {
  logger.info("NYTimes search requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/nytimes/search",
      query: req.query as Record<string, string | string[]>,
      provider: "nytimes",
    });
    logger.info("NYTimes search completed", {
      resultCount: result.data?.response?.docs?.length || 0,
      totalResults: result.data?.response?.meta?.hits || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("NYTimes search failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/nytimes/archive", async (req, res) => {
  logger.info("NYTimes archive requested", { query: req.query });
  try {
    const result = await mcpServer.handle({
      method: "GET",
      path: "/nytimes/archive",
      query: req.query as Record<string, string | string[]>,
      provider: "nytimes",
    });
    logger.info("NYTimes archive completed", {
      year: req.query.year,
      month: req.query.month,
      resultCount: result.data?.response?.docs?.length || 0,
      totalResults: result.data?.response?.meta?.hits || 0,
    });
    res.json(result);
  } catch (err: any) {
    logger.error("NYTimes archive failed", { error: err.message });
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Export app for Vercel serverless functions
export default app;

// Only start listening if not in serverless environment
if (!isServerless) {
  app.listen(port, () => {
    logger.info("Server started successfully", {
      port,
      providers: mcpServer.getAvailableProviders(),
      aiEnabled: !!process.env.OPENAI_API_KEY,
      personalizationEnabled: !!personalizationService,
      multiAgentEnabled: USE_MULTI_AGENT,
    });
    console.log(`🚀 Server listening on port ${port}`);
    console.log(
      `📊 Available providers: ${mcpServer.getAvailableProviders().join(", ")}`
    );
    console.log(`AI-powered endpoint: POST /ask`);
    console.log(
      `🎯 Personalization: ${
        personalizationService ? "ENABLED" : "DISABLED (set OPENAI_API_KEY)"
      }`
    );
    console.log(
      `🧠 Multi-Agent System: ${
        USE_MULTI_AGENT ? "ENABLED ✨" : "DISABLED (set USE_MULTI_AGENT=true)"
      }`
    );
    if (USE_MULTI_AGENT) {
      console.log(
        `   ├─ Parallel Specialist Agents (News, Sentiment, Trend, Bias)`
      );
      console.log(`   ├─ Personalization & Synthesis`);
      console.log(`   └─ Debug endpoint: POST /ask/debug`);
    }
    console.log(
      `📈 Monitoring: GET /agents/stats, /agents/performance, /agents/costs`
    );
    console.log(`🌐 Web UI: http://localhost:${port}`);
  });
} else {
  logger.info("Running in serverless mode - app exported for Vercel");
}
