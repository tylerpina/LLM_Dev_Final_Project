import { AgentConfig, AgentRole } from "./types";

/**
 * Configuration for each agent in the system
 * Optimized for balance between cost, speed, and quality
 */
export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  [AgentRole.COORDINATOR]: {
    model: "gpt-4o-mini",
    temperature: 0.1, // Low temperature for consistent analysis
    maxTokens: 800, // Increased from 500
  },
  [AgentRole.NEWS]: {
    model: "gpt-4o-mini",
    temperature: 0.3, // Slightly higher for search term extraction
    maxTokens: 1500, // Increased from 1000
    maxConcurrentRequests: 3,
  },
  [AgentRole.SENTIMENT]: {
    model: "gpt-4o-mini",
    temperature: 0.2, // Low for consistent sentiment classification
    maxTokens: 1200, // Increased from 800
  },
  [AgentRole.TREND]: {
    model: "gpt-4o-mini",
    temperature: 0.4, // Higher for pattern recognition
    maxTokens: 1500, // Increased from 1000
  },
  [AgentRole.BIAS]: {
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1200, // Increased from 800
  },
  [AgentRole.PERSONALIZATION]: {
    model: "gpt-4o-mini",
    temperature: 0.5, // Higher for creative matching
    maxTokens: 1500, // Increased from 1000
  },
  [AgentRole.SYNTHESIS]: {
    model: "gpt-4o", // Use full model for best synthesis quality
    temperature: 0.7, // Higher for natural, engaging writing
    maxTokens: 4000, // Increased from 2000 for more comprehensive coverage
  },
};

/**
 * Cost estimation per 1M tokens (approximate OpenAI pricing)
 */
export const TOKEN_COSTS = {
  "gpt-4o-mini": {
    input: 0.15, // $0.15 per 1M input tokens
    output: 0.6, // $0.60 per 1M output tokens
  },
  "gpt-4o": {
    input: 2.5, // $2.50 per 1M input tokens
    output: 10.0, // $10.00 per 1M output tokens
  },
};

/**
 * Calculate estimated cost for a token usage
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COSTS[model as keyof typeof TOKEN_COSTS];
  if (!costs) return 0;

  const inputCost = (inputTokens / 1000000) * costs.input;
  const outputCost = (outputTokens / 1000000) * costs.output;

  return inputCost + outputCost;
}

/**
 * System-wide configuration
 */
export const SYSTEM_CONFIG = {
  // Maximum parallel agents to run simultaneously
  maxParallelAgents: 4,

  // Timeout for individual agent execution (ms)
  agentTimeout: 30000,

  // Whether to continue if some agents fail
  continueOnAgentFailure: true,

  // Minimum number of articles to fetch
  minArticles: 8, // Increased from 5

  // Maximum number of articles to process
  maxArticles: 40, // Increased from 20 to double coverage

  // Enable detailed debugging
  debugMode: process.env.NODE_ENV === "development",
};
