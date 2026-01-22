// Extract tweets from Twitter page
function extractTweets() {
  const tweets = [];
  
  // Find all tweet elements
  document.querySelectorAll('article[data-testid="tweet"]').forEach(tweetEl => {
    try {
      const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
      const text = textEl ? textEl.innerText : '';
      
      // Extract metrics
      const likeEl = tweetEl.querySelector('[data-testid="like"]');
      const retweetEl = tweetEl.querySelector('[data-testid="retweet"]');
      const replyEl = tweetEl.querySelector('[data-testid="reply"]');
      
      const likes = likeEl ? parseInt(likeEl.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0') : 0;
      const retweets = retweetEl ? parseInt(retweetEl.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0') : 0;
      const replies = replyEl ? parseInt(replyEl.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0') : 0;
      
      // Extract timestamp
      const timeEl = tweetEl.querySelector('time');
      const timestamp = timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString();
      
      tweets.push({
        text,
        created_at: timestamp,
        public_metrics: {
          like_count: likes,
          retweet_count: retweets,
          reply_count: replies
        }
      });
    } catch (err) {
      console.error('Error extracting tweet:', err);
    }
  });
  
  return tweets;
}

// Listen for extraction request
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    const tweets = extractTweets();
    sendResponse({ tweets, count: tweets.length });
  }
  return true;
});