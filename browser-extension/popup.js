let extractedData = null;

document.getElementById('extractBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Extracting tweets...';
  
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    
    extractedData = response.tweets;
    
    statusDiv.textContent = `✅ Found ${response.count} tweets!`;
    document.getElementById('sendBtn').disabled = false;
  } catch (err) {
    statusDiv.textContent = '❌ Error: Make sure you\'re on Twitter';
    console.error(err);
  }
});

document.getElementById('sendBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Sending to analytics...';
  
  try {
    // Send to your app
    const response = await fetch('https://verbose-space-invention-7vv49g9xq4qfxwp-3001.app.github.dev/api/upload/extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweets: extractedData })
    });
    
    const result = await response.json();
    
    // Save session key
    await chrome.storage.local.set({ sessionKey: result.sessionKey });
    
    statusDiv.textContent = '✅ Data sent! Opening analytics...';
    
    // Open your app with the session key
    chrome.tabs.create({
      url: `https://verbose-space-invention-7vv49g9xq4qfxwp-5173.app.github.dev?source=extension&session=${result.sessionKey}`
    });
  } catch (err) {
    statusDiv.textContent = '❌ Failed to send data';
    console.error(err);
  }
});//await chrome.storage.local.set({ sessionKey});