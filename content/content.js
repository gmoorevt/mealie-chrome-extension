/**
 * Content script for Mealie Recipe Importer
 *
 * This script runs in the context of web pages and can extract
 * page content for recipe parsing.
 */

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHTML') {
    // Return the full HTML of the page
    sendResponse({
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title
    });
    return true;
  }

  if (request.action === 'getRecipeData') {
    // Try to extract structured recipe data from the page
    const recipeData = extractRecipeData();
    sendResponse(recipeData);
    return true;
  }

  if (request.action === 'ping') {
    // Simple ping to check if content script is loaded
    sendResponse({ status: 'ok' });
    return true;
  }
});

/**
 * Extract structured recipe data from the page using JSON-LD or microdata
 */
function extractRecipeData() {
  // Try to find JSON-LD recipe data
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);

      // Handle array of objects
      if (Array.isArray(data)) {
        const recipe = data.find(item => item['@type'] === 'Recipe');
        if (recipe) {
          return { found: true, type: 'json-ld', data: recipe };
        }
      }

      // Handle single object
      if (data['@type'] === 'Recipe') {
        return { found: true, type: 'json-ld', data: data };
      }

      // Handle @graph structure
      if (data['@graph']) {
        const recipe = data['@graph'].find(item => item['@type'] === 'Recipe');
        if (recipe) {
          return { found: true, type: 'json-ld', data: recipe };
        }
      }
    } catch (e) {
      // Continue to next script if parsing fails
      console.debug('Failed to parse JSON-LD:', e);
    }
  }

  // Try to find microdata
  const recipeElement = document.querySelector('[itemtype*="schema.org/Recipe"]');
  if (recipeElement) {
    return {
      found: true,
      type: 'microdata',
      data: extractMicrodata(recipeElement)
    };
  }

  return { found: false };
}

/**
 * Extract microdata from a recipe element
 */
function extractMicrodata(element) {
  const data = {};

  const props = element.querySelectorAll('[itemprop]');
  for (const prop of props) {
    const name = prop.getAttribute('itemprop');
    let value;

    if (prop.hasAttribute('content')) {
      value = prop.getAttribute('content');
    } else if (prop.hasAttribute('datetime')) {
      value = prop.getAttribute('datetime');
    } else if (prop.tagName === 'IMG') {
      value = prop.src;
    } else if (prop.tagName === 'A') {
      value = prop.href;
    } else {
      value = prop.textContent.trim();
    }

    // Handle multiple values (like ingredients)
    if (data[name]) {
      if (Array.isArray(data[name])) {
        data[name].push(value);
      } else {
        data[name] = [data[name], value];
      }
    } else {
      data[name] = value;
    }
  }

  return data;
}

// Log that content script is loaded (for debugging)
console.debug('Mealie Recipe Importer content script loaded');
