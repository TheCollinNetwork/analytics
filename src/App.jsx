// src/App.js
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { TrendingUp, Target, LogOut } from 'lucide-react';
import SpotifyTracker from './SpotifyTracker';

// Vite uses import.meta.env instead of process.env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('🚀 App Loading with Supabase!');
console.log('🔍 Supabase URL:', SUPABASE_URL);
console.log('🔍 Key length:', SUPABASE_ANON_KEY?.length);

// Check if credentials are set
if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL not set! Add it to .env file');
}
if (!SUPABASE_ANON_KEY) {
  console.error('❌ VITE_SUPABASE_ANON_KEY not set! Add it to .env file');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [session, setSession] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [trendingData, setTrendingData] = useState(null);
  const [userNiche, setUserNiche] = useState('tech');
  const [hashtagSearch, setHashtagSearch] = useState('');
  const [hashtagResults, setHashtagResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [bestPractices, setBestPractices] = useState(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const API = 'https://verbose-space-invention-7vv49g9xq4qfxwp-3001.app.github.dev';

  // Check for existing session and handle OAuth callback
  useEffect(() => {
    console.log('🔍 App mounted - checking auth...');
    
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('📍 Current URL:', window.location.href);
        console.log('📍 Hash:', window.location.hash);
        
        // Check for Twitter API connection callback
        const urlParams = new URLSearchParams(window.location.search);
        const twitterConnected = urlParams.get('twitter_connected');
        const errorParam = urlParams.get('error');
        
        if (twitterConnected === 'success') {
          console.log('✅ Twitter API connected successfully!');
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Get current session first
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          
          if (currentSession) {
            console.log('🔄 Reloading user data after Twitter connection...');
            // Add a small delay to ensure database write completed
            await new Promise(resolve => setTimeout(resolve, 1000));
            await loadUserData(currentSession.user.id);
          }
        } else if (errorParam) {
          console.error('❌ Twitter connection error:', errorParam);
          const message = urlParams.get('message');
          setError(`Twitter connection failed: ${message || errorParam}`);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Rest of your existing auth code...
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Auth error:', error);
          setError('Authentication error: ' + error.message);
          setIsLoading(false);
          return;
        }
        
        if (session) {
          console.log('✅ Session found!');
          console.log('👤 User:', session.user.user_metadata?.user_name || session.user.id);
          
          if (mounted) {
            setSession(session);
            await loadUserData(session.user.id);
            
            if (window.location.hash) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        } else {
          console.log('ℹ️ No session found');
        }
        
        if (mounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('❌ Init auth error:', err);
        if (mounted) {
          setError('Failed to initialize: ' + err.message);
          setIsLoading(false);
        }
      }
    };
    
    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth event:', event);
      
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ User signed in!');
        console.log('👤 Username:', session.user.user_metadata?.user_name);
        
        if (mounted) {
          setSession(session);
          setIsLoading(false);
          await loadUserData(session.user.id);
          
          // Clean up URL
          if (window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        if (mounted) {
          setSession(null);
          setIsConnected(false);
          setData(null);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
        if (mounted && session) {
          setSession(session);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userNiche) {
      fetchTrendingData(userNiche);
      fetchBestPractices(userNiche);
    }
  }, [userNiche]);

  useEffect(() => {
    if (isConnected && data && data.analytics) {
      indexDataForRAG();
    }
  }, [isConnected, data]);

  // Update loadUserData function
  const loadUserData = async (userId) => {
    try {
      console.log('📥 Loading user data for:', userId);
      
      const { data: userData, error } = await supabase
        .from('user_twitter_data')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      console.log('📦 Raw data from Supabase:', userData);
      console.log('❌ Any errors?', error);

      if (error) {
        console.error('❌ Error loading data:', error);
        setIsConnected(false);
        return;
      }

      if (userData) {
        console.log('✅ Found Twitter data!');
        console.log('   Username:', userData.user_info?.username);
        console.log('   Tweet count:', userData.tweets?.length);
        
        const analytics = analyzeEngagement(userData.user_info, userData.tweets);
        
        const loadedData = {
          user: userData.user_info,
          tweets: userData.tweets || [],
          analytics: analytics,
          message: userData.message || `Successfully fetched ${userData.tweets?.length || 0} tweets from Twitter API`
        };
        
        console.log('📊 Setting data state:', loadedData);
        
        setData(loadedData);
        setIsConnected(true);
        setError('');
      } else {
        console.log('ℹ️ No Twitter data found for this user');
        setIsConnected(false);
      }
    } catch (err) {
      console.error('❌ Load user data error:', err);
      setError('Failed to load data: ' + err.message);
      setIsConnected(false);
    }
  };

  const analyzeEngagement = (userData, tweets) => {
    if (!tweets || tweets.length === 0) {
      return {
        avgEngagement: 0,
        totalEngagement: 0,
        bestTimes: [],
        worstTimes: [],
        topHashtags: [],
        bestDays: []
      };
    }

    const totalEngagement = tweets.reduce((sum, tweet) => {
      return sum + (tweet.public_metrics?.like_count || 0) + 
             (tweet.public_metrics?.retweet_count || 0) + 
             (tweet.public_metrics?.reply_count || 0);
    }, 0);

    const avgEngagement = Math.round(totalEngagement / tweets.length);

    const hashtagCount = {};
    tweets.forEach(tweet => {
      const hashtags = tweet.text.match(/#\w+/g) || [];
      hashtags.forEach(tag => {
        hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
      });
    });

    const topHashtags = Object.entries(hashtagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    return {
      avgEngagement,
      totalEngagement,
      bestTimes: ['9 AM', '3 PM', '8 PM'],
      worstTimes: ['2 AM', '4 AM'],
      topHashtags,
      bestDays: ['Monday', 'Wednesday', 'Friday']
    };
  };

  const handleSignInWithTwitter = async () => {
    try {
      // Use current URL (works for localhost:5173, production, etc.)
      const redirectUrl = `${window.location.protocol}//${window.location.host}`;
      console.log('🔗 Redirect URL:', redirectUrl);
      console.log('🐦 Initiating Twitter OAuth...');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'twitter',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });
      
      if (error) {
        console.error('❌ OAuth error:', error);
        throw error;
      }
      
      console.log('✅ OAuth initiated successfully');
    } catch (err) {
      console.error('❌ Twitter login error:', err);
      setError('Failed to sign in with Twitter: ' + err.message);
    }
  };

  const handleSignInWithGoogle = async () => {
    try {
      const redirectUrl = `${window.location.protocol}//${window.location.host}`;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false
        }
      });
      
      if (error) throw error;
    } catch (err) {
      console.error('Google login error:', err);
      setError('Failed to sign in with Google: ' + err.message);
    }
  };

  const handleSignInWithGithub = async () => {
    try {
      const redirectUrl = `${window.location.protocol}//${window.location.host}`;
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false
        }
      });
      
      if (error) throw error;
    } catch (err) {
      console.error('GitHub login error:', err);
      setError('Failed to sign in with GitHub: ' + err.message);
    }
  };

  const handleConnectTwitterAPI = async () => {
    if (!session) {
      alert('Please sign in first');
      return;
    }

    setIsLoading(true);
    try {
      console.log('🔌 Connecting to Twitter API...');
      console.log('📡 API endpoint:', `${API}/api/auth/twitter/connect`);
      
      const response = await fetch(`${API}/api/auth/twitter/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: session.user.id,
          email: session.user.email || session.user.user_metadata?.email
        })
      });

      console.log('📥 Response status:', response.status);
      console.log('📥 Response ok:', response.ok);
      
      // Get the response text first to see what we're dealing with
      const responseText = await response.text();
      console.log('📥 Response text:', responseText.substring(0, 200));
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${responseText.substring(0, 100)}`);
      }
      
      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse JSON:', responseText);
        throw new Error('Backend returned invalid JSON. Is the backend running?');
      }
      
      if (data.authUrl) {
        console.log('✅ Got auth URL, redirecting...');
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authUrl in response');
      }
    } catch (err) {
      console.error('❌ Connect error:', err);
      setError('Failed to connect Twitter API: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !session) return;
    
    setUploading(true);
    setError('');
    
    try {
      const text = await file.text();
      
      const response = await fetch(`${API}/api/upload/tweets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          csvData: text,
          userId: session.user.id
        })
      });
      
      if (!response.ok) throw new Error('Failed to process CSV');
      
      const result = await response.json();
      console.log(`✅ Loaded ${result.count} tweets from CSV`);
      
      const mockUser = {
        username: session.user.user_metadata?.user_name || 'csv_user',
        name: session.user.user_metadata?.full_name || 'CSV Upload',
        public_metrics: {
          followers_count: 0,
          following_count: 0,
          tweet_count: result.tweets.length
        }
      };
      
      const analytics = analyzeEngagement(mockUser, result.tweets);
      
      await supabase
        .from('user_twitter_data')
        .upsert({
          user_id: session.user.id,
          user_info: mockUser,
          tweets: result.tweets,
          message: `Analyzed ${result.count} tweets from CSV`,
          updated_at: new Date()
        });
      
      setData({
        user: mockUser,
        tweets: result.tweets,
        analytics: analytics,
        message: `Analyzed ${result.count} tweets from your CSV file`
      });
      setIsConnected(true);
      
    } catch (err) {
      console.error('❌ CSV upload error:', err);
      setError('Failed to process CSV: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const fetchTrendingData = async (niche) => {
    try {
      const hashtagsRes = await fetch(`${API}/api/trends/hashtags?niche=${niche}`);
      const hashtagsData = await hashtagsRes.json();
      
      const timesRes = await fetch(`${API}/api/trends/posting-times?niche=${niche}`);
      const timesData = await timesRes.json();
      
      setTrendingData({
        hashtags: hashtagsData.trends || [],
        postingTimes: timesData.times || [],
        niche: niche
      });
    } catch (err) {
      console.error('❌ Error fetching trending data:', err);
    }
  };

  const searchHashtag = async () => {
    if (!hashtagSearch.trim()) {
      alert('Please enter a hashtag');
      return;
    }
    
    setSearching(true);
    setHashtagResults(null);
    
    try {
      const tag = hashtagSearch.trim();
      const response = await fetch(`${API}/api/search/hashtag?hashtag=${encodeURIComponent(tag)}&userId=${session?.user?.id}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      
      const data = await response.json();
      if (data.stats) {
        setHashtagResults(data.stats);
      }
    } catch (err) {
      console.error('❌ Search error:', err);
      alert('Search failed: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const fetchBestPractices = async (niche) => {
    try {
      const response = await fetch(`${API}/api/best-practices?niche=${niche}`);
      const data = await response.json();
      setBestPractices(data);
    } catch (err) {
      console.error('❌ Error loading best practices:', err);
    }
  };

  const indexDataForRAG = async () => {
    if (!session) return;
    
    try {
      await fetch(`${API}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userData: data,
          userId: session.user.id 
        })
      });
      console.log('✅ Data indexed for AI advisor');
    } catch (err) {
      console.error('❌ Indexing error:', err);
    }
  };

  const askAI = async () => {
    if (!aiQuestion.trim() || !session) return;
    
    setAiLoading(true);
    try {
      const response = await fetch(`${API}/api/rag/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: aiQuestion,
          userId: session.user.id,
          userContext: { username: data?.user?.username }
        })
      });
      
      const result = await response.json();
      setAiResponse(result);
    } catch (err) {
      console.error('❌ AI error:', err);
      alert('AI advisor error: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsConnected(false);
    setData(null);
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: '#1d9bf0', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Target size={40} color="white" />
          </div>
          <p style={{ fontSize: '18px', color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to bottom right, #eff6ff, #f3e8ff)', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: '400px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ width: '80px', height: '80px', background: '#1d9bf0', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={40} color="white" />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>Twitter Engagement Optimizer</h1>
            <p style={{ color: '#6b7280', marginBottom: '30px' }}>Sign in to get started</p>
          </div>
          
          {error && (
            <div style={{ padding: '15px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '20px', color: '#991b1b', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSignInWithTwitter}
            style={{
              width: '100%',
              padding: '15px',
              background: '#1d9bf0',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
            </svg>
            Continue with Twitter
          </button>

          <button
            onClick={handleSignInWithGoogle}
            style={{
              width: '100%',
              padding: '15px',
              background: 'white',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleSignInWithGithub}
            style={{
              width: '100%',
              padding: '15px',
              background: '#24292e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>

          <p style={{ marginTop: '20px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
            🔒 Your data is secure and private
          </p>
        </div>
      </div>
    );
  }

  // Main app view (not connected to Twitter data yet)
  if (!isConnected) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #f3e8ff)', padding: '40px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          
          {/* User info and sign out */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {session.user.user_metadata?.avatar_url && (
                <img 
                  src={session.user.user_metadata.avatar_url} 
                  alt="Avatar" 
                  style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                />
              )}
              <div>
                <p style={{ margin: 0, fontWeight: 'bold' }}>
                  {session.user.user_metadata?.full_name || session.user.email}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{session.user.email}</p>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ width: '80px', height: '80px', background: '#1d9bf0', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={40} color="white" />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px', color: '#1f2937' }}>Twitter Engagement Optimizer</h1>
            <p style={{ color: '#6b7280', fontSize: '16px' }}>Choose how to analyze your data</p>
          </div>

          {error && (
            <div style={{ padding: '15px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '20px', color: '#991b1b' }}>
              {error}
            </div>
          )}

          {/* Niche Selector */}
          <div style={{ background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <label style={{ fontSize: '16px', fontWeight: 'bold', marginRight: '15px' }}>
              Your Niche:
            </label>
            <select 
              value={userNiche} 
              onChange={(e) => setUserNiche(e.target.value)}
              style={{ padding: '8px 15px', fontSize: '16px', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="music">Music</option>
              <option value="tech">Tech</option>
              <option value="fitness">Fitness</option>
              <option value="business">Business</option>
              <option value="creative">Creative</option>
            </select>
          </div>

          {/* Connect Twitter Button */}
          <button
            onClick={handleConnectTwitterAPI}
            disabled={isLoading}
            style={{ 
              width: '100%', 
              padding: '18px', 
              background: '#1d9bf0', 
              color: 'white', 
              border: 'none', 
              borderRadius: '10px', 
              fontSize: '18px', 
              fontWeight: 'bold', 
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.5 : 1,
              marginBottom: '15px'
            }}
          >
            {isLoading ? 'Connecting...' : 'Connect Twitter API'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }}></div>
            <span style={{ padding: '0 10px', color: '#6b7280', fontSize: '14px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }}></div>
          </div>

          {/* CSV Upload */}
          <div style={{ padding: '20px', background: '#f0f9ff', borderRadius: '10px', border: '2px dashed #1d9bf0', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold', color: '#1f2937' }}>
              📁 Upload Twitter Data (CSV)
            </h3>
            <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#6b7280' }}>
              Upload your Twitter archive or export
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              disabled={uploading}
              style={{ 
                width: '100%', 
                padding: '10px',
                border: '1px solid #1d9bf0',
                borderRadius: '6px',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            />
            {uploading && <p style={{ marginTop: '10px', fontSize: '14px', color: '#1d9bf0' }}>Processing...</p>}
          </div>

          <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
            🔒 Your data is securely stored and private to your account
          </p>
        </div>
      </div>
    );
  }

  // Connected dashboard
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <TrendingUp size={32} color="#1d9bf0" />
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Twitter Analytics</h1>
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>@{data?.user?.username}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => setIsConnected(false)} 
              style={{ padding: '10px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              Disconnect
            </button>
            <button 
              onClick={handleSignOut}
              style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
        {data?.message && (
          <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#78350f', fontSize: '14px' }}>{data.message}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>Followers</p>
            <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0 }}>{data?.user?.public_metrics?.followers_count?.toLocaleString() || 0}</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>Following</p>
            <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0 }}>{data?.user?.public_metrics?.following_count?.toLocaleString() || 0}</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>Total Tweets</p>
            <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0 }}>{data?.user?.public_metrics?.tweet_count?.toLocaleString() || 0}</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>Analyzed</p>
            <p style={{ fontSize: '36px', fontWeight: 'bold', margin: 0, color: '#1d9bf0' }}>{data?.tweets?.length || 0}</p>
          </div>
        </div>

        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', color: '#1f2937' }}>Recent Tweets</h2>
          {data?.tweets?.length > 0 ? (
            data.tweets.slice(0, 10).map((tweet, i) => (
              <div key={i} style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', marginBottom: '12px', borderLeft: '3px solid #1d9bf0' }}>
                <p style={{ marginBottom: '10px', color: '#374151', lineHeight: '1.5' }}>{tweet.text}</p>
                <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#6b7280' }}>
                  <span>❤️ {tweet.public_metrics?.like_count || 0}</span>
                  <span>🔄 {tweet.public_metrics?.retweet_count || 0}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px' }}>{new Date(tweet.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No tweets to display</p>
          )}
        </div>
        

          {/* Spotify Tracker Component */}
        <SpotifyTracker userId={session?.user?.id} />

          {/* AI Advisor Section - Now on Dashboard */}
        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', marginBottom: '20px', color: 'white' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
            🤖 AI Engagement Advisor
          </h2>
          <p style={{ marginBottom: '20px', opacity: 0.9 }}>
            Ask personalized questions based on YOUR data
          </p>
          
          <div style={{ background: 'rgba(255,255,255,0.2)', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="e.g., How can I improve my engagement rate?"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && askAI()}
              style={{ 
                width: '100%', 
                padding: '12px', 
                border: 'none', 
                borderRadius: '6px',
                fontSize: '16px',
                marginBottom: '10px'
              }}
            />
            <button
              onClick={askAI}
              disabled={aiLoading || !data?.tweets?.length}
              style={{ 
                width: '100%',
                padding: '12px', 
                background: 'white', 
                color: '#667eea', 
                border: 'none', 
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: (aiLoading || !data?.tweets?.length) ? 'not-allowed' : 'pointer',
                opacity: (aiLoading || !data?.tweets?.length) ? 0.6 : 1
              }}
            >
              {aiLoading ? 'Thinking...' : !data?.tweets?.length ? 'Upload tweets first' : 'Get AI Advice'}
            </button>
          </div>
          
          {aiResponse && (
            <div style={{ background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: '8px', color: '#1f2937' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold' }}>
                💡 Personalized Advice:
              </h3>
              <p style={{ margin: '0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {aiResponse.advice}
              </p>
              {aiResponse.sources && (
                <p style={{ marginTop: '15px', fontSize: '12px', color: '#6b7280' }}>
                  Based on: {aiResponse.sources?.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>


        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', color: '#6380a8ff' }}>Recent Tweets</h2>
          {data?.tweets?.length > 0 ? (
            data.tweets.slice(0, 10).map((tweet, i) => (
              <div key={i} style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', marginBottom: '12px', borderLeft: '3px solid #1d9bf0' }}>
                <p style={{ marginBottom: '10px', color: '#374151', lineHeight: '1.5' }}>{tweet.text}</p>
                <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#6b7280' }}>
                  <span>❤️ {tweet.public_metrics?.like_count || 0}</span>
                  <span>🔄 {tweet.public_metrics?.retweet_count || 0}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px' }}>{new Date(tweet.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No tweets to display</p>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;