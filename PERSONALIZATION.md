# 🎯 Personalization System Documentation

## Overview

The personalization system provides intelligent, user-specific content recommendations using **vector embeddings** and **semantic search**. It learns from user behavior and provides increasingly relevant content over time.

## Architecture

### Components

1. **EmbeddingService** (`src/services/embeddingService.ts`)
   - Generates vector embeddings using OpenAI's `text-embedding-3-small` model
   - Supports batch embedding generation
   - Provides cosine similarity calculations

2. **PersonalizationService** (`src/services/personalizationService.ts`)
   - Manages user profiles and interaction tracking
   - Stores embeddings in ChromaDB vector database
   - Provides recommendations and semantic search

3. **ChromaDB Vector Database**
   - Two collections:
     - `user_interactions`: Stores user queries and interactions
     - `articles`: Stores indexed articles for recommendations

### Data Flow

```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Generate Embedding  │ (OpenAI API)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Store in ChromaDB   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Update User Profile │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Find Similar Items  │ (Vector Similarity)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Return Results      │
└─────────────────────┘
```

## API Endpoints

### 1. Index Content

Index articles or content for future recommendations.

**Endpoint**: `POST /personalize/index`

**Request Body**:
```json
{
  "articleId": "unique-id",
  "title": "Article Title",
  "content": "Full article content...",
  "metadata": {
    "source": "NewsAPI",
    "category": "Technology",
    "publishedAt": "2024-01-01"
  }
}
```

**Response**:
```json
{
  "success": true,
  "articleId": "unique-id",
  "message": "Article indexed successfully"
}
```

### 2. Track User Interactions

Track user behavior to build personalized profiles.

**Endpoint**: `POST /personalize/track`

**Request Body**:
```json
{
  "userId": "user-123",
  "query": "machine learning",
  "articleId": "optional-article-id",
  "articleTitle": "optional-title",
  "articleContent": "optional-content",
  "interactionType": "query|click|view|like"
}
```

**Interaction Types**:
- `query`: User searched for something
- `click`: User clicked on an article
- `view`: User viewed an article
- `like`: User liked/favorited an article

### 3. Get Personalized Recommendations

Get recommendations based on user's interaction history.

**Endpoint**: `GET /personalize/recommendations/:userId?limit=10`

**Response**:
```json
{
  "userId": "user-123",
  "count": 5,
  "recommendations": [
    {
      "id": "article-1",
      "title": "Article Title",
      "content": "Article content...",
      "score": 0.8542,
      "metadata": {
        "source": "NewsAPI",
        "category": "Technology"
      }
    }
  ]
}
```

### 4. Semantic Search

Find similar content using semantic search.

**Endpoint**: `POST /personalize/search`

**Request Body**:
```json
{
  "query": "artificial intelligence developments",
  "userId": "user-123",  // optional, tracks the query
  "limit": 10
}
```

**Response**:
```json
{
  "query": "artificial intelligence developments",
  "count": 10,
  "results": [
    {
      "id": "article-1",
      "title": "AI Breakthrough",
      "content": "...",
      "score": 0.9123,
      "metadata": {...}
    }
  ]
}
```

### 5. Get User Profile

Retrieve a user's profile and interests.

**Endpoint**: `GET /personalize/profile/:userId`

**Response**:
```json
{
  "userId": "user-123",
  "interests": ["machine", "learning", "artificial", "intelligence"],
  "interactionCount": 15,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "lastActive": "2024-01-15T12:30:00.000Z"
}
```

### 6. Get All User Profiles

Admin endpoint to retrieve all user profiles.

**Endpoint**: `GET /personalize/profiles`

**Response**:
```json
{
  "count": 100,
  "profiles": [
    {
      "userId": "user-123",
      "interests": [...],
      "interactionCount": 15,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastActive": "2024-01-15T12:30:00.000Z"
    }
  ]
}
```

## Implementation Guide

### Step 1: Setup

Ensure you have the OpenAI API key set in your `.env` file:

```bash
OPENAI_API_KEY=sk-...
```

### Step 2: Index Your Content

Before recommendations work, you need to index content:

```typescript
import axios from 'axios';

// Index articles from your news API
const articles = await fetchNewsArticles();

for (const article of articles) {
  await axios.post('http://localhost:3000/personalize/index', {
    articleId: article.id,
    title: article.title,
    content: article.description || article.content,
    metadata: {
      source: article.source.name,
      publishedAt: article.publishedAt,
      url: article.url
    }
  });
}
```

### Step 3: Track User Interactions

Track what users are interested in:

```typescript
// When user searches
await axios.post('http://localhost:3000/personalize/track', {
  userId: currentUser.id,
  query: searchQuery,
  interactionType: 'query'
});

// When user clicks an article
await axios.post('http://localhost:3000/personalize/track', {
  userId: currentUser.id,
  articleId: article.id,
  articleTitle: article.title,
  articleContent: article.content,
  interactionType: 'click'
});
```

### Step 4: Get Recommendations

Retrieve personalized content:

```typescript
const response = await axios.get(
  `http://localhost:3000/personalize/recommendations/${userId}?limit=10`
);

const recommendations = response.data.recommendations;
// Display recommendations to user
```

## Integration with Existing Endpoints

The `/ask` endpoint now supports user tracking:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest AI breakthroughs?",
    "userId": "user-123"
  }'
```

When a `userId` is provided, the query is automatically tracked for personalization.

## Use Cases

### 1. Personalized News Feed

```typescript
// Get user's personalized news
const news = await getRecommendations(userId);

// Mix with general news
const generalNews = await getTopHeadlines();
const feed = [...news.slice(0, 5), ...generalNews.slice(0, 5)];
```

### 2. Smart Search

```typescript
// Semantic search with tracking
const results = await axios.post('/personalize/search', {
  query: userQuery,
  userId: currentUser.id,
  limit: 20
});

// Results are semantically similar, not just keyword matches
```

### 3. User Analytics

```typescript
// Get user interests
const profile = await axios.get(`/personalize/profile/${userId}`);

console.log(`User interests: ${profile.interests.join(', ')}`);
console.log(`Total interactions: ${profile.interactionCount}`);
```

### 4. Content Discovery

```typescript
// Find related articles
const relatedArticles = await axios.post('/personalize/search', {
  query: currentArticle.title + ' ' + currentArticle.content,
  limit: 5
});
```

## Performance Considerations

### Embedding Generation

- **Cost**: ~$0.02 per 1M tokens with `text-embedding-3-small`
- **Speed**: ~100-200ms per request
- **Optimization**: Batch embed multiple texts together

### Vector Search

- **ChromaDB**: Efficient for up to 1M documents
- **Query Speed**: ~10-50ms for similarity search
- **Scaling**: Consider hosted solutions (Pinecone, Weaviate) for >1M documents

### Caching

Consider caching recommendations:

```typescript
// Cache recommendations for 5 minutes
const cacheKey = `recommendations:${userId}`;
let recommendations = cache.get(cacheKey);

if (!recommendations) {
  recommendations = await getRecommendations(userId);
  cache.set(cacheKey, recommendations, 300); // 5 min TTL
}
```

## Testing

Run the demo script to test the personalization system:

```bash
# Start the server
npm run dev

# In another terminal, run the demo
npx ts-node examples/personalization_demo.ts
```

## Privacy Considerations

1. **User Consent**: Ensure users consent to tracking
2. **Data Retention**: Implement policies for how long to keep user data
3. **Anonymization**: Consider anonymizing user IDs
4. **GDPR Compliance**: Provide ways for users to:
   - View their data
   - Delete their data
   - Opt-out of tracking

## Future Enhancements

1. **Collaborative Filtering**: Recommend based on similar users
2. **Temporal Decay**: Weight recent interactions more heavily
3. **Category Preferences**: Track and weight by content categories
4. **A/B Testing**: Test different recommendation algorithms
5. **Real-time Updates**: WebSocket support for live recommendations
6. **Multi-modal Embeddings**: Support for image and video content
7. **Explainability**: Show why items were recommended

## Troubleshooting

### "Personalization service not available"

**Issue**: OPENAI_API_KEY not set

**Solution**: Add your OpenAI API key to `.env`:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### No recommendations returned

**Issue**: No articles indexed or no user interactions

**Solution**:
1. Index some articles first using `/personalize/index`
2. Track some user interactions using `/personalize/track`

### Slow recommendations

**Issue**: Large database or cold start

**Solutions**:
- Implement caching
- Limit query size
- Use batch operations
- Consider upgrading to hosted vector DB

## Resources

- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Vector Database Comparison](https://benchmark.vectorview.ai/)
- [Semantic Search Best Practices](https://www.pinecone.io/learn/semantic-search/)

