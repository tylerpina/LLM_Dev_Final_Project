export interface PromptConfig {
  analysisPrompt: string;
  synthesisPrompt: string;
  responseStyle: 'professional' | 'conversational' | 'technical' | 'bullet-points';
  includeGreeting: boolean;
  maxResponseLength: number;
}

export const DEFAULT_PROMPTS: PromptConfig = {
  analysisPrompt: `
Analyze this user query and determine:
1. Intent: news, research, analysis, trend, or general
2. Which sources to query: newsapi, guardian, arxiv (can be multiple)
3. Key search terms to extract
4. How many results to fetch (1-10)
5. Whether synthesis is needed

Query: "{query}"

Respond with JSON only:
{
  "intent": "news|research|analysis|trend|general",
  "sources": ["newsapi", "guardian", "arxiv"],
  "searchTerms": ["term1", "term2"],
  "maxResults": 5,
  "requiresSynthesis": true
}`,

  synthesisPrompt: `
User asked: "{query}"

Here's the data from multiple sources:
{dataSummary}

Provide a comprehensive, synthesized response that:
1. Directly answers the user's question
2. Cites specific sources and findings
3. Highlights key trends or patterns
4. Keeps it professional and informative
5. Mentions source attribution

Response:`,

  responseStyle: 'professional',
  includeGreeting: false,
  maxResponseLength: 300
};

export const PROMPT_STYLES: Record<string, Partial<PromptConfig>> = {
  professional: {
    synthesisPrompt: `
User asked: "{query}"

Here's the data from multiple sources:
{dataSummary}

Provide a professional, synthesized response that:
1. Directly answers the user's question
2. Cites specific sources and findings
3. Highlights key trends or patterns
4. Uses professional tone
5. Mentions source attribution

Response:`,
    includeGreeting: false,
    maxResponseLength: 300
  },

  conversational: {
    synthesisPrompt: `
User asked: "{query}"

Here's the data from multiple sources:
{dataSummary}

Provide a friendly, conversational response that:
1. Directly answers the user's question
2. Cites specific sources and findings
3. Highlights key trends or patterns
4. Uses a warm, engaging tone
5. Mentions source attribution

Response:`,
    includeGreeting: true,
    maxResponseLength: 400
  },

  technical: {
    synthesisPrompt: `
User asked: "{query}"

Here's the data from multiple sources:
{dataSummary}

Provide a technical, detailed response that:
1. Directly answers the user's question with technical depth
2. Cites specific sources and findings with technical details
3. Highlights key trends or patterns with technical analysis
4. Uses precise, technical language
5. Mentions source attribution

Response:`,
    includeGreeting: false,
    maxResponseLength: 500
  },

  'bullet-points': {
    synthesisPrompt: `
User asked: "{query}"

Here's the data from multiple sources:
{dataSummary}

Provide a structured response using bullet points that:
1. Directly answers the user's question
2. Lists key findings from sources
3. Highlights trends or patterns
4. Uses bullet points for clarity
5. Includes source attribution

Format as bullet points. Response:`,
    includeGreeting: false,
    maxResponseLength: 400
  }
};

export class PromptManager {
  private config: PromptConfig;

  constructor(config?: Partial<PromptConfig>) {
    this.config = { ...DEFAULT_PROMPTS, ...config };
  }

  updateConfig(newConfig: Partial<PromptConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  setResponseStyle(style: string) {
    const styleConfig = PROMPT_STYLES[style];
    if (styleConfig) {
      this.config = { ...this.config, ...styleConfig };
      this.config.responseStyle = style as any;
    }
  }

  getAnalysisPrompt(query: string): string {
    return this.config.analysisPrompt.replace('{query}', query);
  }

  getSynthesisPrompt(query: string, dataSummary: string): string {
    let prompt = this.config.synthesisPrompt
      .replace('{query}', query)
      .replace('{dataSummary}', dataSummary);

    // Add greeting if enabled
    if (this.config.includeGreeting) {
      prompt = `Hey there! ${prompt}`;
    }

    return prompt;
  }

  getConfig(): PromptConfig {
    return { ...this.config };
  }

  getMaxTokens(): number {
    return this.config.maxResponseLength;
  }
}

