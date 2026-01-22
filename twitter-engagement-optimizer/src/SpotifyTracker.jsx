import React, { useState, useEffect } from 'react';
import { Music, TrendingUp, BarChart3, Plus, X, ExternalLink } from 'lucide-react';

const SpotifyTracker = ({ userId }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    tweetUrl: '',
    spotifyLink: '',
    trackName: '',
    baselineStreams: '',
    tweetDate: new Date().toISOString().split('T')[0]
  });

  // Load campaigns from storage
  useEffect(() => {
    if (userId) {
      loadCampaigns();
    }
  }, [userId]);

  const loadCampaigns = async () => {
    try {
      const result = await window.storage.get(`spotify_campaigns_${userId}`);
      if (result && result.value) {
        setCampaigns(JSON.parse(result.value));
      }
    } catch (err) {
      console.log('No existing campaigns');
    }
  };

  const saveCampaigns = async (updatedCampaigns) => {
    try {
      await window.storage.set(
        `spotify_campaigns_${userId}`,
        JSON.stringify(updatedCampaigns)
      );
      setCampaigns(updatedCampaigns);
    } catch (err) {
      console.error('Error saving campaigns:', err);
      alert('Failed to save campaign');
    }
  };

  const addCampaign = async () => {
    if (!newCampaign.tweetUrl || !newCampaign.spotifyLink || !newCampaign.trackName) {
      alert('Please fill in all required fields');
      return;
    }

    const campaign = {
      id: Date.now().toString(),
      ...newCampaign,
      baselineStreams: parseInt(newCampaign.baselineStreams) || 0,
      metrics: {
        tweetViews: 0,
        tweetLikes: 0,
        tweetRetweets: 0,
        linkClicks: 0,
        currentStreams: 0,
        attributedStreams: 0,
        conversionRate: 0
      },
      updates: [],
      createdAt: new Date().toISOString()
    };

    const updated = [campaign, ...campaigns];
    await saveCampaigns(updated);
    
    setNewCampaign({
      tweetUrl: '',
      spotifyLink: '',
      trackName: '',
      baselineStreams: '',
      tweetDate: new Date().toISOString().split('T')[0]
    });
    setShowAddForm(false);
  };

  const updateMetrics = async (campaignId, metrics) => {
    const updated = campaigns.map(c => {
      if (c.id === campaignId) {
        const attributedStreams = metrics.currentStreams - c.baselineStreams;
        const conversionRate = metrics.linkClicks > 0 
          ? Math.round((attributedStreams / metrics.linkClicks) * 100) 
          : 0;
        
        return {
          ...c,
          metrics: {
            ...metrics,
            attributedStreams: Math.max(0, attributedStreams),
            conversionRate
          },
          updates: [
            ...c.updates,
            { timestamp: new Date().toISOString(), metrics }
          ]
        };
      }
      return c;
    });
    
    await saveCampaigns(updated);
  };

  const deleteCampaign = async (campaignId) => {
    if (confirm('Delete this campaign?')) {
      const updated = campaigns.filter(c => c.id !== campaignId);
      await saveCampaigns(updated);
    }
  };

  const getTotalStats = () => {
    return campaigns.reduce((acc, c) => ({
      totalClicks: acc.totalClicks + (c.metrics.linkClicks || 0),
      totalStreams: acc.totalStreams + (c.metrics.attributedStreams || 0),
      totalViews: acc.totalViews + (c.metrics.tweetViews || 0),
      totalEngagement: acc.totalEngagement + (c.metrics.tweetLikes || 0) + (c.metrics.tweetRetweets || 0)
    }), { totalClicks: 0, totalStreams: 0, totalViews: 0, totalEngagement: 0 });
  };

  const stats = getTotalStats();
  const avgConversion = campaigns.length > 0
    ? Math.round(campaigns.reduce((sum, c) => sum + (c.metrics.conversionRate || 0), 0) / campaigns.length)
    : 0;

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '48px', height: '48px', background: '#1DB954', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music size={24} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Spotify Tracker</h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>Track Twitter → Spotify conversions</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '10px 20px',
            background: '#1DB954',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={20} />
          New Campaign
        </button>
      </div>

      {/* Overall Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <TrendingUp size={20} color="#1d9bf0" />
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>Total Twitter Views</p>
          </div>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#1d9bf0' }}>
            {stats.totalViews.toLocaleString()}
          </p>
        </div>

        <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>Total Link Clicks</p>
          </div>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
            {stats.totalClicks.toLocaleString()}
          </p>
        </div>

        <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Music size={20} color="#f59e0b" />
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>Attributed Streams</p>
          </div>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
            {stats.totalStreams.toLocaleString()}
          </p>
        </div>

        <div style={{ background: '#fce7f3', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <BarChart3 size={20} color="#ec4899" />
            <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>Avg Conversion</p>
          </div>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#ec4899' }}>
            {avgConversion}%
          </p>
        </div>
      </div>

      {/* Add Campaign Form */}
      {showAddForm && (
        <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', marginBottom: '24px', border: '2px dashed #d1d5db' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Create New Campaign</h3>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Track Name *
              </label>
              <input
                type="text"
                value={newCampaign.trackName}
                onChange={(e) => setNewCampaign({ ...newCampaign, trackName: e.target.value })}
                placeholder="My New Single"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Tweet URL *
              </label>
              <input
                type="url"
                value={newCampaign.tweetUrl}
                onChange={(e) => setNewCampaign({ ...newCampaign, tweetUrl: e.target.value })}
                placeholder="https://twitter.com/username/status/123456"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Spotify Link * (Use a trackable link like Bitly)
              </label>
              <input
                type="url"
                value={newCampaign.spotifyLink}
                onChange={(e) => setNewCampaign({ ...newCampaign, spotifyLink: e.target.value })}
                placeholder="https://bit.ly/mytrack-twitter"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Baseline Streams (before tweet)
                </label>
                <input
                  type="number"
                  value={newCampaign.baselineStreams}
                  onChange={(e) => setNewCampaign({ ...newCampaign, baselineStreams: e.target.value })}
                  placeholder="1234"
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Tweet Date
                </label>
                <input
                  type="date"
                  value={newCampaign.tweetDate}
                  onChange={(e) => setNewCampaign({ ...newCampaign, tweetDate: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                onClick={addCampaign}
                style={{ padding: '10px 20px', background: '#1DB954', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          <Music size={64} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>No campaigns yet</h3>
          <p style={{ margin: 0 }}>Create your first campaign to start tracking Twitter → Spotify conversions</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onUpdate={(metrics) => updateMetrics(campaign.id, metrics)}
              onDelete={() => deleteCampaign(campaign.id)}
            />
          ))}
        </div>
      )}

      {/* Tips */}
      {campaigns.length > 0 && (
        <div style={{ marginTop: '24px', padding: '20px', background: '#eff6ff', borderRadius: '8px', borderLeft: '4px solid #1d9bf0' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#1d9bf0' }}>
            💡 Pro Tips
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
            <li>Use Bitly or similar services to create trackable Spotify links</li>
            <li>Update metrics 24-48 hours after posting for accurate results</li>
            <li>Track baseline streams before tweeting to measure true impact</li>
            <li>Best conversion rates typically come from video snippet tweets</li>
            <li>Post on Fridays 5-7 PM for maximum Spotify engagement</li>
          </ul>
        </div>
      )}
    </div>
  );
};

const CampaignCard = ({ campaign, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [metrics, setMetrics] = useState(campaign.metrics);

  const handleSave = () => {
    onUpdate(metrics);
    setIsEditing(false);
  };

  const daysSince = Math.floor((Date.now() - new Date(campaign.createdAt)) / (1000 * 60 * 60 * 24));
  const ctr = metrics.tweetViews > 0 ? ((metrics.linkClicks / metrics.tweetViews) * 100).toFixed(2) : 0;

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', background: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
            {campaign.trackName}
          </h3>
          <div style={{ display: 'flex', gap: '12px', fontSize: '14px', color: '#6b7280', flexWrap: 'wrap' }}>
            <span>📅 {new Date(campaign.tweetDate).toLocaleDateString()}</span>
            <span>•</span>
            <span>{daysSince === 0 ? 'Today' : `${daysSince} days ago`}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href={campaign.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '8px', background: '#f3f4f6', borderRadius: '6px', color: '#1d9bf0', textDecoration: 'none', display: 'flex' }}
          >
            <ExternalLink size={16} />
          </a>
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{ padding: '8px 12px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
          >
            {isEditing ? 'Cancel' : 'Update'}
          </button>
          <button
            onClick={onDelete}
            style={{ padding: '8px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      {isEditing ? (
        <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                Tweet Views
              </label>
              <input
                type="number"
                value={metrics.tweetViews}
                onChange={(e) => setMetrics({ ...metrics, tweetViews: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                Likes
              </label>
              <input
                type="number"
                value={metrics.tweetLikes}
                onChange={(e) => setMetrics({ ...metrics, tweetLikes: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                Retweets
              </label>
              <input
                type="number"
                value={metrics.tweetRetweets}
                onChange={(e) => setMetrics({ ...metrics, tweetRetweets: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                Link Clicks
              </label>
              <input
                type="number"
                value={metrics.linkClicks}
                onChange={(e) => setMetrics({ ...metrics, linkClicks: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#6b7280' }}>
                Current Streams
              </label>
              <input
                type="number"
                value={metrics.currentStreams}
                onChange={(e) => setMetrics({ ...metrics, currentStreams: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            style={{ marginTop: '12px', padding: '8px 16px', background: '#1DB954', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            Save Metrics
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Views</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {metrics.tweetViews.toLocaleString()}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Likes</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {metrics.tweetLikes.toLocaleString()}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>RTs</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {metrics.tweetRetweets.toLocaleString()}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Clicks</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
                {metrics.linkClicks.toLocaleString()}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Streams</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#1DB954' }}>
                +{metrics.attributedStreams.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Performance Metrics */}
          <div style={{ display: 'flex', gap: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>CTR</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{ctr}%</p>
            </div>
            <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '16px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Conversion</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1DB954' }}>
                {metrics.conversionRate}%
              </p>
            </div>
            <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '16px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>Baseline</p>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                {campaign.baselineStreams.toLocaleString()}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SpotifyTracker;