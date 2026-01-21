// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TWEETS_EXTRACTED') {
    // Store in local storage
    chrome.storage.local.set({ 
      tweets: request.tweets,
      extractedAt: new Date().toISOString()
    }, () => {
      console.log('Tweets saved:', request.tweets.length);
    });
  }
});