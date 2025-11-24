/**
 * Mealie API wrapper for Chrome extension
 */

class MealieAPI {
  constructor(baseUrl, apiToken) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
  }

  /**
   * Get default headers for API requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Make an API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = new Error(`API request failed: ${response.status}`);
      error.status = response.status;
      error.statusText = response.statusText;

      try {
        error.body = await response.json();
      } catch {
        error.body = await response.text();
      }

      throw error;
    }

    // Handle different response types
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Test the API connection by getting current user info
   */
  async testConnection() {
    return this.request('/api/users/self');
  }

  /**
   * Import a recipe from a URL (Simple Import)
   * Mealie will fetch and parse the recipe from the URL
   *
   * @param {string} url - The URL of the recipe to import
   * @param {boolean} includeTags - Whether to include tags
   * @returns {Promise<string>} - The slug of the created recipe
   */
  async importFromUrl(url, includeTags = false) {
    const result = await this.request('/api/recipes/create/url', {
      method: 'POST',
      body: JSON.stringify({
        url: url,
        include_tags: includeTags
      })
    });

    // Response is the recipe slug as a string (possibly with quotes)
    return typeof result === 'string' ? result.replace(/"/g, '') : result;
  }

  /**
   * Import a recipe from HTML content (Local Parse)
   * Send the HTML directly to Mealie for parsing
   *
   * @param {string} html - The HTML content of the recipe page
   * @returns {Promise<object>} - The created recipe object
   */
  async importFromHtml(html) {
    return this.request('/api/recipes/create/html-or-json', {
      method: 'POST',
      body: JSON.stringify({
        html: html
      })
    });
  }

  /**
   * Import a recipe from JSON-LD data
   * Send the JSON-LD recipe object directly to Mealie
   *
   * @param {object} jsonLdData - The JSON-LD recipe object (schema.org/Recipe)
   * @returns {Promise<object>} - The created recipe object
   */
  async importFromJson(jsonLdData) {
    // The API expects a JSON string, not an object
    const jsonString = typeof jsonLdData === 'string'
      ? jsonLdData
      : JSON.stringify(jsonLdData);

    return this.request('/api/recipes/create/html-or-json', {
      method: 'POST',
      body: JSON.stringify({
        data: jsonString
      })
    });
  }

  /**
   * Test scraping a URL without saving
   *
   * @param {string} url - The URL to test
   * @returns {Promise<object>} - The scraped recipe data
   */
  async testScrapeUrl(url) {
    return this.request('/api/recipes/test-scrape-url', {
      method: 'POST',
      body: JSON.stringify({
        url: url
      })
    });
  }

  /**
   * Get the full URL to view a recipe
   *
   * @param {string} slug - The recipe slug
   * @param {string} groupSlug - The group slug
   * @returns {string} - The full URL to the recipe
   */
  getRecipeUrl(slug, groupSlug = 'home') {
    return `${this.baseUrl}/g/${groupSlug}/r/${slug}`;
  }
}

/**
 * Create a MealieAPI instance from Chrome storage settings
 */
async function createMealieAPIFromStorage() {
  const settings = await chrome.storage.sync.get({
    mealieUrl: '',
    apiToken: '',
    groupSlug: 'home',
    includeTags: false
  });

  if (!settings.mealieUrl || !settings.apiToken) {
    throw new Error('Mealie not configured. Please set up your connection in the extension options.');
  }

  return {
    api: new MealieAPI(settings.mealieUrl, settings.apiToken),
    settings: settings
  };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MealieAPI, createMealieAPIFromStorage };
}
