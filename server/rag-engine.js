import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Simple in-memory vector store for demo
// (In production, use Pinecone, Weaviate, or Chroma)
class SimpleVectorStore {
  constructor() {
    this.documents = [];
  }
  
  async addDocuments(docs) {
    this.documents.push(...docs);
  }
  
  async search(query, limit = 5) {
    // Simple keyword matching (replace with proper vector search in production)
    return this.documents
      .filter(doc => {
        const content = doc.content.toLowerCase();
        const q = query.toLowerCase();
        return content.includes(q) || q.split(' ').some(word => content.includes(word));
      })
      .slice(0, limit);
  }
}

export class RAGEngine {
  constructor() {
    this.vectorStore = new SimpleVectorStore();
  }
  
  // Index user's tweet data
  async indexUserData(userData) {
    const { user, tweets, analytics } = userData;
    
    const documents = [];
    
    // Index user profile
    documents.push({
      type: 'profile',
      content: `User: ${user.username}, Followers: ${user.public_metrics.followers_count}, Following: ${user.public_metrics.following_count}`,
      metadata: { source: 'profile' }
    });
    
    // Index top performing tweets
    const topTweets = tweets
      .sort((a, b) => {
        const aEng = (a.public_metrics.like_count + a.public_metrics.retweet_count);
        const bEng = (b.public_metrics.like_count + b.public_metrics.retweet_count);
        return bEng - aEng;
      })
      .slice(0, 20);
    
    topTweets.forEach(tweet => {
      documents.push({
        type: 'tweet',
        content: `Tweet: "${tweet.text}" - Likes: ${tweet.public_metrics.like_count}, Retweets: ${tweet.public_metrics.retweet_count}`,
        metadata: { 
          engagement: tweet.public_metrics.like_count + tweet.public_metrics.retweet_count,
          source: 'top_tweets'
        }
      });
    });
    
    // Index analytics insights
    if (analytics) {
      documents.push({
        type: 'analytics',
        content: `Best posting time: ${analytics.bestTimes[0]?.day} at ${analytics.bestTimes[0]?.time}. Top hashtags: ${analytics.topHashtags?.map(h => h.tag).join(', ')}`,
        metadata: { source: 'analytics' }
      });
    }
    
    await this.vectorStore.addDocuments(documents);
    console.log(`✅ Indexed ${documents.length} documents for RAG`);
  }
  
  // Generate personalized advice using RAG
  async getPersonalizedAdvice(question, userContext) {
    try {
      // Retrieve relevant documents
      const relevantDocs = await this.vectorStore.search(question);
      
      // Build context from retrieved documents
      const context = relevantDocs
        .map(doc => doc.content)
        .join('\n\n');
      
      // Generate response with Claude
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a Twitter engagement expert. Based on this user's data, provide personalized advice.

USER'S DATA:
${context}

USER'S QUESTION: ${question}

Provide specific, actionable advice based on their actual performance data. Be encouraging but realistic.`
        }]
      });
      
      return {
        advice: message.content[0].text,
        sources: relevantDocs.map(d => d.metadata.source)
      };
      
    } catch (err) {
      console.error('❌ RAG error:', err);
      throw err;
    }
  }
}