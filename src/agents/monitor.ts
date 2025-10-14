import { AgentRole, AgentMetrics } from "./types";
import logger from "../utils/logger";

/**
 * Agent Monitoring Service
 * Tracks execution metrics, costs, and performance
 */
export class AgentMonitor {
  private metrics: Map<string, AgentMetrics[]> = new Map();
  private sessionStartTime: Date = new Date();

  /**
   * Record agent execution metrics
   */
  recordExecution(metrics: AgentMetrics): void {
    const key = metrics.agentRole;

    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    this.metrics.get(key)!.push(metrics);

    // Log execution
    logger.info("Agent execution recorded", {
      agent: metrics.agentRole,
      durationMs: metrics.durationMs,
      tokensUsed: metrics.tokensUsed,
      success: metrics.success,
    });
  }

  /**
   * Get metrics for a specific agent
   */
  getAgentMetrics(role: AgentRole): AgentMetrics[] {
    return this.metrics.get(role) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, AgentMetrics[]> {
    return new Map(this.metrics);
  }

  /**
   * Get aggregated statistics
   */
  getStatistics() {
    const stats: Record<string, any> = {};

    this.metrics.forEach((metricsList, agentRole) => {
      const successful = metricsList.filter((m) => m.success);
      const failed = metricsList.filter((m) => !m.success);

      const durations = successful.map((m) => m.durationMs);
      const avgDuration =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      const totalTokens = successful.reduce(
        (sum, m) => sum + (m.tokensUsed || 0),
        0
      );

      stats[agentRole] = {
        totalExecutions: metricsList.length,
        successful: successful.length,
        failed: failed.length,
        successRate:
          metricsList.length > 0 ? successful.length / metricsList.length : 0,
        averageDurationMs: avgDuration,
        totalTokensUsed: totalTokens,
        errors: failed.map((m) => m.errorMessage),
      };
    });

    return {
      agents: stats,
      sessionStartTime: this.sessionStartTime,
      totalQueries: this.getTotalQueries(),
    };
  }

  /**
   * Get total number of queries processed
   */
  private getTotalQueries(): number {
    // Each coordinator execution represents one query
    const coordinatorMetrics = this.metrics.get(AgentRole.COORDINATOR) || [];
    return coordinatorMetrics.length;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const stats = this.getStatistics();
    const summary = {
      totalQueries: stats.totalQueries,
      sessionDurationMinutes: Math.round(
        (Date.now() - this.sessionStartTime.getTime()) / 60000
      ),
      agents: {} as Record<string, any>,
    };

    Object.entries(stats.agents).forEach(([agent, data]: [string, any]) => {
      summary.agents[agent] = {
        executions: data.totalExecutions,
        successRate: `${(data.successRate * 100).toFixed(1)}%`,
        avgDurationMs: Math.round(data.averageDurationMs),
        totalTokens: data.totalTokensUsed,
      };
    });

    return summary;
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary(): void {
    const summary = this.getPerformanceSummary();
    logger.info("Agent Performance Summary", summary);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.sessionStartTime = new Date();
    logger.info("Agent metrics cleared");
  }

  /**
   * Get cost estimates
   */
  getCostEstimates() {
    const stats = this.getStatistics();
    const costPerToken = {
      "gpt-4o-mini": 0.00000075, // Approximate blended rate
      "gpt-4o": 0.00000625, // Approximate blended rate
    };

    let totalCost = 0;

    Object.entries(stats.agents).forEach(([agent, data]: [string, any]) => {
      const model = agent === AgentRole.SYNTHESIS ? "gpt-4o" : "gpt-4o-mini";
      const cost = data.totalTokensUsed * costPerToken[model];
      totalCost += cost;
    });

    return {
      totalCost: `$${totalCost.toFixed(4)}`,
      costPerQuery:
        stats.totalQueries > 0
          ? `$${(totalCost / stats.totalQueries).toFixed(4)}`
          : "$0.0000",
      breakdown: Object.entries(stats.agents).map(
        ([agent, data]: [string, any]) => {
          const model =
            agent === AgentRole.SYNTHESIS ? "gpt-4o" : "gpt-4o-mini";
          const cost = data.totalTokensUsed * costPerToken[model];
          return {
            agent,
            tokens: data.totalTokensUsed,
            estimatedCost: `$${cost.toFixed(4)}`,
          };
        }
      ),
    };
  }
}

// Global monitor instance
export const agentMonitor = new AgentMonitor();
