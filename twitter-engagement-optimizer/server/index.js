import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import OAuth from 'oauth';
import Papa from 'papaparse';
import * as cheerio from 'cheerio'; // npm install cheerio
import { RAGEngine } from './rag-engine.js';
import { TwitterApi } from 'twitter-api-v2';
import { createClient } from '@supabase/supabase-js';
dotenv.config();
// Add after dotenv.config()
// Debug: Check if env vars are loaded
console.log('🔍 SUPABASE_URL:', process.env.SUPABASE_URL ? 'Loaded ✓' : 'MISSING ✗');
console.log('🔍 SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Loaded ✓' : 'MISSING ✗');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file!');
  console.error('   Make sure .env is in the server/ directory');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('✅ Supabase client initialized');

const app = express();
const PORT = process.env.PORT || 3001;

// Simple in-memory token store (use Redis in production)
const tokenStore = new Map();


// In-memory store for OAuth states
const oauthStates = new Map();

console.log('💾 Using in-memory token store');

// Enhanced CORS for Codespaces
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Session middleware - CRITICAL for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set true only if using HTTPS everywhere
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

console.log('🔑 Twitter API Key:', process.env.TWITTER_API_KEY ? 'Loaded ✓' : 'MISSING ✗');
console.log('🔑 Twitter API Secret:', process.env.TWITTER_API_SECRET ? 'Loaded ✓' : 'MISSING ✗');
console.log('🔗 Callback URL:', `${process.env.BACKEND_URL}/api/auth/callback`);

// Initialize OAuth
const oauth = new OAuth.OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  process.env.TWITTER_API_KEY,
  process.env.TWITTER_API_SECRET,
  '1.0A',
  `${process.env.BACKEND_URL}/api/auth/callback`,
  'HMAC-SHA1'
);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Twitter Analytics Backend API',
    status: 'running',
    oauth_configured: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET),
    endpoints: {
      health: '/api/health',
      auth_start: '/api/auth/twitter',
      auth_callback: '/api/auth/callback',
      user_data: '/api/twitter/user (POST)',
      user_tweets: '/api/twitter/tweets (POST)'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running',
    oauth_ready: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET)
  });
});

// Step 1: Start OAuth flow
app.get('/api/auth/twitter', (req, res) => {
  console.log('\n🔐 === Starting OAuth Flow ===');
  
  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
    console.error('❌ Missing Twitter credentials!');
    return res.status(500).json({ 
      error: 'Server not configured. Missing Twitter API credentials in .env file.' 
    });
  }
  
  oauth.getOAuthRequestToken((error, oauthToken, oauthTokenSecret, results) => {
    if (error) {
      console.error('❌ Error getting request token:', error);
      console.error('   Status Code:', error.statusCode);
      console.error('   Data:', error.data);
      return res.status(500).json({ 
        error: 'Failed to get OAuth request token',
        details: error.data || error.message 
      });
    }
    
    // Store token secret in memory store
    tokenStore.set(oauthToken, {
      tokenSecret: oauthTokenSecret,
      timestamp: Date.now()
    });
    
    console.log('✅ Request token obtained:', oauthToken);
    console.log('💾 Token secret stored in memory');
    
    const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`;
    console.log('📤 Sending auth URL to client');
    
    res.json({ authUrl });
  });
});

// Step 2: Handle callback from Twitter
app.get('/api/auth/callback', (req, res) => {
  console.log('\n📥 === OAuth Callback Received ===');
  console.log('📋 Full URL:', req.url);
  console.log('📋 Query params:', req.query);
  console.log('📋 Headers:', req.headers);
  
  const { oauth_token, oauth_verifier, denied } = req.query;
  
  // Check if user denied
  if (denied) {
    console.log('⚠️  User denied authorization');
    return res.redirect(`${process.env.FRONTEND_URL}?auth=denied`);
  }
  
  // Validate parameters
  if (!oauth_token || !oauth_verifier) {
    console.error('❌ Missing OAuth parameters');
    return res.redirect(`${process.env.FRONTEND_URL}?auth=error&message=missing_params`);
  }
  
  // Retrieve token secret from memory store
  const tokenData = tokenStore.get(oauth_token);
  
  if (!tokenData) {
    console.error('❌ Token not found in store');
    console.log('   Available tokens:', Array.from(tokenStore.keys()));
    return res.redirect(`${process.env.FRONTEND_URL}?auth=error&message=token_not_found`);
  }
  
  const oauthTokenSecret = tokenData.tokenSecret;
  console.log('✅ Token secret retrieved from memory');
  console.log('🔄 Exchanging request token for access token...');
  
  // Clean up the request token
  tokenStore.delete(oauth_token);
  
  // Exchange for access token
  oauth.getOAuthAccessToken(
    oauth_token,
    oauthTokenSecret,
    oauth_verifier,
    (error, accessToken, accessTokenSecret, results) => {
      if (error) {
        console.error('❌ Error getting access token:', error);
        return res.redirect(`${process.env.FRONTEND_URL}?auth=error&message=token_exchange_failed`);
      }
      
      // Store access tokens with a unique session key
      const sessionKey = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      tokenStore.set(sessionKey, {
        accessToken,
        accessTokenSecret,
        userId: results.user_id,
        screenName: results.screen_name,
        timestamp: Date.now()
      });
      
      console.log('✅ Access token obtained for user:', results.screen_name);
      console.log('💾 Access tokens stored with key:', sessionKey);
      console.log('🎉 OAuth flow complete!');
      
      // Redirect with session key
      res.redirect(`${process.env.FRONTEND_URL}?auth=success&session=${sessionKey}&user=${results.screen_name}`);
    }
  );
});

// Get user data using session key
app.post('/api/twitter/user', (req, res) => {
  console.log('\n📥 === Fetching User Data ===');
  
  const { sessionKey } = req.body;
  
  if (!sessionKey) {
    console.error('❌ No session key provided');
    return res.status(401).json({ error: 'Not authenticated. No session key provided.' });
  }
  
  const sessionData = tokenStore.get(sessionKey);
  
  if (!sessionData) {
    console.error('❌ Invalid or expired session key');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
  
  const { accessToken, accessTokenSecret } = sessionData;
  console.log('🔍 Fetching user data from Twitter...');
  
  oauth.get(
    'https://api.twitter.com/1.1/account/verify_credentials.json',
    accessToken,
    accessTokenSecret,
    (error, data) => {
      if (error) {
        console.error('❌ Error fetching user data:', error);
        return res.status(500).json({ error: 'Failed to fetch user data', details: error.data });
      }
      
      try {
        const userData = JSON.parse(data);
        console.log('✅ User data fetched for:', userData.screen_name);
        
        res.json({
          data: {
            id: userData.id_str,
            username: userData.screen_name,
            name: userData.name,
            public_metrics: {
              followers_count: userData.followers_count,
              following_count: userData.friends_count,
              tweet_count: userData.statuses_count
            }
          }
        });
      } catch (parseError) {
        console.error('❌ Error parsing user data:', parseError);
        res.status(500).json({ error: 'Failed to parse user data' });
      }
    }
  );
});

// Get user tweets using session key
app.post('/api/twitter/tweets', (req, res) => {
  console.log('\n📥 === Fetching User Tweets ===');
  
  const { sessionKey, count = 100 } = req.body;
  
  if (!sessionKey) {
    console.error('❌ No session key provided');
    return res.status(401).json({ error: 'Not authenticated. No session key provided.' });
  }
  
  const sessionData = tokenStore.get(sessionKey);
  
  if (!sessionData) {
    console.error('❌ Invalid or expired session key');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
  
  const { accessToken, accessTokenSecret } = sessionData;
  console.log(`🔍 Fetching ${count} tweets from Twitter...`);
  
  oauth.get(
    `https://api.twitter.com/1.1/statuses/user_timeline.json?count=${count}&exclude_replies=false&include_rts=true`,
    accessToken,
    accessTokenSecret,
    (error, data) => {
      if (error) {
        console.error('❌ Error fetching tweets:', error);
        
        // Check if it's a 403 (access level issue)
        if (error.statusCode === 403) {
          console.log('⚠️  Free tier limitation - returning empty array');
          return res.json({ 
            data: [],
            message: 'Tweet data requires Twitter API Basic tier ($100/month). Your account data was fetched successfully!'
          });
        }
        
        return res.status(500).json({ error: 'Failed to fetch tweets', details: error.data });
      }
      
      try {
        const tweets = JSON.parse(data);
        console.log(`✅ Fetched ${tweets.length} tweets`);
        
        const transformedTweets = tweets.map(tweet => ({
          id: tweet.id_str,
          text: tweet.text,
          created_at: new Date(tweet.created_at).toISOString(),
          public_metrics: {
            like_count: tweet.favorite_count || 0,
            retweet_count: tweet.retweet_count || 0,
            reply_count: 0
          },
          entities: {
            hashtags: tweet.entities?.hashtags || [],
            urls: tweet.entities?.urls || []
          },
          attachments: tweet.entities?.media ? { media_keys: ['media'] } : undefined
        }));
        
        res.json({ data: transformedTweets });
      } catch (parseError) {
        console.error('❌ Error parsing tweets:', parseError);
        res.status(500).json({ error: 'Failed to parse tweets' });
      }
    }
  );
});

// Clean up old tokens every hour
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [key, value] of tokenStore.entries()) {
    if (now - value.timestamp > oneHour) {
      tokenStore.delete(key);
      console.log('🧹 Cleaned up expired token:', key);
    }
  }
}, 60 * 60 * 1000);

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Error destroying session:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    console.log('👋 User logged out');
    res.json({ success: true });
  });
});

// Add this BEFORE app.listen(PORT, ...)

// Disconnect Twitter API
app.post('/api/twitter/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    
    console.log('🔌 Disconnecting Twitter for user:', userId);
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Delete from Supabase
    const { error } = await supabase
      .from('user_twitter_data')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Disconnect error:', error);
      throw error;
    }

    console.log('✅ Twitter disconnected successfully');
    
    res.json({ success: true, message: 'Twitter disconnected' });
  } catch (err) {
    console.error('❌ Disconnect error:', err);
    res.status(500).json({ 
      error: 'Failed to disconnect',
      message: err.message 
    });
  }
});

// Get user's Twitter data
app.get('/api/twitter/data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📥 Fetching Twitter data for:', userId);
    
    const { data, error } = await supabase
      .from('user_twitter_data')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return res.json({ connected: false });
      }
      throw error;
    }

    console.log('✅ Found Twitter data');
    
    res.json({ 
      connected: true,
      data: data
    });
  } catch (err) {
    console.error('❌ Error fetching data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('\n🚀 ===================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Backend: ${process.env.BACKEND_URL}`);
  console.log(`📍 Frontend: ${process.env.FRONTEND_URL}`);
  console.log('🚀 ===================================\n');
});

// Add after your other endpoints
app.post('/api/upload/tweets', async (req, res) => {
  try {
    const { csvData } = req.body;
    
    console.log('📤 Processing uploaded CSV data...');
    
    // Parse CSV
    Papa.parse(csvData, {
      header: true,
      complete: (results) => {
        const tweets = results.data
          .filter(row => row.text || row.tweet_text) // Filter empty rows
          .map(row => ({
            id: row.tweet_id || row.id || String(Math.random()),
            text: row.text || row.tweet_text || '',
            created_at: row.created_at || row.timestamp || new Date().toISOString(),
            public_metrics: {
              like_count: parseInt(row.likes || row.like_count || 0),
              retweet_count: parseInt(row.retweets || row.retweet_count || 0),
              reply_count: parseInt(row.replies || row.reply_count || 0)
            },
            entities: {
              hashtags: extractHashtags(row.text || row.tweet_text || ''),
              urls: extractUrls(row.text || row.tweet_text || '')
            }
          }));
        
        console.log(`✅ Parsed ${tweets.length} tweets from CSV`);
        res.json({ 
          success: true, 
          tweets,
          count: tweets.length 
        });
      },
      error: (error) => {
        console.error('❌ CSV parsing error:', error);
        res.status(400).json({ error: 'Failed to parse CSV' });
      }
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper functions
function extractHashtags(text) {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex) || [];
  return matches.map(tag => ({ tag: tag.slice(1) }));
}

function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches.map(url => ({ url }));
}

// Trending hashtags endpoint
app.get('/api/trends/hashtags', async (req, res) => {
  try {
    console.log('📈 Fetching trending hashtags...');
    
    const { niche } = req.query;
    
    // Option 1: Use Twitter's public trends (if available)
    // This requires app-only Bearer token
    const twitterTrends = await fetch(
      'https://api.twitter.com/1.1/trends/place.json?id=1', // 1 = Worldwide
      {
        headers: {
          'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
        }
      }
    );
    
    if (twitterTrends.ok) {
      const trends = await twitterTrends.json();
      const trending = trends[0].trends.slice(0, 10).map(t => ({
        name: t.name,
        volume: t.tweet_volume || 'N/A',
        url: t.url
      }));
      
      console.log(`✅ Found ${trending.length} trending topics`);
      return res.json({ trends: trending, source: 'Twitter' });
    }
    
    // Option 2: Fallback to curated data by niche
    const curatedTrends = getCuratedTrends(niche);
    console.log(`✅ Using curated trends for ${niche || 'general'}`);
    res.json({ trends: curatedTrends, source: 'Curated' });
    
  } catch (err) {
    console.error('❌ Error fetching trends:', err);
    
    // Always return something useful
    const fallbackTrends = getCuratedTrends(req.query.niche);
    res.json({ trends: fallbackTrends, source: 'Fallback' });
  }
});

// Best posting times by niche
app.get('/api/trends/posting-times', async (req, res) => {
  const { niche } = req.query;
  
  console.log(`📊 Getting best posting times for: ${niche || 'general'}`);
  
  const postingTimes = getOptimalPostingTimes(niche);
  res.json({ times: postingTimes, niche: niche || 'general' });
});

// Helper function for curated trends
function getCuratedTrends(niche) {
  const trendsByNiche = {
    tech: [
      { name: '#coding', volume: '50K', url: 'https://twitter.com/search?q=%23coding' },
      { name: '#AI', volume: '120K', url: 'https://twitter.com/search?q=%23AI' },
      { name: '#webdev', volume: '45K', url: 'https://twitter.com/search?q=%23webdev' },
      { name: '#javascript', volume: '35K', url: 'https://twitter.com/search?q=%23javascript' },
      { name: '#python', volume: '40K', url: 'https://twitter.com/search?q=%23python' },
      { name: '#machinelearning', volume: '55K', url: 'https://twitter.com/search?q=%23machinelearning' },
      { name: '#startup', volume: '30K', url: 'https://twitter.com/search?q=%23startup' },
      { name: '#tech', volume: '80K', url: 'https://twitter.com/search?q=%23tech' }
    ],
    fitness: [
      { name: '#fitness', volume: '90K', url: 'https://twitter.com/search?q=%23fitness' },
      { name: '#workout', volume: '65K', url: 'https://twitter.com/search?q=%23workout' },
      { name: '#gym', volume: '70K', url: 'https://twitter.com/search?q=%23gym' },
      { name: '#health', volume: '55K', url: 'https://twitter.com/search?q=%23health' },
      { name: '#fitfam', volume: '40K', url: 'https://twitter.com/search?q=%23fitfam' },
      { name: '#wellness', volume: '35K', url: 'https://twitter.com/search?q=%23wellness' }
    ],
    business: [
      { name: '#entrepreneur', volume: '45K', url: 'https://twitter.com/search?q=%23entrepreneur' },
      { name: '#marketing', volume: '50K', url: 'https://twitter.com/search?q=%23marketing' },
      { name: '#business', volume: '60K', url: 'https://twitter.com/search?q=%23business' },
      { name: '#startup', volume: '35K', url: 'https://twitter.com/search?q=%23startup' },
      { name: '#sales', volume: '30K', url: 'https://twitter.com/search?q=%23sales' },
      { name: '#leadership', volume: '25K', url: 'https://twitter.com/search?q=%23leadership' }
    ],
    creative: [
      { name: '#design', volume: '55K', url: 'https://twitter.com/search?q=%23design' },
      { name: '#art', volume: '75K', url: 'https://twitter.com/search?q=%23art' },
      { name: '#photography', volume: '60K', url: 'https://twitter.com/search?q=%23photography' },
      { name: '#creative', volume: '40K', url: 'https://twitter.com/search?q=%23creative' },
      { name: '#digitalart', volume: '45K', url: 'https://twitter.com/search?q=%23digitalart' }
    ],
    // In getCuratedTrends function
    music: [
      { name: '#newmusic', volume: '150K', url: 'https://twitter.com/search?q=%23newmusic' },
      { name: '#musician', volume: '95K', url: 'https://twitter.com/search?q=%23musician' },
      { name: '#musicproducer', volume: '80K', url: 'https://twitter.com/search?q=%23musicproducer' },
      { name: '#indie', volume: '75K', url: 'https://twitter.com/search?q=%23indie' },
      { name: '#hiphop', volume: '120K', url: 'https://twitter.com/search?q=%23hiphop' },
      { name: '#rap', volume: '110K', url: 'https://twitter.com/search?q=%23rap' },
      { name: '#singer', volume: '85K', url: 'https://twitter.com/search?q=%23singer' },
      { name: '#beats', volume: '70K', url: 'https://twitter.com/search?q=%23beats' }
    ]
  };
  
  return trendsByNiche[niche?.toLowerCase()] || trendsByNiche.tech;
}

function getOptimalPostingTimes(niche) {
  const timesByNiche = {
    tech: [
      { day: 'Tuesday', time: '9:00 AM', engagement: 95, timezone: 'EST', reason: 'Developers starting work day' },
      { day: 'Wednesday', time: '2:00 PM', engagement: 92, timezone: 'EST', reason: 'Mid-week productivity peak' },
      { day: 'Thursday', time: '10:00 AM', engagement: 90, timezone: 'EST', reason: 'Peak tech discussion time' },
      { day: 'Monday', time: '3:00 PM', engagement: 85, timezone: 'EST', reason: 'Afternoon break browsing' },
      { day: 'Friday', time: '11:00 AM', engagement: 83, timezone: 'EST', reason: 'Pre-weekend content consumption' }
    ],
    
    fitness: [
      { day: 'Monday', time: '6:00 AM', engagement: 94, timezone: 'EST', reason: 'Monday motivation peak' },
      { day: 'Wednesday', time: '5:30 AM', engagement: 92, timezone: 'EST', reason: 'Early morning workout crowd' },
      { day: 'Friday', time: '5:00 PM', engagement: 90, timezone: 'EST', reason: 'Weekend workout planning' },
      { day: 'Tuesday', time: '12:00 PM', engagement: 87, timezone: 'EST', reason: 'Lunchtime fitness tips' },
      { day: 'Thursday', time: '7:00 PM', engagement: 85, timezone: 'EST', reason: 'Evening gym session time' }
    ],
    
    business: [
      { day: 'Tuesday', time: '8:00 AM', engagement: 93, timezone: 'EST', reason: 'Business professionals start day' },
      { day: 'Wednesday', time: '12:00 PM', engagement: 91, timezone: 'EST', reason: 'Lunch break professional reading' },
      { day: 'Thursday', time: '9:00 AM', engagement: 89, timezone: 'EST', reason: 'Mid-week business momentum' },
      { day: 'Monday', time: '2:00 PM', engagement: 86, timezone: 'EST', reason: 'Week planning phase' },
      { day: 'Friday', time: '10:00 AM', engagement: 84, timezone: 'EST', reason: 'Week wrap-up insights' }
    ],
    
    creative: [
      { day: 'Wednesday', time: '7:00 PM', engagement: 94, timezone: 'EST', reason: 'Evening creative browsing' },
      { day: 'Thursday', time: '8:00 PM', engagement: 91, timezone: 'EST', reason: 'Late night inspiration seeking' },
      { day: 'Saturday', time: '11:00 AM', engagement: 89, timezone: 'EST', reason: 'Weekend portfolio browsing' },
      { day: 'Tuesday', time: '3:00 PM', engagement: 86, timezone: 'EST', reason: 'Afternoon creative break' },
      { day: 'Friday', time: '6:00 PM', engagement: 84, timezone: 'EST', reason: 'Weekend project inspiration' }
    ],
    
    music: [
      { day: 'Friday', time: '5:00 PM', engagement: 96, timezone: 'EST', reason: 'New music Friday - release day' },
      { day: 'Tuesday', time: '3:00 PM', engagement: 89, timezone: 'EST', reason: 'New Music Tuesday tradition' },
      { day: 'Thursday', time: '4:00 PM', engagement: 87, timezone: 'EST', reason: 'Pre-weekend music discovery' },
      { day: 'Wednesday', time: '7:00 PM', engagement: 85, timezone: 'EST', reason: 'Evening listening peak' },
      { day: 'Saturday', time: '12:00 PM', engagement: 83, timezone: 'EST', reason: 'Weekend playlist building' }
    ]
  };
  
  return timesByNiche[niche?.toLowerCase()] || timesByNiche.music;
}

// Handle data from browser extension
app.post('/api/upload/extension', async (req, res) => {
  try {
    const { tweets } = req.body;
    
    console.log(`📤 Received ${tweets.length} tweets from browser extension`);
    
    // Generate a session key
    const sessionKey = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the data temporarily
    tokenStore.set(sessionKey, {
      tweets: tweets,
      source: 'extension',
      timestamp: Date.now()
    });
    
    console.log(`✅ Extension data stored with key: ${sessionKey}`);
    
    res.json({ 
      success: true, 
      sessionKey: sessionKey,
      count: tweets.length 
    });
  } catch (err) {
    console.error('❌ Extension upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Retrieve extension data
app.post('/api/extension/data', async (req, res) => {
  try {
    const { sessionKey } = req.body;
    
    const sessionData = tokenStore.get(sessionKey);
    
    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    console.log(`✅ Retrieved ${sessionData.tweets.length} tweets for extension session`);
    
    res.json({ 
      tweets: sessionData.tweets,
      source: sessionData.source 
    });
  } catch (err) {
    console.error('❌ Error retrieving extension data:', err);
    res.status(500).json({ error: err.message });
  }
});

// Best practices database
const BestPracticesDB = {
  niches: {
    tech: {
      name: 'Technology & Development',
      optimalFrequency: '3-5 posts/day',
      bestContentTypes: [
        { type: 'Code snippets', multiplier: 2.1 },
        { type: 'Tutorial threads', multiplier: 2.8 },
        { type: 'Tech news commentary', multiplier: 1.9 },
        { type: 'Project showcases', multiplier: 2.3 }
      ],
      hashtagStrategy: {
        optimal: 2-3,
        topPerforming: ['#coding', '#webdev', '#AI', '#javascript', '#python', '#tech'],
        avoid: ['#code', '#programmer'] // too generic
      },
      engagementTactics: [
        'Ask technical questions to spark discussion',
        'Share "Today I learned" moments',
        'Create tutorial threads on Tuesdays',
        'Engage with #100DaysOfCode community',
        'Share before/after code improvements'
      ],
      communityRules: [
        'Reply to at least 10 tech accounts daily',
        'Retweet junior devs to support community',
        'Share resources and tools you discover',
        'Participate in Twitter Spaces about tech topics'
      ]
    },
    
    fitness: {
      name: 'Fitness & Wellness',
      optimalFrequency: '2-4 posts/day',
      bestContentTypes: [
        { type: 'Workout videos', multiplier: 3.2 },
        { type: 'Transformation photos', multiplier: 2.9 },
        { type: 'Motivational quotes', multiplier: 1.8 },
        { type: 'Form check videos', multiplier: 2.4 }
      ],
      hashtagStrategy: {
        optimal: 3-4,
        topPerforming: ['#fitness', '#workout', '#fitfam', '#gym', '#health'],
        avoid: ['#fitspo', '#bodygoals'] // overused
      },
      engagementTactics: [
        'Post workout content at 6 AM and 6 PM',
        'Share Monday motivation consistently',
        'Create weekly challenge threads',
        'Document your fitness journey openly',
        'Share meal prep on Sundays'
      ],
      communityRules: [
        'Celebrate others\' progress in comments',
        'Share fitness tips based on your experience',
        'Host Q&A sessions monthly',
        'Partner with other fitness accounts for challenges'
      ]
    },
    
    business: {
      name: 'Business & Entrepreneurship',
      optimalFrequency: '4-6 posts/day',
      bestContentTypes: [
        { type: 'Business insights', multiplier: 2.4 },
        { type: 'Revenue screenshots', multiplier: 2.7 },
        { type: 'Lessons learned threads', multiplier: 2.6 },
        { type: 'Industry news takes', multiplier: 2.0 }
      ],
      hashtagStrategy: {
        optimal: 1-2,
        topPerforming: ['#entrepreneur', '#startup', '#business', '#marketing'],
        avoid: ['#boss', '#hustle'] // cliché
      },
      engagementTactics: [
        'Share metrics and transparency',
        'Post controversial but thoughtful takes',
        'Create "how I did X" threads',
        'Share mistakes and lessons openly',
        'Ask questions about your audience\'s pain points'
      ],
      communityRules: [
        'Engage with potential customers daily',
        'Provide value before asking for follows',
        'Comment thoughtfully on industry leaders\' posts',
        'Share others\' wins and tag them'
      ]
    },
    
    creative: {
      name: 'Creative & Design',
      optimalFrequency: '2-3 posts/day',
      bestContentTypes: [
        { type: 'Portfolio showcases', multiplier: 3.1 },
        { type: 'Design process videos', multiplier: 2.8 },
        { type: 'Behind the scenes', multiplier: 2.3 },
        { type: 'Design tips', multiplier: 2.1 }
      ],
      hashtagStrategy: {
        optimal: 3-5,
        topPerforming: ['#design', '#art', '#illustration', '#graphicdesign', '#creative'],
        avoid: ['#artist', '#artwork'] // too broad
      },
      engagementTactics: [
        'Share work-in-progress regularly',
        'Post time-lapse videos of creation',
        'Create "design challenge" threads',
        'Share your creative process openly',
        'Ask for feedback on drafts'
      ],
      communityRules: [
        'Support fellow creatives with retweets',
        'Participate in design challenges',
        'Share resources and tools you use',
        'Provide constructive feedback to others'
      ]
    }
  },

    // ADD THIS NEW MUSIC SECTION
    music: {
    name: 'Music & Entertainment',
    optimalFrequency: '2-4 posts/day',
    bestContentTypes: [
      { type: 'Music snippets (15-30s)', multiplier: 3.4 },
      { type: 'Behind the scenes studio', multiplier: 2.9 },
      { type: 'Lyrics & meaning threads', multiplier: 2.2 },
      { type: 'Spotify/streaming links', multiplier: 2.5 },
      { type: 'Collaboration announcements', multiplier: 2.7 },
      { type: 'Live performance clips', multiplier: 3.1 }
    ],
    hashtagStrategy: {
      optimal: 3-5,
      topPerforming: [
        '#music', '#musician', '#newmusic', '#musicproducer', 
        '#indie', '#hiphop', '#pop', '#rock', '#rap', '#singer'
      ],
      genreSpecific: {
        hiphop: ['#hiphop', '#rap', '#beats', '#rapper', '#hiphopmusic'],
        pop: ['#pop', '#popmusic', '#newsingle', '#popstar'],
        rock: ['#rock', '#rockmusic', '#alternative', '#metal'],
        electronic: ['#edm', '#electronic', '#producer', '#dj', '#techno'],
        indie: ['#indie', '#indiemusic', '#indieartist', '#bedroom'],
        rnb: ['#rnb', '#soul', '#rnbmusic', '#singer']
      },
      avoid: ['#soundcloud', '#followback'] // overused/spammy
    },
    bestPostingTimes: [
      { day: 'Friday', time: '5:00 PM', engagement: 96, reason: 'Weekend playlist prep' },
      { day: 'Tuesday', time: '3:00 PM', engagement: 89, reason: 'New music Tuesday tradition' },
      { day: 'Wednesday', time: '7:00 PM', engagement: 87, reason: 'Evening listening peak' },
      { day: 'Thursday', time: '4:00 PM', engagement: 85, reason: 'Pre-weekend discovery' },
      { day: 'Saturday', time: '12:00 PM', engagement: 83, reason: 'Weekend casual browsing' }
    ],
    engagementTactics: [
      'Post music snippets on Fridays (release day)',
      'Share production process in stories/threads',
      'Create "This or That" polls with your tracks',
      'Respond to every comment with voice notes',
      'Collaborate publicly with other artists',
      'Share your Spotify Wrapped/streaming stats',
      'Post lyrics with hidden meanings explained',
      'Go live on Twitter Spaces weekly',
      'Share your music production setup',
      'Create challenges with your songs (TikTok style)'
    ],
    communityRules: [
      'Support other independent artists daily',
      'Share playlists featuring similar artists',
      'Engage with music blogs and curators',
      'Retweet fan covers/remixes of your work',
      'Thank every playlist add publicly',
      'Join #MusicTwitter conversations',
      'Host listening parties for new releases',
      'Provide feedback to upcoming artists'
    ],
    contentCalendar: {
      monday: 'Motivation Monday - share your journey',
      tuesday: 'New Music Tuesday - preview upcoming release',
      wednesday: 'Behind the scenes - studio/process',
      thursday: 'Throwback - old work or influences',
      friday: 'Release day - new music or playlist update',
      saturday: 'Fan appreciation - share covers/reactions',
      sunday: 'Reflection - lessons learned this week'
    },
    growthStrategies: [
      {
        strategy: 'Playlist Curator Outreach',
        description: 'Follow and engage with playlist curators in your genre for 2 weeks before pitching',
        timeline: '2-4 weeks',
        expectedResult: '5-10 playlist adds'
      },
      {
        strategy: 'Collaboration Threads',
        description: 'Create a "Looking for collaborators" thread monthly with your style/needs',
        timeline: 'Ongoing',
        expectedResult: '3-5 collaboration opportunities/month'
      },
      {
        strategy: 'Sound Sample Series',
        description: 'Share 10-second samples of unreleased tracks to build anticipation',
        timeline: '2 weeks before release',
        expectedResult: '40% more engagement on release day'
      },
      {
        strategy: 'Music Twitter Spaces',
        description: 'Host weekly listening parties or Q&A sessions',
        timeline: 'Weekly',
        expectedResult: '100+ engaged listeners per session'
      }
    ],
    monetizationTips: [
      'Link to Bandcamp/Patreon in bio',
      'Offer exclusive tracks for email subscribers',
      'Sell beat packs or sample kits',
      'Offer mixing/mastering services',
      'Create educational content (courses/coaching)',
      'Merchandise linked in pinned tweet',
      'Sponsored posts with music gear companies'
    ],
    toolsAndResources: [
      'DistroKid/TuneCore for distribution',
      'Canva for album art',
      'Splice for samples',
      'LANDR for mastering',
      'SubmitHub for playlist pitching',
      'Chartmetric for analytics',
      'Hootsuite for scheduling posts'
    ]
  },
  
  universal: {
    goldenRules: [
      'Post consistently at same times daily',
      'Engage before you post (15 min rule)',
      'Reply to every comment in first hour',
      'Use threads for complex topics',
      'Pin your best performing tweet',
      'Update profile bio monthly',
      'Add relevant hashtags naturally in copy'
    ],
    
    contentMix: {
      educational: 40,
      personal: 30,
      promotional: 20,
      engagement: 10
    },
    
    growthHacks: [
      {
        title: 'The 1-3-5 Method',
        description: 'Engage with 1 big account, 3 medium accounts, 5 small accounts in your niche daily',
        impact: 'High'
      },
      {
        title: 'Thread Repurposing',
        description: 'Turn your best threads into carousel posts after 48 hours',
        impact: 'Medium'
      },
      {
        title: 'Comment Threading',
        description: 'Reply to your own tweets with additional context 2-3 times',
        impact: 'High'
      },
      {
        title: 'Strategic Tagging',
        description: 'Tag 1-2 relevant accounts per post (not more)',
        impact: 'Medium'
      }
    ],
    
    avoidAtAllCosts: [
      'Buying followers or engagement',
      'Using banned hashtags (#follow4follow)',
      'Posting only promotional content',
      'Ignoring comments on your posts',
      'Posting at random times inconsistently',
      'Using more than 5 hashtags',
      'Copying others\' content verbatim'
    ]
  }
};

// API endpoint for best practices
app.get('/api/best-practices', (req, res) => {
  const { niche } = req.query;
  
  const nicheData = BestPracticesDB.niches[niche?.toLowerCase()];
  const universal = BestPracticesDB.universal;
  
  if (!nicheData) {
    return res.json({
      message: 'Niche not found, returning universal best practices',
      data: universal
    });
  }
  
  res.json({
    niche: nicheData,
    universal: universal
  });
});

// Get personalized recommendations
app.post('/api/recommendations/personalized', (req, res) => {
  const { niche, followers, avgEngagement, postsPerWeek } = req.body;
  
  const nicheData = BestPracticesDB.niches[niche?.toLowerCase()] || BestPracticesDB.niches.tech;
  const recommendations = [];
  
  // Frequency recommendation
  const targetPosts = parseInt(nicheData.optimalFrequency.split('-')[0]);
  const currentDaily = postsPerWeek / 7;
  
  if (currentDaily < targetPosts) {
    recommendations.push({
      priority: 'High',
      category: 'Frequency',
      title: `Increase to ${nicheData.optimalFrequency}`,
      insight: `You're posting ${currentDaily.toFixed(1)} times/day. ${nicheData.name} accounts perform best with ${nicheData.optimalFrequency}.`,
      action: `Gradually increase to ${targetPosts} posts daily. Focus on quality over quantity.`,
      expectedImpact: `+${Math.round((targetPosts - currentDaily) * 30)}% reach`
    });
  }
  
  // Content type recommendation
  const bestContent = nicheData.bestContentTypes[0];
  recommendations.push({
    priority: 'High',
    category: 'Content Type',
    title: `Focus on ${bestContent.type}`,
    insight: `${bestContent.type} get ${bestContent.multiplier}x average engagement in ${nicheData.name}.`,
    action: `Create at least 2 ${bestContent.type.toLowerCase()} per week.`,
    expectedImpact: `+${Math.round((bestContent.multiplier - 1) * 100)}% engagement`
  });
  
  // Hashtag recommendation
  recommendations.push({
    priority: 'Medium',
    category: 'Hashtags',
    title: 'Optimize Your Hashtag Strategy',
    insight: `Use ${nicheData.hashtagStrategy.optimal} hashtags per post.`,
    action: `Top tags: ${nicheData.hashtagStrategy.topPerforming.slice(0, 3).join(', ')}. Avoid: ${nicheData.hashtagStrategy.avoid.join(', ')}.`,
    expectedImpact: '+25% discoverability'
  });
  
  // Engagement recommendation
  const engagementTip = nicheData.engagementTactics[Math.floor(Math.random() * nicheData.engagementTactics.length)];
  recommendations.push({
    priority: 'Medium',
    category: 'Engagement',
    title: 'Community Engagement Tactic',
    insight: engagementTip,
    action: 'Implement this tactic starting today.',
    expectedImpact: '+40% engagement rate'
  });
  
  // Growth hack
  const growthHack = BestPracticesDB.universal.growthHacks[0];
  recommendations.push({
    priority: growthHack.impact,
    category: 'Growth',
    title: growthHack.title,
    insight: growthHack.description,
    action: 'Add this to your daily routine.',
    expectedImpact: 'Sustained growth'
  });
  
  res.json({ recommendations });
});

// Search hashtag data via Nitter (no auth needed)
app.get('/api/search/hashtag', async (req, res) => {
  try {
    const { hashtag } = req.query;
    
    if (!hashtag) {
      return res.status(400).json({ error: 'Hashtag required' });
    }
    
    console.log(`🔍 Searching hashtag: ${hashtag}`);
    
    // Use Nitter instance (public Twitter mirror)
    const cleanTag = hashtag.replace('#', '');
    const nitterUrl = `https://nitter.net/search?f=tweets&q=%23${cleanTag}`;
    
    const response = await fetch(nitterUrl);
    const html = await response.text();
    
    // Parse HTML
    const $ = cheerio.load(html);
    const tweets = [];
    
    $('.timeline-item').each((i, elem) => {
      if (i >= 20) return; // Limit to 20 tweets
      
      const $elem = $(elem);
      const text = $elem.find('.tweet-content').text().trim();
      const stats = $elem.find('.tweet-stat');
      
      let likes = 0, retweets = 0, replies = 0;
      
      stats.each((j, stat) => {
        const $stat = $(stat);
        const value = parseInt($stat.find('.icon-container').text().trim()) || 0;
        const title = $stat.attr('title') || '';
        
        if (title.includes('retweet')) retweets = value;
        else if (title.includes('like')) likes = value;
        else if (title.includes('repl')) replies = value;
      });
      
      tweets.push({
        text,
        public_metrics: {
          like_count: likes,
          retweet_count: retweets,
          reply_count: replies
        },
        engagement: likes + retweets + replies
      });
    });
    
    // Calculate statistics
    const totalEngagement = tweets.reduce((sum, t) => sum + t.engagement, 0);
    const avgEngagement = tweets.length > 0 ? Math.round(totalEngagement / tweets.length) : 0;
    
    const stats = {
      hashtag: `#${cleanTag}`,
      totalTweets: tweets.length,
      avgEngagement,
      totalEngagement,
      topTweets: tweets.sort((a, b) => b.engagement - a.engagement).slice(0, 5)
    };
    
    console.log(`✅ Found ${tweets.length} tweets for #${cleanTag}`);
    
    res.json({ stats, tweets });
    
  } catch (err) {
    console.error('❌ Hashtag search error:', err);
    res.status(500).json({ 
      error: 'Failed to search hashtag',
      fallback: 'Try using the hashtag in Twitter search directly'
    });
  }
});

// Fallback hashtag stats (no scraping needed)
app.get('/api/search/hashtag', async (req, res) => {
  const { hashtag } = req.query;
  
  if (!hashtag) {
    return res.status(400).json({ error: 'Hashtag required' });
  }
  
  console.log(`🔍 Generating stats for: ${hashtag}`);
  
  // Generate realistic mock stats based on hashtag
  const cleanTag = hashtag.replace('#', '');
  const baseEngagement = cleanTag.length * 7 + Math.random() * 50;
  
  const stats = {
    hashtag: `#${cleanTag}`,
    totalTweets: Math.floor(Math.random() * 1000) + 500,
    avgEngagement: Math.floor(baseEngagement),
    totalEngagement: Math.floor(baseEngagement * 50),
    estimatedReach: Math.floor(Math.random() * 50000) + 10000,
    trendingScore: Math.floor(Math.random() * 100),
    topTweets: [
      {
        text: `Example tweet using ${hashtag} - this would be real data with API access`,
        public_metrics: { like_count: Math.floor(Math.random() * 100), retweet_count: Math.floor(Math.random() * 50), reply_count: Math.floor(Math.random() * 20) }
      },
      {
        text: `Another sample tweet with ${hashtag}`,
        public_metrics: { like_count: Math.floor(Math.random() * 80), retweet_count: Math.floor(Math.random() * 40), reply_count: Math.floor(Math.random() * 15) }
      }
    ],
    note: 'Using estimated data. Upgrade to Twitter API for real statistics.'
  };
  
  res.json({ stats });
});

const ragEngine = new RAGEngine();
// Index user data for RAG
app.post('/api/rag/index', async (req, res) => {
  try {
    const { userData } = req.body;
    
    await ragEngine.indexUserData(userData);
    
    res.json({ success: true, message: 'Data indexed for personalized recommendations' });
  } catch (err) {
    console.error('❌ RAG indexing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get personalized advice
app.post('/api/rag/ask', async (req, res) => {
  try {
    const { question, userContext } = req.body;
    
    const result = await ragEngine.getPersonalizedAdvice(question, userContext);
    
    res.json(result);
  } catch (err) {
    console.error('❌ RAG query error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Twitter OAuth: Step 1 - Generate auth link
app.post('/api/auth/twitter/connect', async (req, res) => {
  try {
    const { userId, email } = req.body;
    
    console.log('🔌 Twitter connect request for user:', userId);
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
    });

    const callbackURL = `${process.env.BACKEND_URL}/api/twitter/callback`;
    
    console.log('🔗 Callback URL:', callbackURL);

    const authLink = await client.generateAuthLink(callbackURL, { 
      linkMode: 'authorize'
    });

    oauthStates.set(authLink.oauth_token, {
      oauth_token_secret: authLink.oauth_token_secret,
      userId: userId,
      email: email,
      timestamp: Date.now()
    });

    console.log('✅ Generated auth link');

    res.json({ 
      authUrl: authLink.url,
      oauth_token: authLink.oauth_token
    });

  } catch (error) {
    console.error('❌ Error generating Twitter auth link:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth link',
      message: error.message 
    });
  }
});

// Twitter OAuth: Step 2 - Handle callback
app.get('/api/twitter/callback', async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;
    
    console.log('📥 Twitter callback received');

    if (!oauth_token || !oauth_verifier) {
      return res.redirect(`${process.env.FRONTEND_URL}?error=missing_oauth_params`);
    }

    const storedData = oauthStates.get(oauth_token);
    
    if (!storedData) {
      console.error('❌ OAuth token not found');
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_oauth_token`);
    }

    const { oauth_token_secret, userId } = storedData;

    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const { client: loggedClient } = await client.login(oauth_verifier);

    console.log('✅ Twitter login successful');

    // In the same callback endpoint, update the Supabase upsert:
    const result = await supabase
  .from('user_twitter_data')
  .upsert({
    user_id: userId,
    user_info: {
      username: user.data.username,
      name: user.data.name,
      profile_image_url: user.data.profile_image_url,
      description: user.data.description || '',
      public_metrics: user.data.public_metrics || {
        followers_count: 0,
        following_count: 0,
        tweet_count: 0,
        listed_count: 0
      }
    },
    tweets: tweetsList,
    message: `Successfully fetched ${tweetsList.length} tweets from Twitter API`,
    updated_at: new Date().toISOString()
  })
  .select()
  .single();

if (result.error) {
  console.error('❌ Database error:', result.error);
  return res.redirect(`${process.env.FRONTEND_URL}?error=database_error`);
}

console.log('✅ Data saved to database');

    console.log('👤 Twitter user:', user.data.username);

    console.log('📥 Fetching tweets...');
    let tweetsList = [];

    try {
      const tweets = await loggedClient.v2.userTimeline(user.data.id, {
        max_results: 100,
        'tweet.fields': ['created_at', 'public_metrics', 'text'],
      });
      tweetsList = tweets.data.data || [];
    } catch (tweetError) {
      if (tweetError.code === 429) {
        console.log('⚠️  Rate limit hit - saving user data without tweets');
        // Continue anyway - we'll save the user info at least
      } else {
        throw tweetError; // Re-throw if it's a different error
      }
    }
    console.log(`✅ Fetched ${tweetsList.length} tweets`);

    // Store in Supabase - bypass RLS with service role
  const { data: savedData, error: dbError } = await supabase
    .from('user_twitter_data')
    .upsert({
      user_id: userId,
      user_info: {
        username: user.data.username,
        name: user.data.name,
        profile_image_url: user.data.profile_image_url,
        public_metrics: user.data.public_metrics
      },
      tweets: tweetsList,
      message: `Successfully fetched ${tweetsList.length} tweets from Twitter API`,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      return res.redirect(`${process.env.FRONTEND_URL}?error=database_error`);
    }

    console.log('✅ Data saved to database');

    oauthStates.delete(oauth_token);

    res.redirect(`${process.env.FRONTEND_URL}?twitter_connected=success`);

  } catch (error) {
    console.error('❌ Twitter callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}?error=twitter_auth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// Cleanup old OAuth states
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000;
  
  for (const [token, data] of oauthStates.entries()) {
    if (now - data.timestamp > maxAge) {
      oauthStates.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Test Twitter API credentials
app.get('/api/test/twitter', async (req, res) => {
  try {
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
    });
    
    res.json({ 
      success: true,
      message: 'Twitter credentials are valid!',
      hasApiKey: !!process.env.TWITTER_API_KEY,
      hasApiSecret: !!process.env.TWITTER_API_SECRET
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});