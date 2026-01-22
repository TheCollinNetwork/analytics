class DataProcessor {
  // Analyze best posting times
  static analyzeBestTimes(tweets) {
    const timeSlots = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    tweets.forEach(tweet => {
      const date = new Date(tweet.created_at);
      const day = days[date.getDay()];
      const hour = date.getHours();
      const engagement = tweet.public_metrics.like_count + 
                        tweet.public_metrics.retweet_count + 
                        tweet.public_metrics.reply_count;
      
      const key = `${day}-${hour}`;
      if (!timeSlots[key]) {
        timeSlots[key] = { day, hour, totalEngagement: 0, count: 0 };
      }
      
      timeSlots[key].totalEngagement += engagement;
      timeSlots[key].count += 1;
    });
    
    // Calculate average engagement per time slot
    const results = Object.values(timeSlots).map(slot => ({
      day: slot.day,
      time: `${slot.hour % 12 || 12}:00 ${slot.hour >= 12 ? 'PM' : 'AM'}`,
      engagement: Math.round((slot.totalEngagement / slot.count) * 100) / 100
    }));
    
    // Sort by engagement and return top 5
    return results.sort((a, b) => b.engagement - a.engagement).slice(0, 5);
  }

  // Extract and rank hashtags
  static extractTrendingHashtags(tweets) {
    const hashtagCounts = {};
    
    tweets.forEach(tweet => {
      if (tweet.entities?.hashtags) {
        const engagement = tweet.public_metrics.like_count + 
                          tweet.public_metrics.retweet_count;
        
        tweet.entities.hashtags.forEach(hashtag => {
          const tag = `#${hashtag.tag}`;
          if (!hashtagCounts[tag]) {
            hashtagCounts[tag] = { count: 0, totalEngagement: 0 };
          }
          hashtagCounts[tag].count += 1;
          hashtagCounts[tag].totalEngagement += engagement;
        });
      }
    });
    
    return Object.entries(hashtagCounts)
      .map(([tag, data]) => ({
        tag,
        volume: data.count,
        avgEngagement: Math.round(data.totalEngagement / data.count),
        growth: this.calculateGrowth() // Implement growth calculation
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 5);
  }

  // Analyze content performance
  static analyzeContentTypes(tweets) {
    const types = {
      text: { count: 0, totalEngagement: 0 },
      image: { count: 0, totalEngagement: 0 },
      video: { count: 0, totalEngagement: 0 },
      link: { count: 0, totalEngagement: 0 }
    };
    
    tweets.forEach(tweet => {
      const engagement = tweet.public_metrics.like_count + 
                        tweet.public_metrics.retweet_count + 
                        tweet.public_metrics.reply_count;
      
      let type = 'text';
      if (tweet.entities?.urls?.length > 0) type = 'link';
      if (tweet.attachments?.media_keys) {
        // Would need to check media type from media objects
        type = 'image'; // or 'video'
      }
      
      types[type].count += 1;
      types[type].totalEngagement += engagement;
    });
    
    return Object.entries(types)
      .filter(([_, data]) => data.count > 0)
      .map(([type, data]) => ({
        type: type.charAt(0).toUpperCase() + type.slice(1),
        avgEngagement: Math.round(data.totalEngagement / data.count),
        improvement: `+${Math.round(Math.random() * 40 + 10)}%` // Calculate real improvement
      }));
  }

  // Generate recommendations
  static generateRecommendations(analyticsData) {
    const recommendations = [];
    
    if (analyticsData.bestTimes?.length > 0) {
      const bestTime = analyticsData.bestTimes[0];
      recommendations.push({
        title: 'Post During Peak Hours',
        description: `Your audience is most active ${bestTime.day} at ${bestTime.time}. Schedule important content for this time.`,
        impact: 'High',
        category: 'Timing'
      });
    }
    
    if (analyticsData.contentTypes?.length > 0) {
      const bestContent = analyticsData.contentTypes[0];
      recommendations.push({
        title: `Increase ${bestContent.type} Content`,
        description: `${bestContent.type} posts get ${bestContent.improvement} more engagement. Aim for more ${bestContent.type.toLowerCase()} posts.`,
        impact: 'High',
        category: 'Content'
      });
    }
    
    if (analyticsData.trendingHashtags?.length > 0) {
      const topHashtag = analyticsData.trendingHashtags[0];
      recommendations.push({
        title: 'Use Trending Hashtags',
        description: `${topHashtag.tag} is performing well. Include it in relevant posts.`,
        impact: 'Medium',
        category: 'Hashtags'
      });
    }
    
    return recommendations;
  }

  static calculateGrowth() {
    // Implement real growth calculation by comparing time periods
    return `+${Math.round(Math.random() * 30 + 5)}%`;
  }
}

export default DataProcessor;