/**
 * Demo script showing how to use the personalization system
 * 
 * Run with: npx ts-node examples/personalization_demo.ts
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const USER_ID = 'demo-user-123';

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
}

// Sample articles to index
const sampleArticles: Article[] = [
  {
    id: 'article-1',
    title: 'Breakthrough in Quantum Computing',
    content: 'Scientists at MIT have achieved a major breakthrough in quantum computing, demonstrating quantum supremacy with a new 100-qubit processor. This advancement could revolutionize cryptography and drug discovery.',
    category: 'Technology'
  },
  {
    id: 'article-2',
    title: 'Machine Learning Transforms Healthcare',
    content: 'A new machine learning algorithm can predict heart disease with 95% accuracy by analyzing patient data. The AI system was trained on millions of medical records and can identify risk factors doctors might miss.',
    category: 'AI & Healthcare'
  },
  {
    id: 'article-3',
    title: 'Climate Change: Latest IPCC Report',
    content: 'The latest IPCC report warns of accelerating climate change impacts. Global temperatures continue to rise, with 2024 on track to be the warmest year on record. Urgent action needed to limit warming to 1.5°C.',
    category: 'Environment'
  },
  {
    id: 'article-4',
    title: 'Neural Networks Advance Natural Language Processing',
    content: 'Researchers have developed a new transformer architecture that significantly improves language understanding. The model achieves state-of-the-art results on multiple NLP benchmarks and requires less training data.',
    category: 'AI & NLP'
  },
  {
    id: 'article-5',
    title: 'Space Exploration: Mars Mission Update',
    content: 'NASA\'s Perseverance rover discovers evidence of ancient microbial life on Mars. The findings include organic molecules and geological formations suggesting a habitable environment billions of years ago.',
    category: 'Space'
  }
];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function indexArticles(): Promise<void> {
  console.log('\n📚 Indexing sample articles...\n');
  
  for (const article of sampleArticles) {
    try {
      await axios.post(`${BASE_URL}/personalize/index`, {
        articleId: article.id,
        title: article.title,
        content: article.content,
        metadata: { category: article.category }
      });
      console.log(`✅ Indexed: ${article.title}`);
      await sleep(500); // Rate limiting
    } catch (error: any) {
      console.error(`❌ Failed to index ${article.id}:`, error.response?.data || error.message);
    }
  }
}

async function simulateUserInteractions(): Promise<void> {
  console.log('\n👤 Simulating user interactions...\n');
  
  const interactions = [
    { query: 'artificial intelligence and machine learning', type: 'query' },
    { query: 'neural networks deep learning', type: 'query' },
    { query: 'AI applications in healthcare', type: 'query' },
  ];
  
  for (const interaction of interactions) {
    try {
      await axios.post(`${BASE_URL}/personalize/track`, {
        userId: USER_ID,
        query: interaction.query,
        interactionType: interaction.type
      });
      console.log(`✅ Tracked ${interaction.type}: "${interaction.query}"`);
      await sleep(500);
    } catch (error: any) {
      console.error('❌ Failed to track interaction:', error.response?.data || error.message);
    }
  }
}

async function getRecommendations(): Promise<void> {
  console.log('\n🎯 Getting personalized recommendations...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/personalize/recommendations/${USER_ID}?limit=5`
    );
    
    console.log(`Found ${response.data.count} recommendations:\n`);
    response.data.recommendations.forEach((rec: any, idx: number) => {
      console.log(`${idx + 1}. ${rec.title}`);
      console.log(`   Score: ${rec.score.toFixed(4)}`);
      console.log(`   Category: ${rec.metadata?.category || 'N/A'}`);
      console.log('');
    });
  } catch (error: any) {
    console.error('❌ Failed to get recommendations:', error.response?.data || error.message);
  }
}

async function semanticSearch(query: string): Promise<void> {
  console.log(`\n🔍 Semantic search for: "${query}"\n`);
  
  try {
    const response = await axios.post(`${BASE_URL}/personalize/search`, {
      query,
      userId: USER_ID,
      limit: 3
    });
    
    console.log(`Found ${response.data.count} results:\n`);
    response.data.results.forEach((result: any, idx: number) => {
      console.log(`${idx + 1}. ${result.title}`);
      console.log(`   Relevance: ${result.score.toFixed(4)}`);
      console.log(`   ${result.content.substring(0, 100)}...`);
      console.log('');
    });
  } catch (error: any) {
    console.error('❌ Search failed:', error.response?.data || error.message);
  }
}

async function getUserProfile(): Promise<void> {
  console.log('\n👤 User Profile:\n');
  
  try {
    const response = await axios.get(`${BASE_URL}/personalize/profile/${USER_ID}`);
    const profile = response.data;
    
    console.log(`User ID: ${profile.userId}`);
    console.log(`Interactions: ${profile.interactionCount}`);
    console.log(`Created: ${new Date(profile.createdAt).toLocaleString()}`);
    console.log(`Last Active: ${new Date(profile.lastActive).toLocaleString()}`);
    console.log(`Interests: ${profile.interests.join(', ')}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('No profile found yet. Interact more to build a profile!');
    } else {
      console.error('❌ Failed to get profile:', error.response?.data || error.message);
    }
  }
}

async function runDemo(): Promise<void> {
  console.log('🎯 Personalization System Demo');
  console.log('================================');
  console.log(`Using User ID: ${USER_ID}`);
  
  try {
    // Check if server is running
    await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Server is not running. Please start it with: npm run dev');
    process.exit(1);
  }
  
  // Run demo steps
  await indexArticles();
  await simulateUserInteractions();
  await getUserProfile();
  await getRecommendations();
  await semanticSearch('quantum computing and AI');
  
  console.log('\n✨ Demo completed!\n');
}

// Run the demo
runDemo().catch(console.error);

