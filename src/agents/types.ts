import { UserProfile } from "../services/personalizationService";

/**
 * Agent roles in the multi-agent system
 */
export enum AgentRole {
  COORDINATOR = "coordinator",
  NEWS = "news",
  SENTIMENT = "sentiment",
  TREND = "trend",
  BIAS = "bias",
  PERSONALIZATION = "personalization",
  SYNTHESIS = "synthesis",
}

/**
 * Configuration for each agent
 */
export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  maxConcurrentRequests?: number;
}

/**
 * Shared context passed between agents
 */
export interface AgentContext {
  query: string;
  userId: string;
  userProfile?: UserProfile;
  searchTerms?: string[];
  intent?:
    | "news"
    | "research"
    | "analysis"
    | "comparison"
    | "trend"
    | "general";
  agentsToRun?: AgentRole[];
  rawData?: any;
  sources?: Array<{
    provider: string;
    url?: string;
    title?: string;
  }>;
  timestamp: Date;
}

/**
 * Standard result format from each agent
 */
export interface AgentResult<T = any> {
  role: AgentRole;
  success: boolean;
  data: T;
  error?: string;
  executionTimeMs: number;
  tokensUsed?: number;
  timestamp: Date;
  reasoning?: string; // Agent's reasoning/thinking process
}

/**
 * Article structure
 */
export interface Article {
  id: string;
  title: string;
  source: string;
  url?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  author?: string;
}

/**
 * News Agent Result
 */
export interface NewsAgentResult {
  articles: Article[];
  totalFetched: number;
  sources: string[];
  searchTermsUsed: string[];
}

/**
 * Sentiment Analysis Result
 */
export interface SentimentAgentResult {
  overallSentiment: "positive" | "negative" | "neutral" | "mixed";
  articleSentiments: Array<{
    articleId: string;
    sentiment: "positive" | "negative" | "neutral";
    score: number;
    emotions: string[];
  }>;
  sentimentTrend: string;
}

/**
 * Trend Detection Result
 */
export interface TrendAgentResult {
  mainTopics: string[];
  emergingThemes: string[];
  keyInsights: string[];
  temporalPattern: string;
}

/**
 * Bias Detection Result
 */
export interface BiasAgentResult {
  sourceDiversity: {
    leftLeaning: number;
    rightLeaning: number;
    neutral: number;
    total: number;
  };
  biasWarnings: string[];
  perspectives: string[];
  recommendation: string;
}

/**
 * Coordination Result
 */
export interface CoordinationResult {
  intent: "news" | "research" | "analysis" | "comparison" | "trend" | "general";
  agentsToRun: AgentRole[];
  searchTerms: string[];
  userContext: {
    interests: string[];
    recentQueries: string[];
    hasHistory: boolean;
  };
  priority: "speed" | "depth" | "balanced";
}

/**
 * Personalization Result
 */
export interface PersonalizationResult {
  rankedArticles: Array<{
    article: Article;
    relevanceScore: number;
    matchedInterests: string[];
  }>;
  personalizedInsights: string[];
  recommendedFollowUps: string[];
}

/**
 * Final orchestration result
 */
export interface OrchestrationResult {
  synthesizedResponse: string;
  agentsExecuted: AgentRole[];
  executionTimeMs: number;
  estimatedCost: number;
  sources: Array<{
    provider: string;
    url?: string;
    title?: string;
  }>;
  metadata: {
    coordination?: CoordinationResult;
    news?: NewsAgentResult;
    sentiment?: SentimentAgentResult;
    trend?: TrendAgentResult;
    bias?: BiasAgentResult;
    personalization?: PersonalizationResult;
  };
  agentReasoning?: {
    [key in AgentRole]?: string;
  };
  timestamp: string;
}

/**
 * Execution metrics for monitoring
 */
export interface AgentMetrics {
  agentRole: AgentRole;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  tokensUsed: number;
  success: boolean;
  errorMessage?: string;
}
