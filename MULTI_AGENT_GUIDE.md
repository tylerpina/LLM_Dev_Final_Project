# Multi-Agent News Intelligence System

## Overview

The multi-agent system enhances the news intelligence platform with parallel specialist agents that provide deep, multi-perspective analysis of news content.

## Architecture

```
User Query + userId
       ↓
[Coordinator Agent] ← Reads user profile & plans execution
       ↓
┌──────┴──────┬─────────┬──────────┐
↓             ↓         ↓          ↓
[NewsAgent] [SentimentAgent] [TrendAgent] [BiasAgent]
(parallel)   (parallel)      (parallel)   (parallel)
       ↓
[PersonalizationAgent] ← Filters/ranks by user interests
       ↓
[SynthesisAgent] ← Creates final markdown report
       ↓
   Response
```

## Agents

### 1. Coordinator Agent

**Role:** Query analysis and execution planning

- Analyzes user query intent (news, research, analysis, comparison, trend)
- Loads user profile if available
- Determines which specialist agents to activate
- Sets execution priority (speed, depth, balanced)

### 2. News Agent (Specialist)

**Role:** Fetch relevant articles from all sources

- Extracts optimal search terms from query
- Fetches from NewsAPI, Guardian, ArXiv in parallel
- Normalizes article structure across sources
- **Runs:** Always (foundational data)

### 3. Sentiment Agent (Specialist)

**Role:** Emotional tone and sentiment analysis

- Analyzes sentiment per article (positive/negative/neutral)
- Identifies emotional tones (optimism, concern, anger, etc.)
- Calculates overall sentiment trend
- **Runs:** When query needs emotional context or analysis

### 4. Trend Agent (Specialist)

**Role:** Pattern and trend detection

- Identifies main topics and themes
- Detects emerging trends
- Analyzes temporal patterns
- Provides key insights
- **Runs:** When query asks about trends or patterns

### 5. Bias Agent (Specialist)

**Role:** Source diversity and bias detection

- Analyzes source political leanings
- Identifies potential biases in coverage
- Checks perspective diversity
- Recommends additional sources if needed
- **Runs:** When query compares sources or needs balanced perspective

### 6. Personalization Agent

**Role:** User-specific filtering and ranking

- Ranks articles by relevance to user interests
- Generates personalized insights
- Recommends follow-up queries
- Tracks user interactions
- **Runs:** Always (uses user profile if available)

### 7. Synthesis Agent

**Role:** Final report generation

- Combines insights from all agents
- Creates structured markdown report
- Cites sources and evidence
- Formats for readability
- **Runs:** Always (final step)

## Usage

### Enable Multi-Agent System

Add to your `.env` file:

```bash
USE_MULTI_AGENT=true
```

### Basic Query

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest developments in AI safety?",
    "userId": "user123"
  }'
```

### Force Multi-Agent (Override Feature Flag)

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Compare how different outlets cover climate policy",
    "userId": "user123",
    "useMultiAgent": true
  }'
```

### Debug Mode (See Individual Agent Outputs)

```bash
curl -X POST http://localhost:3000/ask/debug \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Latest AI breakthroughs",
    "userId": "user123"
  }'
```

## Response Format

```json
{
  "synthesizedResponse": "## Summary\n\n**Key Finding:** ...",
  "metadata": {
    "agentsExecuted": ["coordinator", "news", "sentiment", "trend", "bias", "personalization", "synthesis"],
    "executionTimeMs": 4532,
    "estimatedCost": 0.0023,
    "system": "multi-agent"
  },
  "sources": [
    { "provider": "The Guardian", "url": "...", "title": "..." },
    { "provider": "ArXiv", "url": "...", "title": "..." }
  ],
  "detailedResults": {
    "coordination": { "intent": "analysis", "priority": "depth", ... },
    "news": { "articles": [...], "totalFetched": 15, ... },
    "sentiment": { "overallSentiment": "mixed", ... },
    "trend": { "mainTopics": [...], "emergingThemes": [...], ... },
    "bias": { "sourceDiversity": {...}, "biasWarnings": [...], ... },
    "personalization": { "rankedArticles": [...], ... }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Monitoring Endpoints

### Agent Statistics

```bash
curl http://localhost:3000/agents/stats
```

Returns execution counts, success rates, and errors per agent.

### Performance Summary

```bash
curl http://localhost:3000/agents/performance
```

Returns average execution times and token usage per agent.

### Cost Estimates

```bash
curl http://localhost:3000/agents/costs
```

Returns estimated costs per agent and per query.

## Benefits vs. Single-Agent System

| Feature             | Single Agent    | Multi-Agent                  |
| ------------------- | --------------- | ---------------------------- |
| **Speed**           | ~2-3 seconds    | ~4-5 seconds (parallel)      |
| **Depth**           | Basic synthesis | Multi-perspective analysis   |
| **Sentiment**       | Not available   | Comprehensive tone analysis  |
| **Trends**          | Not available   | Pattern detection & insights |
| **Bias**            | Not available   | Source diversity & warnings  |
| **Personalization** | Basic           | Deep profile-based ranking   |
| **Transparency**    | Black box       | See each agent's reasoning   |
| **Extensibility**   | Hard to modify  | Easy to add new agents       |
| **Cost**            | ~$0.001/query   | ~$0.002-0.003/query          |

## Query Examples

### Simple News Query

```json
{
  "query": "Latest AI news",
  "userId": "user123"
}
```

**Agents activated:** News, Personalization, Synthesis

### Complex Analysis

```json
{
  "query": "How do different outlets cover the climate summit? What are the emerging themes?",
  "userId": "user123"
}
```

**Agents activated:** All agents (comprehensive analysis)

### Trend Detection

```json
{
  "query": "What's trending in quantum computing research?",
  "userId": "user123"
}
```

**Agents activated:** News, Trend, Personalization, Synthesis

### Bias Analysis

```json
{
  "query": "Compare coverage of the election from different sources",
  "userId": "user123"
}
```

**Agents activated:** News, Sentiment, Bias, Personalization, Synthesis

## Configuration

Agent configurations are in `src/agents/config.ts`:

```typescript
export const AGENT_CONFIGS = {
  coordinator: {
    model: "gpt-4o-mini",
    temperature: 0.1,
    maxTokens: 500,
  },
  // ... other agents
  synthesis: {
    model: "gpt-4o", // Uses full model for best quality
    temperature: 0.7,
    maxTokens: 2000,
  },
};
```

## Migration from Legacy System

The multi-agent system coexists with the legacy single-agent system:

1. **Feature Flag:** Set `USE_MULTI_AGENT=true` to enable globally
2. **Per-Request:** Send `useMultiAgent: true` in request body
3. **Gradual Rollout:** Test with specific users before full migration
4. **Fallback:** Legacy system remains available if multi-agent fails

## Performance Optimization

### Parallel Execution

- Specialist agents (News, Sentiment, Trend, Bias) run in parallel
- ~4x faster than sequential execution
- News agent runs first (others depend on its data)

### Cost Optimization

- Uses `gpt-4o-mini` for most agents (~10x cheaper)
- Only Synthesis agent uses `gpt-4o` for best quality
- Average cost: $0.002-0.003 per query

### Caching Opportunities

- News articles can be cached per search term
- User profiles already cached in memory
- Agent results could be cached for similar queries

## Troubleshooting

### Multi-Agent Not Available

**Error:** "Multi-agent system not available"
**Solution:** Ensure `OPENAI_API_KEY` is set in `.env`

### Slow Responses

**Cause:** All agents running for simple queries
**Solution:** Coordinator will optimize based on query complexity

### High Costs

**Check:** `/agents/costs` endpoint
**Optimize:** Reduce maxTokens in `config.ts` or use caching

## Future Enhancements

1. **Fact-Checking Agent:** Verify claims across sources
2. **Citation Graph Agent:** Track how stories evolve
3. **Summarization Agent:** Create custom-length summaries
4. **Alert Agent:** Monitor topics and notify on changes
5. **Research Agent:** Deep-dive on specific topics
6. **Translation Agent:** Multi-language support
