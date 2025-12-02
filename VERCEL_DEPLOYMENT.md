# Vercel Deployment Guide

This document explains the changes made to enable Vercel serverless deployment and important considerations.

## Changes Made

### 1. Created `vercel.json`
- Configured Vercel to use `@vercel/node` builder for TypeScript
- Set up routing to direct all requests to `/api/index.ts`
- Increased function timeout to 60 seconds (default is 10 seconds)

### 2. Created `api/index.ts`
- Serverless function handler that imports and exports the Express app
- This is the entry point for Vercel serverless functions

### 3. Modified `src/server.ts`
- Added conditional export for serverless environments
- Disabled `app.listen()` in serverless mode (Vercel handles this)
- Disabled scheduled tasks (cron jobs) in serverless environments
  - Scheduled headline fetching
  - Daily headline cleanup
  - Daily roundup scheduler

### 4. Modified `src/services/databaseService.ts`
- Updated to use `/tmp` directory in serverless environments
- **Important**: `/tmp` is ephemeral - data will be lost between function invocations
- Consider migrating to a cloud database (PostgreSQL, MongoDB, etc.) for production

### 5. Updated `tsconfig.json`
- Added `api` directory to TypeScript compilation includes

## Important Considerations

### Database Persistence
⚠️ **CRITICAL**: The SQLite database in `/tmp` is **NOT persistent** in Vercel serverless functions. Each function invocation gets a fresh `/tmp` directory.

**Recommendations:**
- For production, migrate to a cloud database:
  - **Vercel Postgres** (recommended, integrates well)
  - **MongoDB Atlas**
  - **Supabase**
  - **PlanetScale**
- Update `DatabaseService` to use the new database connection

### Scheduled Tasks
Scheduled tasks (cron jobs) are disabled in serverless mode because:
- Serverless functions are stateless and don't persist between invocations
- `node-cron` and `setInterval` don't work in serverless environments

**Alternatives:**
- Use **Vercel Cron Jobs** (configured in `vercel.json`)
- Use external cron services (cron-job.org, EasyCron, etc.)
- Use Vercel's scheduled functions feature

### Environment Variables
Make sure to set all required environment variables in Vercel:
- `OPENAI_API_KEY` (if using AI features)
- `NEWSAPI_KEY`
- `GUARDIAN_API_KEY` (optional)
- `NYTIMES_API_KEY` (optional)
- `USE_MULTI_AGENT` (optional, set to "true" to enable)

### ChromaDB Considerations
ChromaDB may also have file system requirements. If you encounter issues:
- Consider using ChromaDB Cloud (hosted service)
- Or migrate to another vector database (Pinecone, Weaviate, etc.)

## Deployment Steps

1. **Set Environment Variables in Vercel Dashboard:**
   - Go to your project settings → Environment Variables
   - Add all required API keys

2. **Deploy:**
   ```bash
   vercel
   ```
   Or push to your connected Git repository

3. **Monitor Logs:**
   - Check Vercel dashboard → Functions → Logs
   - Look for any errors related to database or file system access

## Testing Locally

To test the serverless function locally:
```bash
vercel dev
```

This will simulate the Vercel serverless environment locally.

## Troubleshooting

### Function Timeout
If you see timeout errors, increase the `maxDuration` in `vercel.json`:
```json
"functions": {
  "api/index.ts": {
    "maxDuration": 120  // Increase to 120 seconds (max for Pro plan)
  }
}
```

### Database Errors
If you see database-related errors:
- Check that `/tmp` directory is writable (should be automatic)
- Consider migrating to a cloud database
- Check function logs in Vercel dashboard

### Import Errors
If you see module import errors:
- Ensure all dependencies are in `package.json`
- Run `npm install` before deploying
- Check that TypeScript compilation succeeds: `npm run build`

## Next Steps

1. **Migrate Database**: Set up a cloud database and update `DatabaseService`
2. **Set Up Cron Jobs**: Configure Vercel Cron Jobs for scheduled tasks
3. **Monitor Performance**: Use Vercel Analytics to monitor function performance
4. **Optimize Cold Starts**: Consider using edge functions for simpler endpoints

