import axios from 'axios';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

class TwitterAPIService {
  constructor(bearerToken) {
    this.bearerToken = bearerToken;
    this.client = axios.create({
      baseURL: TWITTER_API_BASE,
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get user's own profile
  async getAuthenticatedUser() {
    try {
      const response = await this.client.get('/users/me', {
        params: {
          'user.fields': 'public_metrics,created_at,description'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  // Get user's tweets with metrics
  async getUserTweets(userId, maxResults = 100) {
    try {
      const response = await this.client.get(`/users/${userId}/tweets`, {
        params: {
          'max_results': maxResults,
          'tweet.fields': 'created_at,public_metrics,entities',
          'expansions': 'attachments.media_keys',
          'media.fields': 'type,public_metrics'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching tweets:', error);
      throw error;
    }
  }

  // Search recent tweets for trending topics
  async searchTrends(query, maxResults = 100) {
    try {
      const response = await this.client.get('/tweets/search/recent', {
        params: {
          'query': query,
          'max_results': maxResults,
          'tweet.fields': 'public_metrics,created_at,entities'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching trends:', error);
      throw error;
    }
  }

  // Get user mentions
  async getUserMentions(userId, maxResults = 100) {
    try {
      const response = await this.client.get(`/users/${userId}/mentions`, {
        params: {
          'max_results': maxResults,
          'tweet.fields': 'created_at,public_metrics'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching mentions:', error);
      throw error;
    }
  }
}

export default TwitterAPIService;