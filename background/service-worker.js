/**
 * Background service worker for Mealie Recipe Importer
 *
 * Handles background tasks, context menus, and keyboard shortcuts
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.set({
      mealieUrl: 'https://cook.120spleasant.com',
      apiToken: '',
      groupSlug: 'home',
      includeTags: false
    });

    // Open options page for initial configuration
    chrome.runtime.openOptionsPage();
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'importFromUrl') {
    handleImportFromUrl(request.url, request.includeTags)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'importFromHtml') {
    handleImportFromHtml(request.html)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get({
      mealieUrl: '',
      apiToken: '',
      groupSlug: 'home',
      includeTags: false
    }).then(settings => sendResponse(settings));
    return true;
  }
});

/**
 * Import a recipe from URL
 */
async function handleImportFromUrl(url, includeTags = false) {
  const settings = await chrome.storage.sync.get(['mealieUrl', 'apiToken', 'groupSlug']);

  if (!settings.mealieUrl || !settings.apiToken) {
    throw new Error('Mealie not configured');
  }

  const response = await fetch(`${settings.mealieUrl}/api/recipes/create/url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
      include_tags: includeTags
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Import failed: ${response.status} - ${errorText}`);
  }

  const slug = await response.text();
  return {
    slug: slug.replace(/"/g, ''),
    recipeUrl: `${settings.mealieUrl}/g/${settings.groupSlug}/r/${slug.replace(/"/g, '')}`
  };
}

/**
 * Import a recipe from HTML content
 */
async function handleImportFromHtml(html) {
  const settings = await chrome.storage.sync.get(['mealieUrl', 'apiToken', 'groupSlug']);

  if (!settings.mealieUrl || !settings.apiToken) {
    throw new Error('Mealie not configured');
  }

  const response = await fetch(`${settings.mealieUrl}/api/recipes/create/html-or-json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      html: html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Parse failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const slug = typeof result === 'string' ? result : result.slug;

  return {
    slug: slug,
    recipeUrl: `${settings.mealieUrl}/g/${settings.groupSlug}/r/${slug}`
  };
}

/**
 * Update badge to show status
 */
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: color });

  // Clear badge after 3 seconds
  if (text) {
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 3000);
  }
}

// Log that service worker is running
console.log('Mealie Recipe Importer service worker started');
