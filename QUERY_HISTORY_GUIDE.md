# Query History & Saved Searches - Usage Guide (DOCUMENTATION CREATED BY CURSOR)

## Overview

The Query History and Saved Searches feature provides a comprehensive way to track, manage, and reuse your AI queries. This foundational feature enhances productivity by allowing you to:

- **Track all queries** automatically as you use the app
- **View query history** with metadata (execution time, agents used, sources)
- **Save favorite queries** for quick access
- **Re-run queries** with a single click
- **Search through history** to find past queries

## Features

### 1. Query History

All queries are automatically saved to history when you submit them. The history includes:
- Query text
- Timestamp
- Execution time
- Number of agents used
- Number of sources found
- Response style used

### 2. Saved Searches

Save frequently used queries with custom names for quick access:
- Create named searches
- Track usage count
- Quick re-run capability
- Edit and delete saved searches

## How to Use

### Accessing Query History

1. **Open the History Sidebar**: The history panel is located on the left side of the main interface
2. **View Recent Queries**: Click the "Recent" tab to see your query history
3. **Search History**: Use the search functionality (coming soon) to find specific queries

### Viewing Query History

- **Recent Tab**: Shows all your queries in chronological order (newest first)
- Each history item displays:
  - Query text (truncated if long)
  - Time ago (e.g., "2h ago", "just now")
  - Execution time
  - Number of agents used
  - Number of sources found

### Re-running a Query

1. Click on any query in the history
2. The query will automatically populate the input field
3. The query will be submitted automatically

### Saving a Query as a Search

1. Click the ⭐ (star) icon on any history item
2. Enter a name for the saved search
3. Click "Save"
4. The saved search will appear in the "Saved" tab

### Managing Saved Searches

**View Saved Searches:**
- Click the "Saved" tab in the history sidebar
- All your saved searches will be displayed

**Use a Saved Search:**
- Click on any saved search item
- The query will be automatically executed

**Edit a Saved Search:**
- Click the ✏️ (edit) icon on a saved search
- Enter a new name
- The search will be updated

**Delete a Saved Search:**
- Click the 🗑️ (delete) icon on a saved search
- Confirm the deletion

**Delete Query History:**
- Click the 🗑️ icon in the history header
- Confirm to clear all history (cannot be undone)

## Testing Steps

### Test 1: Basic Query History

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open the app** in your browser (usually `http://localhost:3000`)

3. **Submit a query**:
   - Enter: "What are the latest AI trends?"
   - Click "Ask AI"
   - Wait for the response

4. **Check history**:
   - Look at the left sidebar (History panel)
   - You should see your query in the "Recent" tab
   - Verify it shows:
     - Your query text
     - Time ago (should say "just now")
     - Execution time
     - Number of agents/sources

### Test 2: Re-run a Query

1. **Click on a query** in the history
2. **Verify**:
   - The query appears in the input field
   - The query is automatically submitted
   - A new response is generated
   - A new entry appears in history

### Test 3: Save a Query

1. **Click the ⭐ icon** on any history item
2. **Enter a name** (e.g., "AI Trends Query")
3. **Click "Save"**
4. **Switch to "Saved" tab**
5. **Verify**:
   - Your saved search appears
   - It shows the name you entered
   - It shows the query text
   - It shows creation date

### Test 4: Use a Saved Search

1. **Go to "Saved" tab**
2. **Click on a saved search**
3. **Verify**:
   - The query is executed
   - The use count increments
   - A new history entry is created

### Test 5: Edit a Saved Search

1. **Go to "Saved" tab**
2. **Click ✏️ on a saved search**
3. **Enter a new name**
4. **Verify**:
   - The name updates in the list
   - The query remains the same

### Test 6: Delete Operations

1. **Delete a single query**:
   - Click 🗑️ on a history item
   - Confirm deletion
   - Verify it's removed from history

2. **Delete a saved search**:
   - Go to "Saved" tab
   - Click 🗑️ on a saved search
   - Confirm deletion
   - Verify it's removed

3. **Clear all history**:
   - Click 🗑️ in the history header
   - Confirm
   - Verify all history is cleared

### Test 7: Multiple Queries

1. **Submit 5-10 different queries**
2. **Verify**:
   - All appear in history
   - They're ordered newest first
   - Each has correct metadata
   - You can scroll through them

### Test 8: Tab Switching

1. **Switch between "Recent" and "Saved" tabs**
2. **Verify**:
   - Content updates correctly
   - Active tab is highlighted
   - Empty states show when appropriate

## API Endpoints

### Query History

- `GET /queries/history?userId={userId}&limit={limit}` - Get query history
- `GET /queries/history/stats?userId={userId}` - Get history statistics
- `DELETE /queries/history/:id?userId={userId}` - Delete a specific query
- `DELETE /queries/history?userId={userId}` - Clear all history

### Saved Searches

- `GET /queries/saved?userId={userId}` - Get all saved searches
- `GET /queries/saved/:id?userId={userId}` - Get a specific saved search
- `POST /queries/saved` - Save a new search
- `PUT /queries/saved/:id?userId={userId}` - Update a saved search
- `DELETE /queries/saved/:id?userId={userId}` - Delete a saved search
- `POST /queries/saved/:id/use?userId={userId}` - Mark a search as used (increments count)

## Database Schema

### query_history Table
- `id` - Primary key
- `userId` - User identifier
- `query` - Query text
- `style` - Response style used
- `timestamp` - When query was executed
- `executionTimeMs` - Execution time in milliseconds
- `agentsExecuted` - JSON array of agents used
- `sourcesCount` - Number of sources found

### saved_searches Table
- `id` - Primary key
- `userId` - User identifier
- `name` - Custom name for the search
- `query` - Query text
- `style` - Response style
- `createdAt` - When search was created
- `lastUsed` - Last time search was used
- `useCount` - Number of times search was used

## Technical Details

### User ID Management
- Each browser session gets a unique user ID
- Stored in `localStorage` as `llm-news-user-id`
- Persists across page refreshes
- Used to filter queries per user

### Automatic History Saving
- Queries are automatically saved when submitted via `/ask` endpoint
- Works for both multi-agent and legacy systems
- Includes all relevant metadata

### Data Persistence
- All data stored in SQLite database (`data/headlines.db`)
- History is kept for 30 days by default (configurable)
- Saved searches persist indefinitely until deleted

## Troubleshooting

### History Not Appearing
- Check browser console for errors
- Verify database file exists (`data/headlines.db`)
- Check server logs for database errors
- Ensure userId is being sent in requests

### Saved Searches Not Saving
- Check network tab for API errors
- Verify modal is working correctly
- Check database permissions

### Queries Not Re-running
- Verify click handlers are attached
- Check that query input field exists
- Ensure form submission is working

## Future Enhancements

Potential improvements:
- Search/filter within history
- Export history to CSV/JSON
- Share saved searches
- History analytics dashboard
- Query templates
- Bulk operations (delete multiple, save multiple)

