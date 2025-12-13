# LLM_Dev_Final_Project

A TypeScript-powered news intelligence platform with **multi-agent AI orchestration**. The system automatically **aggregates, analyzes, and summarizes news** from diverse online sources, generating **personalized insights** for each user. It leverages coordinated **AI agents for sentiment, bias, and trend detection**, along with an **LLM synthesizer** that compiles concise, context-aware summaries. Built for **professionals and students** who want quick, meaningful updates, the platform demonstrates scalable architecture, semantic search–based personalization, and seamless integration between frontend and backend components.

## 🚀 Features

- **Multi-Agent Intelligence System**: Parallel specialist agents for deep news analysis
- **Multiple News Sources**: NewsAPI, The Guardian, NYTimes, ArXiv, and OpenAlex research graphs
- **Vector-Based Personalization**: Learn user preferences over time
- **Automatic Headline Fetching**: Background jobs keep content fresh
- **AI-Powered Analysis**: Sentiment, trends, bias detection, and synthesis
- **Beautiful Web UI**: Full markdown support with real-time formatting

## Getting Started

1. Copy `.env.example` to `.env` and set your API keys:

   ```bash
   NEWSAPI_KEY=your_newsapi_key          # Get from https://newsapi.org
   GUARDIAN_API_KEY=your_guardian_key    # Get from https://open-platform.theguardian.com
   NYTIMES_API_KEY=your_nytimes_key      # Get from https://developer.nytimes.com
   OPENALEX_CONTACT_EMAIL=your_email     # Optional but recommended for OpenAlex.org
   OPENAI_API_KEY=your_openai_key        # Get from https://platform.openai.com/api-keys
   USE_MULTI_AGENT=true                  # Enable multi-agent system (recommended!)
   EMAIL_PROVIDER=ses                    # ses | sendgrid (auto-detected if omitted)
   AWS_SES_REGION=us-east-1              # Required for AWS SES
   AWS_SES_ACCESS_KEY_ID=your_access_key # Optional if using IAM role
   AWS_SES_SECRET_ACCESS_KEY=your_secret # Optional if using IAM role
   AWS_SES_CONFIG_SET=OptionalConfigSet  # Optional SES configuration set
   SENDGRID_API_KEY=optional_fallback    # Only needed if you prefer SendGrid
   DIGEST_SENDER_EMAIL=updates@yourdomain.com  # Verified sender/domain
   DIGEST_SENDER_NAME="LLM Daily Briefing"     # Optional friendly sender name
   DIGEST_SEND_HOUR=09:00                # 24h format (server timezone)
   DIGEST_DEFAULT_RECIPIENTS=user1@example.com,user2@example.com  # Optional fallback list
   ```

NOTIFICATION SYSTEM NOTE:

Amazon SES only supports sandbox approved emails, so the email notification service will NOT work unless you have registered your personal email in Amazon SES.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm run dev          # Development mode
   # OR
   npm run build        # Build for production
   npm start            # Run production server
   ```

4. Test the multi-agent system:
   ```bash
   ./examples/multi_agent_demo.sh
   ```

## Endpoints

### 🧠 Multi-Agent AI System

- **POST `/ask`** — AI-powered queries with multi-agent orchestration
- POST `/ask/debug` — Detailed agent outputs (see reasoning from each agent)
- GET `/agents/stats` — Execution statistics per agent
- GET `/agents/performance` — Performance metrics and timing
- GET `/agents/costs` — Cost estimates per agent and query

### Core Endpoints

- GET `/health` — Service status + available providers
- GET `/news/top-headlines` — NewsAPI top headlines (legacy)
- GET `/mcp/:provider/*` — Universal MCP endpoint
- GET `/guardian/search` — Guardian News search
- GET `/guardian/sections` — Guardian News sections
- GET `/nytimes/search` — NYTimes article search
- GET `/nytimes/archive` — NYTimes historical archive
- GET `/arxiv/search` — ArXiv academic papers search
- GET `/arxiv/paper` — Get specific ArXiv paper
- GET `/arxiv/category` — Search by ArXiv category

### 📰 Headlines Database Endpoints

- GET `/headlines` — Get recent headlines (auto-fetched hourly)
- GET `/headlines/recent/:hours` — Get headlines from last N hours
- GET `/headlines/search?q=keyword` — Search headlines by keyword
- GET `/headlines/stats` — Get statistics by source
- POST `/headlines/fetch` — Trigger immediate fetch

### 🎯 Personalization Endpoints (Requires OPENAI_API_KEY)

- GET `/personalize/recommendations/:userId` — Get personalized recommendations for a user
- POST `/personalize/search` — Semantic search for similar content
- POST `/personalize/index` — Index an article for personalization
- POST `/personalize/track` — Track user interactions (query, click, view, like)
- GET `/personalize/profile/:userId` — Get user profile and interests
- GET `/personalize/profiles` — Get all user profiles (admin)

### 📬 Notification & Digest Endpoints

- POST `/notifications/roundup` — Trigger an on-demand multi-agent roundup (console/dev)
- POST `/notifications/digest` — Send the latest email digest (requires configured email provider)
- GET `/notifications/history/:userId` — View notification send history for a user

## 🧠 Multi-Agent System

The platform uses a sophisticated multi-agent orchestration system for intelligent news analysis:

### Agents

1. **Coordinator Agent**: Analyzes queries and plans execution
2. **News Agent**: Fetches articles from all sources in parallel
3. **Sentiment Agent**: Analyzes emotional tone and sentiment
4. **Trend Agent**: Detects patterns and emerging themes
5. **Bias Agent**: Identifies source diversity and potential biases
6. **Personalization Agent**: Ranks results by user interests
7. **Synthesis Agent**: Creates comprehensive markdown reports

### Benefits

- **Parallel Processing**: 4x faster than sequential execution
- **Multi-Perspective**: Sentiment, trends, and bias analysis
- **Personalized**: Learns from user interactions
- **Transparent**: See reasoning from each agent in debug mode
- **Cost-Effective**: ~$0.002-0.003 per query

📖 **[Read the full Multi-Agent Guide](MULTI_AGENT_GUIDE.md)**

## Web UI

Visit `http://localhost:3000` for the interactive web interface with **beautifully formatted responses**!

### ✨ UI Features

- **Full Markdown Support**: All responses formatted in markdown automatically
- **Multi-Agent Responses**: Rich, structured reports with multiple perspectives
- **Auto-Formatting**: JavaScript parser converts markdown to beautiful HTML

### Examples

#### 🧠 Multi-Agent AI Queries

```bash
# Basic query - automatically activates relevant agents
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest AI breakthroughs?",
    "userId": "user123",
    "useMultiAgent": true
  }'

# Complex analysis - activates all agents for deep insights
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Compare how different outlets cover climate change",
    "userId": "user123"
  }'

# Debug mode - see individual agent outputs
curl -X POST http://localhost:3000/ask/debug \
  -H "Content-Type: application/json" \
  -d '{"query": "Latest space exploration news", "userId": "user123"}'
```

#### 📰 Direct API Access

```bash
# NewsAPI
curl "http://localhost:3000/news/top-headlines?country=us&q=AI"

# Guardian
curl "http://localhost:3000/guardian/search?q=technology"

# ArXiv
curl "http://localhost:3000/arxiv/search?search_query=machine+learning&max_results=5"
```

# Personalization: Index an article

curl -X POST http://localhost:3000/personalize/index \
 -H "Content-Type: application/json" \
 -d '{
"articleId": "article-001",
"title": "AI Breakthrough in Natural Language Processing",
"content": "Researchers have developed a new transformer model...",
"metadata": {"source": "TechNews", "category": "AI"}
}'

# Personalization: Track user interaction

curl -X POST http://localhost:3000/personalize/track \
 -H "Content-Type: application/json" \
 -d '{
"userId": "user123",
"query": "machine learning",
"interactionType": "query"
}'

# Personalization: Get recommendations

curl http://localhost:3000/personalize/recommendations/user123?limit=5

# Personalization: Semantic search

curl -X POST http://localhost:3000/personalize/search \
 -H "Content-Type: application/json" \
 -d '{
"query": "artificial intelligence advancements",
"userId": "user123",
"limit": 10
}'

# Personalization: Get user profile

curl http://localhost:3000/personalize/profile/user123

# Notifications: Send an email digest

curl -X POST http://localhost:3000/notifications/digest \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@example.com",
    "email": "user@example.com"
  }'

```

## 🎯 Personalization Features

The personalization system uses **vector embeddings** and **ChromaDB** to provide intelligent, user-specific content recommendations:

### How It Works
1. **User Tracking**: Track user queries, clicks, and interactions
2. **Semantic Understanding**: Generate embeddings for content and queries using OpenAI
3. **Profile Building**: Build user interest profiles based on behavior
4. **Smart Recommendations**: Find similar content using vector similarity search
5. **Continuous Learning**: User profiles improve over time with more interactions

### Use Cases
- **Personalized News Feeds**: Show users news they're most likely to be interested in
- **Content Discovery**: Help users find relevant articles based on semantic similarity
- **User Analytics**: Understand user interests and behavior patterns
- **Search Enhancement**: Improve search results based on user history

### Data Flow
```

User Query → Generate Embedding → Track Interaction → Update Profile
↓
Find Similar Content
↓
Personalized Results

```

```
