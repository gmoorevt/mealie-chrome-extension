// Options page script for Mealie Recipe Importer

const DEFAULT_SETTINGS = {
  mealieUrl: 'https://cook.120spleasant.com',
  apiToken: '',
  groupSlug: 'home',
  includeTags: false
};

// DOM Elements
const form = document.getElementById('settings-form');
const mealieUrlInput = document.getElementById('mealie-url');
const apiTokenInput = document.getElementById('api-token');
const groupSlugInput = document.getElementById('group-slug');
const includeTagsCheckbox = document.getElementById('include-tags');
const toggleTokenBtn = document.getElementById('toggle-token');
const testConnectionBtn = document.getElementById('test-connection');
const saveSettingsBtn = document.getElementById('save-settings');
const statusMessage = document.getElementById('status-message');

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);

// Event listeners
toggleTokenBtn.addEventListener('click', toggleTokenVisibility);
testConnectionBtn.addEventListener('click', testConnection);
form.addEventListener('submit', saveSettings);

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    mealieUrlInput.value = settings.mealieUrl;
    apiTokenInput.value = settings.apiToken;
    groupSlugInput.value = settings.groupSlug;
    includeTagsCheckbox.checked = settings.includeTags;
  } catch (error) {
    showStatus('Failed to load settings', 'error');
    console.error('Failed to load settings:', error);
  }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(event) {
  event.preventDefault();

  const settings = {
    mealieUrl: normalizeUrl(mealieUrlInput.value),
    apiToken: apiTokenInput.value.trim(),
    groupSlug: groupSlugInput.value.trim() || 'home',
    includeTags: includeTagsCheckbox.checked
  };

  // Validate required fields
  if (!settings.mealieUrl) {
    showStatus('Please enter your Mealie instance URL', 'error');
    return;
  }

  if (!settings.apiToken) {
    showStatus('Please enter your API token', 'error');
    return;
  }

  try {
    setButtonLoading(saveSettingsBtn, true);
    await chrome.storage.sync.set(settings);

    // Update the input to show normalized URL
    mealieUrlInput.value = settings.mealieUrl;

    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save settings', 'error');
    console.error('Failed to save settings:', error);
  } finally {
    setButtonLoading(saveSettingsBtn, false);
  }
}

/**
 * Test the connection to Mealie
 */
async function testConnection() {
  const mealieUrl = normalizeUrl(mealieUrlInput.value);
  const apiToken = apiTokenInput.value.trim();

  if (!mealieUrl) {
    showStatus('Please enter your Mealie instance URL', 'error');
    return;
  }

  if (!apiToken) {
    showStatus('Please enter your API token', 'error');
    return;
  }

  try {
    setButtonLoading(testConnectionBtn, true);
    showStatus('Testing connection...', 'info');

    const response = await fetch(`${mealieUrl}/api/users/self`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const user = await response.json();
      const userName = user.fullName || user.username || user.email || 'User';
      showStatus(`Connected successfully! Logged in as: ${userName}`, 'success');
    } else if (response.status === 401) {
      showStatus('Authentication failed. Please check your API token.', 'error');
    } else {
      showStatus(`Connection failed (HTTP ${response.status})`, 'error');
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      showStatus('Cannot connect to Mealie. Check the URL and ensure CORS is enabled.', 'error');
    } else {
      showStatus(`Connection error: ${error.message}`, 'error');
    }
    console.error('Connection test failed:', error);
  } finally {
    setButtonLoading(testConnectionBtn, false);
  }
}

/**
 * Toggle API token visibility
 */
function toggleTokenVisibility() {
  const isPassword = apiTokenInput.type === 'password';
  apiTokenInput.type = isPassword ? 'text' : 'password';
  toggleTokenBtn.querySelector('.icon-eye').textContent = isPassword ? '🙈' : '👁';
}

/**
 * Normalize URL by removing trailing slash
 */
function normalizeUrl(url) {
  url = url.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Show a status message
 */
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle('loading', loading);
}
