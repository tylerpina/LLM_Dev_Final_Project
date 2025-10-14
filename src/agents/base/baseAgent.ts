import { openai } from "@ai-sdk/openai";
import {
  AgentRole,
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentMetrics,
} from "../types";
import { AGENT_CONFIGS } from "../config";
import logger from "../../utils/logger";

/**
 * Abstract base class for all agents in the system
 * Provides common functionality for execution, logging, and error handling
 */
export abstract class BaseAgent<TResult = any> {
  protected role: AgentRole;
  protected config: AgentConfig;

  constructor(role: AgentRole, config?: Partial<AgentConfig>) {
    this.role = role;
    this.config = { ...AGENT_CONFIGS[role], ...config };
  }

  /**
   * Execute the agent with the given context
   * This is the main entry point that handles timing, errors, and logging
   */
  async execute(context: AgentContext): Promise<AgentResult<TResult>> {
    const startTime = Date.now();
    const metrics: AgentMetrics = {
      agentRole: this.role,
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 0,
      tokensUsed: 0,
      success: false,
    };

    try {
      logger.info(`[${this.role}] Starting execution`, {
        query: context.query,
        userId: context.userId,
      });

      // Call the abstract process method implemented by each agent
      const data = await this.process(context);

      const executionTimeMs = Date.now() - startTime;
      metrics.endTime = new Date();
      metrics.durationMs = executionTimeMs;
      metrics.success = true;

      logger.info(`[${this.role}] Execution completed`, {
        durationMs: executionTimeMs,
        success: true,
      });

      return {
        role: this.role,
        success: true,
        data,
        executionTimeMs,
        timestamp: new Date(),
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      metrics.endTime = new Date();
      metrics.durationMs = executionTimeMs;
      metrics.success = false;
      metrics.errorMessage = error.message;

      logger.error(`[${this.role}] Execution failed`, {
        error: error.message,
        durationMs: executionTimeMs,
        stack: error.stack,
      });

      return {
        role: this.role,
        success: false,
        data: this.getDefaultResult(),
        error: error.message,
        executionTimeMs,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Abstract method that each agent must implement
   * Contains the core logic for that specific agent
   */
  protected abstract process(context: AgentContext): Promise<TResult>;

  /**
   * Get default result in case of failure
   * Each agent should override this to provide sensible defaults
   */
  protected abstract getDefaultResult(): TResult;

  /**
   * Get the OpenAI model instance configured for this agent
   */
  protected getModel() {
    return openai(this.config.model);
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Get agent role
   */
  getRole(): AgentRole {
    return this.role;
  }

  /**
   * Log a message with agent context
   */
  protected log(level: "info" | "warn" | "error", message: string, meta?: any) {
    logger[level](`[${this.role}] ${message}`, meta);
  }
}
