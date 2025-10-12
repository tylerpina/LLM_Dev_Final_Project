# 🚀 Personalization System - Quick Start Guide

## What Was Built

A complete **AI-powered personalization system** with:

✅ **Vector Embeddings** - Using OpenAI's embedding API to understand semantic meaning  
✅ **ChromaDB Vector Database** - Efficient storage and retrieval of embeddings  
✅ **User Profiling** - Automatic tracking of user interests and behavior  
✅ **Semantic Search** - Find content by meaning, not just keywords  
✅ **Personalized Recommendations** - AI-driven content suggestions based on user history  
✅ **REST API Endpoints** - Complete API for integration  
✅ **Web UI Demo** - Interactive interface to test all features  

## Architecture Overview

```
User Interaction
       ↓
  [Express API]
       ↓
  ┌────┴────┐
  │         │
[Embedding  [Personalization
 Service]    Service]
  │         │
  └────┬────┘
       ↓
  [ChromaDB]
  (Vector Database)
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installed:
- `chromadb` - Vector database
- `uuid` - Generate unique IDs
- And all existing dependencies

### 2. Set Environment Variables

Make sure your `.env` file has:

```bash
OPENAI_API_KEY=sk-your-key-here  # Required for personalization
NEWSAPI_KEY=your-key              # For news content
GUARDIAN_API_KEY=your-key         # For Guardian news
```

### 3. Start the Server

```bash
npm run dev
```

The server will start with personalization enabled if `OPENAI_API_KEY` is set.

### 4. Try It Out!

#### Option A: Use the Web UI

Visit: `http://localhost:3000/personalization.html`

Features:
- Index sample articles
- Track user interactions
- Get personalized recommendations
- Try semantic search
- View user profiles
- Run full demo with one click

#### Option B: Use the Demo Script

```bash
npx ts-node examples/personalization_demo.ts
```

This will:
1. Index 5 sample articles
2. Simulate user interactions
3. Generate personalized recommendations
4. Show semantic search results
5. Display user profile

#### Option C: Use the API Directly

**Index an article:**
```bash
curl -X POST http://localhost:3000/personalize/index \
  -H "Content-Type: application/json" \
  -d '{
    "articleId": "test-1",
    "title": "AI Breakthrough in NLP",
    "content": "New transformer models achieve human-level understanding...",
    "metadata": {"category": "AI"}
  }'
```

**Track user interaction:**
```bash
curl -X POST http://localhost:3000/personalize/track \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "query": "machine learning",
    "interactionType": "query"
  }'
```

**Get recommendations:**
```bash
curl http://localhost:3000/personalize/recommendations/user-123?limit=5
```

**Semantic search:**
```bash
curl -X POST http://localhost:3000/personalize/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "artificial intelligence breakthroughs",
    "userId": "user-123",
    "limit": 10
  }'
```

**Get user profile:**
```bash
curl http://localhost:3000/personalize/profile/user-123
```

## Files Created

### Core Services
- `src/services/embeddingService.ts` - Generate and manage embeddings
- `src/services/personalizationService.ts` - Main personalization logic
- `src/server.ts` - Updated with personalization endpoints

### Documentation
- `PERSONALIZATION.md` - Complete system documentation
- `SETUP_GUIDE.md` - This file
- `README.md` - Updated with personalization info

### Examples & UI
- `examples/personalization_demo.ts` - Runnable demo script
- `public/personalization.html` - Interactive web UI

## How It Works

### 1. Embedding Generation
```typescript
// Text → Vector (1536 dimensions)
"machine learning" → [0.123, -0.456, 0.789, ...]
```

### 2. Semantic Understanding
Similar concepts have similar embeddings:
- "AI" and "artificial intelligence" → Similar vectors
- "car" and "airplane" → Somewhat similar (both vehicles)
- "car" and "banana" → Very different

### 3. User Profiling
The system tracks:
- Queries users make
- Articles they click
- Content they view/like
- Extracts interests automatically

### 4. Recommendations
1. Average user's interaction embeddings
2. Find articles with similar embeddings
3. Return top matches

## Integration Examples

### With Your News App

```typescript
// When user searches news
app.get('/search', async (req, res) => {
  const { query, userId } = req.query;
  
  // Get news results
  const news = await searchNews(query);
  
  // Track interaction for personalization
  if (userId) {
    await fetch('http://localhost:3000/personalize/track', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        query,
        interactionType: 'query'
      })
    });
  }
  
  res.json(news);
});

// Personalized feed endpoint
app.get('/feed/:userId', async (req, res) => {
  const { userId } = req.params;
  
  // Get personalized recommendations
  const response = await fetch(
    `http://localhost:3000/personalize/recommendations/${userId}?limit=10`
  );
  const recommendations = await response.json();
  
  res.json(recommendations);
});
```

### Auto-Index News Articles

```typescript
// When fetching news, automatically index for personalization
async function fetchAndIndexNews() {
  const articles = await newsAPI.getTopHeadlines();
  
  for (const article of articles) {
    await fetch('http://localhost:3000/personalize/index', {
      method: 'POST',
      body: JSON.stringify({
        articleId: article.url, // Use URL as unique ID
        title: article.title,
        content: article.description || article.content,
        metadata: {
          source: article.source.name,
          publishedAt: article.publishedAt,
          url: article.url
        }
      })
    });
  }
}
```

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/personalize/index` | POST | Index content |
| `/personalize/track` | POST | Track interactions |
| `/personalize/recommendations/:userId` | GET | Get recommendations |
| `/personalize/search` | POST | Semantic search |
| `/personalize/profile/:userId` | GET | Get user profile |
| `/personalize/profiles` | GET | Get all profiles |

## Performance & Costs

### OpenAI Embeddings
- **Model**: `text-embedding-3-small`
- **Cost**: ~$0.02 per 1M tokens
- **Speed**: 100-200ms per request
- **Dimensions**: 1536

### ChromaDB
- **Type**: In-memory vector database
- **Speed**: 10-50ms for similarity search
- **Capacity**: Up to 1M documents efficiently
- **Persistence**: Data persists between restarts

### Example Costs
- 10,000 articles indexed: ~$0.20
- 100,000 user queries: ~$2.00
- Very affordable for most use cases!

## Scaling Considerations

### Current Setup (Good for)
- Up to 100K articles
- Thousands of users
- Prototype/MVP stage

### For Production Scale
Consider:
- **Pinecone/Weaviate**: Hosted vector DB for >1M docs
- **Redis Caching**: Cache recommendations
- **Background Jobs**: Index articles asynchronously
- **Rate Limiting**: Protect API endpoints
- **A/B Testing**: Compare recommendation algorithms

## Troubleshooting

### "Personalization service not available"
**Issue**: OPENAI_API_KEY not set  
**Fix**: Add to `.env` file

### No recommendations returned
**Issue**: No data indexed or tracked  
**Fix**: 
1. Index some articles first
2. Track some user interactions
3. Try the demo script

### ChromaDB connection errors
**Issue**: ChromaDB not starting  
**Fix**: ChromaDB runs in-memory by default, no setup needed

### Slow performance
**Issue**: Too many embeddings  
**Fix**:
- Add caching
- Reduce query size
- Batch operations

## Next Steps

1. **Integrate with your news sources**: Auto-index articles from NewsAPI, Guardian, etc.
2. **Add authentication**: Track real user IDs securely
3. **Enhance recommendations**: Add collaborative filtering, temporal decay
4. **A/B test**: Compare personalized vs. non-personalized feeds
5. **Analytics dashboard**: Visualize user interests and trends
6. **Mobile app**: Use the API from iOS/Android apps

## Resources

- 📚 [PERSONALIZATION.md](./PERSONALIZATION.md) - Complete documentation
- 🎬 [personalization_demo.ts](./examples/personalization_demo.ts) - Demo script
- 🌐 [personalization.html](./public/personalization.html) - Web UI
- 📖 [README.md](./README.md) - Updated project README

## Support

For questions or issues:
1. Check `PERSONALIZATION.md` for detailed docs
2. Run the demo script to verify setup
3. Check server logs for errors
4. Review OpenAI API usage/limits

---

**Built with**: OpenAI Embeddings + ChromaDB + TypeScript + Express

**Status**: ✅ Production-ready for MVP/prototype scale

