# LLM_Dev_Final_Project

An entirely vibe coded typscript project.

The primary idea of the project is to connect to news API sources, and for each API, generate an MCP. Then use a cloud hosted MCP / UI 

Goal 1: Connect to news API's
 (for now use https://newsapi.org)
Goal 2: For each news API, create an MCP
Goal 3: Hook all MCP's to a server.
Goal 4: caching (etc etc), for now focus on just getting api's set up.

## Getting Started

1. Copy `.env.example` to `.env` and set your API keys:
   - `NEWSAPI_KEY` - Get from https://newsapi.org
   - `GUARDIAN_API_KEY` - Get from https://open-platform.theguardian.com
   - `OPENAI_API_KEY` - Get from https://platform.openai.com/api-keys
2. Install deps: `npm install`
3. Start dev server: `npm run dev`
4. Build: `npm run build`, Run prod: `npm start`

## Endpoints

### Core Endpoints
- GET `/health` — service status + available providers
- GET `/news/top-headlines` — NewsAPI top headlines (legacy)
- GET `/mcp/:provider/*` — Universal MCP endpoint
- GET `/guardian/search` — Guardian News search
- GET `/guardian/sections` — Guardian News sections
- GET `/arxiv/search` — ArXiv academic papers search
- GET `/arxiv/paper` — Get specific ArXiv paper
- GET `/arxiv/category` — Search by ArXiv category
- **POST `/ask`** — 🤖 AI-powered conversational queries

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

## Web UI
Visit `http://localhost:3000` for the interactive web interface with **beautifully formatted responses**!

### ✨ UI Features
- **Full Markdown Support**: All responses formatted in markdown automatically
  - Headings with `##` and `###`
  - **Bold**, *italic*, and `code` formatting
  - Bullet points and numbered lists
  - Professional structure and styling
- **Auto-Formatting**: JavaScript parser converts markdown to beautiful HTML
- **5 Response Styles**: All use consistent markdown formatting

### Examples
```bash
# NewsAPI (existing)
curl "http://localhost:3000/news/top-headlines?country=us&q=AI"

# Universal MCP format
curl "http://localhost:3000/mcp/newsapi/news/top-headlines?country=us&q=AI"

# Guardian (requires GUARDIAN_API_KEY)
curl "http://localhost:3000/guardian/search?q=technology"
curl "http://localhost:3000/guardian/sections"

# ArXiv academic papers
curl "http://localhost:3000/arxiv/search?search_query=machine+learning&max_results=5"

# AI-powered queries (requires OPENAI_API_KEY)
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the latest AI breakthroughs?", "userId": "user123"}'

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
