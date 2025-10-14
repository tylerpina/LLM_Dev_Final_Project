#!/bin/bash

# Multi-Agent System Demo Script
# Demonstrates various queries with the multi-agent news intelligence system

BASE_URL="http://localhost:3000"
USER_ID="demo-user-$(date +%s)"

echo "🧠 Multi-Agent News Intelligence System Demo"
echo "=============================================="
echo ""
echo "User ID: $USER_ID"
echo ""

# Function to make a query and pretty print
query() {
    local title="$1"
    local query_text="$2"
    local endpoint="${3:-/ask}"
    
    echo "📋 $title"
    echo "Query: \"$query_text\""
    echo "---"
    
    response=$(curl -s -X POST "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"$query_text\",
            \"userId\": \"$USER_ID\",
            \"useMultiAgent\": true
        }")
    
    # Extract key information
    agents=$(echo "$response" | jq -r '.metadata.agentsExecuted[]?' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    exec_time=$(echo "$response" | jq -r '.metadata.executionTimeMs?' 2>/dev/null)
    cost=$(echo "$response" | jq -r '.metadata.estimatedCost?' 2>/dev/null)
    
    if [ ! -z "$agents" ]; then
        echo "✅ Agents: $agents"
        echo "⏱️  Execution: ${exec_time}ms"
        echo "💰 Cost: \$$cost"
        echo ""
        
        # Show first part of response
        echo "Response:"
        echo "$response" | jq -r '.synthesizedResponse?' 2>/dev/null | head -20
        echo ""
        echo "..."
    else
        echo "❌ Error: $response"
    fi
    
    echo ""
    echo "---"
    echo ""
    sleep 2
}

# Test 1: Simple news query
query "Test 1: Simple News Query" \
      "What are the latest developments in artificial intelligence?"

# Test 2: Comparison query (triggers bias analysis)
query "Test 2: Source Comparison" \
      "Compare how different news outlets cover climate change"

# Test 3: Trend detection
query "Test 3: Trend Analysis" \
      "What are the emerging trends in renewable energy?"

# Test 4: Complex analysis
query "Test 4: Complex Multi-Perspective Analysis" \
      "Analyze the current state of quantum computing research. What are the main challenges and breakthroughs?"

# Test 5: Debug mode (see individual agent outputs)
echo "📋 Test 5: Debug Mode (Individual Agent Outputs)"
echo "Query: \"Latest news about space exploration\""
echo "---"

debug_response=$(curl -s -X POST "$BASE_URL/ask/debug" \
    -H "Content-Type: application/json" \
    -d "{
        \"query\": \"Latest news about space exploration\",
        \"userId\": \"$USER_ID\"
    }")

echo "$debug_response" | jq '{
    coordinator: .coordinatorOutput.data.intent,
    newsArticles: .newsAgentOutput.data.totalFetched,
    sentiment: .sentimentAgentOutput.data.overallSentiment,
    mainTopics: .trendAgentOutput.data.mainTopics,
    biasCheck: .biasAgentOutput.data.recommendation
}' 2>/dev/null

echo ""
echo "---"
echo ""

# Check monitoring endpoints
echo "📊 System Monitoring"
echo "===================="
echo ""

echo "📈 Performance Summary:"
curl -s "$BASE_URL/agents/performance" | jq '.' 2>/dev/null
echo ""

echo "💰 Cost Estimates:"
curl -s "$BASE_URL/agents/costs" | jq '.' 2>/dev/null
echo ""

echo "✅ Demo complete!"
echo ""
echo "💡 Tips:"
echo "  - Set USE_MULTI_AGENT=true in .env to enable by default"
echo "  - Visit $BASE_URL/agents/stats for detailed statistics"
echo "  - Use POST /ask/debug for detailed agent outputs"
echo "  - The system learns from $USER_ID interactions!"

