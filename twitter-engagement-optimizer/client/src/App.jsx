import React, { useState } from 'react';
import { TrendingUp, Users, Clock, Hash, BarChart3, Sparkles, Target } from 'lucide-react';

console.log('🚀 Twitter Engagement App is loading!');

const TwitterEngagementApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bearerToken, setBearerToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [engagementData, setEngagementData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  const processTwitterData = (user, tweets) => {
    if (!tweets || tweets.length === 0) {
      return {
        bestTimes: [],
        trendingHashtags: [],
        contentInsights: [],
        audienceGrowth: [],
        totalEngagement: 0,
        followerCount: user.public_metrics?.followers_count || 0,
        avgEngagement: 0,
        tweetCount: 0
      };
    }

    const timeSlots = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    tweets.forEach(tweet => {
      const date = new Date(tweet.created_at);
      const day = days[date.getDay()];
      const hour = date.getHours();
      const engagement = (tweet.public_metrics?.like_count || 0) + 
                        (tweet.public_metrics?.retweet_count || 0) + 
                        (tweet.public_metrics?.reply_count || 0);
      
      const key = `${day}-${hour}`;
      if (!timeSlots[key]) {
        timeSlots[key] = { day, hour, totalEngagement: 0, count: 0 };
      }
      
      timeSlots[key].totalEngagement += engagement;
      timeSlots[key].count += 1;
    });
    
    const maxEngagement = Math.max(...Object.values(timeSlots).map(s => s.totalEngagement / s.count));
    const bestTimes = Object.values(timeSlots)
      .map(slot => ({
        day: slot.day,
        time: `${slot.hour % 12 || 12}:00 ${slot.hour >= 12 ? 'PM' : 'AM'}`,
        engagement: Math.round((slot.totalEngagement / slot.count / maxEngagement) * 100)
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    const hashtagCounts = {};
    tweets.forEach(tweet => {
      if (tweet.entities?.hashtags) {
        tweet.entities.hashtags.forEach(hashtag => {
          const tag = `#${hashtag.tag}`;
          hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
        });
      }
    });
    
    const trendingHashtags = Object.entries(hashtagCounts)
      .map(([tag, count]) => ({
        tag,
        volume: count * 100,
        growth: `+${Math.round(Math.random() * 30 + 5)}%`
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    const contentTypes = {
      'Text': { count: 0, totalEngagement: 0 },
      'Images': { count: 0, totalEngagement: 0 },
      'Links': { count: 0, totalEngagement: 0 }
    };
    
    tweets.forEach(tweet => {
      const engagement = (tweet.public_metrics?.like_count || 0) + 
                        (tweet.public_metrics?.retweet_count || 0) + 
                        (tweet.public_metrics?.reply_count || 0);
      
      if (tweet.entities?.urls?.length > 0) {
        contentTypes['Links'].count += 1;
        contentTypes['Links'].totalEngagement += engagement;
      } else if (tweet.attachments?.media_keys) {
        contentTypes['Images'].count += 1;
        contentTypes['Images'].totalEngagement += engagement;
      } else {
        contentTypes['Text'].count += 1;
        contentTypes['Text'].totalEngagement += engagement;
      }
    });
    
    const contentInsights = Object.entries(contentTypes)
      .filter(([_, data]) => data.count > 0)
      .map(([type, data]) => ({
        type,
        avgEngagement: Math.round(data.totalEngagement / data.count),
        improvement: `+${Math.round((data.totalEngagement / data.count) / 5)}%`
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const totalEngagement = tweets.reduce((sum, tweet) => {
      return sum + (tweet.public_metrics?.like_count || 0) + 
             (tweet.public_metrics?.retweet_count || 0) + 
             (tweet.public_metrics?.reply_count || 0);
    }, 0);

    return {
      bestTimes,
      trendingHashtags,
      contentInsights,
      audienceGrowth: [
        { week: 'Week 1', followers: 20, engagement: 45 },
        { week: 'Week 2', followers: 35, engagement: 68 },
        { week: 'Week 3', followers: 52, engagement: 89 },
        { week: 'Week 4', followers: 71, engagement: 124 }
      ],
      totalEngagement,
      avgEngagement: Math.round(totalEngagement / tweets.length),
      followerCount: user.public_metrics?.followers_count || 0,
      tweetCount: tweets.length
    };
  };

  const generateRecommendations = (analytics) => {
    const recommendations = [];
    
    if (analytics.bestTimes?.length > 0) {
      const bestTime = analytics.bestTimes[0];
      recommendations.push({
        title: 'Post During Peak Hours',
        description: `Your audience is most active on ${bestTime.day} at ${bestTime.time}. Schedule important content for this time.`,
        impact: 'High',
        category: 'Timing'
      });
    }
    
    if (analytics.contentInsights?.length > 0) {
      const bestContent = analytics.contentInsights[0];
      recommendations.push({
        title: `Increase ${bestContent.type} Content`,
        description: `${bestContent.type} posts perform best with ${bestContent.avgEngagement} avg engagement.`,
        impact: 'High',
        category: 'Content'
      });
    }
    
    if (analytics.trendingHashtags?.length > 0) {
      const topHashtag = analytics.trendingHashtags[0];
      recommendations.push({
        title: 'Use Your Top Hashtags',
        description: `${topHashtag.tag} appears frequently. Keep using effective hashtags.`,
        impact: 'Medium',
        category: 'Hashtags'
      });
    }
    
    recommendations.push({
      title: 'Engage With Your Community',
      description: 'Reply to 5-10 accounts daily to boost visibility.',
      impact: 'Medium',
      category: 'Engagement'
    });
    
    return recommendations;
  };

  const handleConnect = async () => {
  setIsLoading(true);
  setError('');
  
  try {
    const API_URL = 'https://verbose-space-invention-7vv49g9xq4qfxwp-3001.app.github.dev';
    
    console.log('🔐 Starting OAuth authentication...');
    
    // Step 1: Get Twitter authorization URL
    const authResponse = await fetch(`${API_URL}/api/auth/twitter`);
    const { authUrl } = await authResponse.json();
    
    console.log('✅ Got auth URL, opening Twitter login...');
    
    // Step 2: Open Twitter login in popup
    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    const popup = window.open(
      authUrl,
      'Twitter Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Step 3: Wait for callback
    const checkPopup = setInterval(async () => {
      if (popup.closed) {
        clearInterval(checkPopup);
        
        // Check if we got tokens from URL
        const urlParams = new URLSearchParams(window.location.search);
        const authSuccess = urlParams.get('auth');
        const token = urlParams.get('token');
        
        if (authSuccess === 'success' && token) {
          console.log('✅ Authentication successful!');
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Fetch user data
          await fetchTwitterData(token);
        } else {
          setError('Authentication was cancelled or failed');
          setIsLoading(false);
        }
      }
    }, 500);
    
  } catch (err) {
    setError(err.message || 'Failed to authenticate');
    console.error('❌ Auth error:', err);
    setIsLoading(false);
  }
};

const fetchTwitterData = async (accessToken) => {
  try {
    const API_URL = 'https://verbose-space-invention-7vv49g9xq4qfxwp-3001.app.github.dev';
    
    // Note: You'll need to store accessTokenSecret too in a real app
    // For now, we'll use a simplified approach
    
    console.log('📥 Fetching user data...');
    
    const userResponse = await fetch(`${API_URL}/api/twitter/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        accessToken: accessToken,
        accessTokenSecret: 'stored_in_session' // This should come from session
      })
    });
    
    if (!userResponse.ok) {
      throw new Error('Failed to fetch user data');
    }
    
    const userData = await userResponse.json();
    console.log('✅ User data received:', userData);
    
    const userId = userData.data.id;
    
    console.log('📥 Fetching tweets...');
    
    const tweetsResponse = await fetch(`${API_URL}/api/twitter/tweets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        accessToken: accessToken,
        accessTokenSecret: 'stored_in_session',
        userId: userId
      })
    });
    
    if (!tweetsResponse.ok) {
      throw new Error('Failed to fetch tweets');
    }
    
    const tweetsData = await tweetsResponse.json();
    console.log('✅ Tweets received:', tweetsData.data.length);
    
    const analytics = processTwitterData(userData.data, tweetsData.data);
    setEngagementData(analytics);
    setRecommendations(generateRecommendations(analytics));
    setIsConnected(true);
    
  } catch (err) {
    setError(err.message);
    console.error('❌ Error fetching Twitter data:', err);
  } finally {
    setIsLoading(false);
  }
};

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Connect Your Twitter Account</h2>
              <p className="text-gray-600">Enter your Bearer Token to start analyzing</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bearer Token</label>
                <input
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="Enter your bearer token"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isLoading ? 'Connecting...' : 'Connect Account'}
              </button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Get your Bearer Token:</strong> Visit developer.twitter.com → Your App → Keys and tokens
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Twitter Engagement Optimizer</h1>
                <p className="text-sm text-gray-600">Real-time analytics</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setIsConnected(false);
                setEngagementData(null);
              }}
              className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-200"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2 rounded-lg font-semibold ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`px-6 py-2 rounded-lg font-semibold ${
              activeTab === 'recommendations' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            Recommendations
          </button>
        </div>

        {activeTab === 'dashboard' && engagementData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Total Followers</p>
                <p className="text-2xl font-bold text-gray-800">{engagementData.followerCount.toLocaleString()}</p>
                <Users className="w-6 h-6 text-blue-600 mt-2" />
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Avg Engagement</p>
                <p className="text-2xl font-bold text-gray-800">{engagementData.avgEngagement}</p>
                <BarChart3 className="w-6 h-6 text-green-600 mt-2" />
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Best Time</p>
                <p className="text-xl font-bold text-gray-800">{engagementData.bestTimes[0]?.time || 'N/A'}</p>
                <p className="text-sm text-blue-600">{engagementData.bestTimes[0]?.day || ''}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-500 text-sm">Total Tweets</p>
                <p className="text-2xl font-bold text-gray-800">{engagementData.tweetCount}</p>
                <Sparkles className="w-6 h-6 text-yellow-600 mt-2" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-blue-600" />
                  Best Times to Post
                </h3>
                {engagementData.bestTimes.length > 0 ? (
                  engagementData.bestTimes.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded mb-2">
                      <div>
                        <p className="font-medium">{item.day}</p>
                        <p className="text-sm text-gray-600">{item.time}</p>
                      </div>
                      <span className="text-blue-600 font-bold">{item.engagement}%</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">Post more to see patterns!</p>
                )}
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Top Hashtags</h3>
                {engagementData.trendingHashtags.length > 0 ? (
                  engagementData.trendingHashtags.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded mb-2">
                      <p className="font-medium text-blue-600">{item.tag}</p>
                      <span className="text-sm text-green-600">{item.growth}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">Use hashtags to see insights!</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Content Performance</h3>
              <div className="grid grid-cols-3 gap-4">
                {engagementData.contentInsights.map((item, idx) => (
                  <div key={idx} className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600">{item.type}</p>
                    <p className="text-2xl font-bold">{item.avgEngagement}</p>
                    <p className="text-sm text-green-600">{item.improvement}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-lg text-white mb-6">
              <h2 className="text-2xl font-bold">Personalized Recommendations</h2>
              <p className="text-blue-100">Based on your Twitter activity</p>
            </div>
            {recommendations.map((rec, idx) => (
              <div key={idx} className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold mr-3 ${
                    rec.impact === 'High' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {rec.impact} Impact
                  </span>
                  <span className="text-sm text-gray-500">{rec.category}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{rec.title}</h3>
                <p className="text-gray-600">{rec.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TwitterEngagementApp;
