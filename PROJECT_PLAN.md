# Mealie Recipe Import Chrome Extension - Project Plan

## Overview
A Chrome extension that allows users to quickly import recipes from any website into their self-hosted Mealie instance at `https://cook.120spleasant.com/`.

## Features

### 1. Simple Import (URL-based)
- Click extension icon or use keyboard shortcut
- Sends current page URL to Mealie's `/api/recipes/create/url` endpoint
- Mealie server fetches and parses the recipe

### 2. Local Parse (HTML-based)
- Extracts the current page's HTML content
- Sends HTML to Mealie's `/api/recipes/create/html-or-json` endpoint
- Useful when URL import fails or for pages behind authentication

---

## Technical Architecture

### Extension Components

```
mealie-import-extension/
├── manifest.json           # Extension manifest (v3)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styling
│   └── options.js         # Settings logic
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   └── content.js         # Content script for HTML extraction
├── lib/
│   └── mealie-api.js      # Mealie API wrapper
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Implementation Plan

### Phase 1: Project Setup & Configuration

#### 1.1 Create Manifest (manifest.json)
```json
{
  "manifest_version": 3,
  "name": "Mealie Recipe Importer",
  "version": "1.0.0",
  "description": "Import recipes to your Mealie instance with one click",
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "https://cook.120spleasant.com/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_page": "options/options.html",
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

#### 1.2 Settings/Configuration
Store in Chrome's `storage.sync`:
- `mealieUrl`: Base URL of Mealie instance (default: `https://cook.120spleasant.com`)
- `apiToken`: Long-lived API token from Mealie
- `groupSlug`: User's group slug (for direct links)
- `defaultIncludeTags`: Whether to include tags by default

---

### Phase 2: Authentication Setup

#### 2.1 API Token Generation
Users will need to generate an API token in Mealie:
1. Log into Mealie → User Settings → API Tokens
2. Create a new long-lived token
3. Copy token to extension settings

#### 2.2 Token Storage
- Store token securely in `chrome.storage.sync`
- Token used in `Authorization: Bearer <token>` header

#### 2.3 Mealie API Endpoints Used

| Feature | Endpoint | Method | Purpose |
|---------|----------|--------|---------|
| Simple Import | `/api/recipes/create/url` | POST | Import recipe from URL |
| Local Parse | `/api/recipes/create/html-or-json` | POST | Parse HTML content |
| Test Connection | `/api/users/self` | GET | Verify token is valid |
| Test Scrape | `/api/recipes/test-scrape-url` | POST | Preview without saving |

---

### Phase 3: Popup UI Implementation

#### 3.1 Popup Interface Design
```
┌─────────────────────────────────┐
│  🍽️ Mealie Import              │
├─────────────────────────────────┤
│                                 │
│  Current Page:                  │
│  [recipe-website.com/pasta]     │
│                                 │
│  ┌─────────────────────────────┐│
│  │  🔗 Simple Import (URL)     ││
│  │  Let Mealie fetch the page  ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │  📄 Local Parse (HTML)      ││
│  │  Send page content directly ││
│  └─────────────────────────────┘│
│                                 │
│  ☐ Include tags                 │
│                                 │
├─────────────────────────────────┤
│  [Status messages here]         │
│                                 │
│  ⚙️ Settings                    │
└─────────────────────────────────┘
```

#### 3.2 Popup States
1. **Ready**: Buttons enabled, waiting for user action
2. **Loading**: Show spinner, disable buttons
3. **Success**: Show success message with link to recipe
4. **Error**: Show error message with retry option

---

### Phase 4: Core Functionality

#### 4.1 Simple Import (URL-based)
```javascript
async function simpleImport(url, includeTags = false) {
  const response = await fetch(`${mealieUrl}/api/recipes/create/url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
      include_tags: includeTags
    })
  });

  if (!response.ok) throw new Error('Import failed');

  const slug = await response.text();
  return slug.replace(/"/g, ''); // Remove quotes from response
}
```

#### 4.2 Local Parse (HTML-based)
```javascript
// Content script to extract HTML
function extractPageHTML() {
  return document.documentElement.outerHTML;
}

// Background/popup script to send to Mealie
async function localParse(html) {
  const response = await fetch(`${mealieUrl}/api/recipes/create/html-or-json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      html: html
    })
  });

  if (!response.ok) throw new Error('Parse failed');
  return await response.json();
}
```

#### 4.3 Content Script Integration
```javascript
// content.js - Injected into active tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHTML') {
    sendResponse({ html: document.documentElement.outerHTML });
  }
  return true;
});
```

---

### Phase 5: Options Page

#### 5.1 Settings Interface
- Mealie Instance URL input
- API Token input (password field with show/hide)
- Group Slug input
- "Test Connection" button
- Default settings toggles

#### 5.2 Validation
- Test API connection on save
- Validate URL format
- Show connection status

---

### Phase 6: Error Handling & Edge Cases

#### 6.1 Error Scenarios
| Error | Cause | User Message |
|-------|-------|--------------|
| 401 | Invalid/expired token | "Authentication failed. Please check your API token in settings." |
| 400 | Invalid URL/HTML | "Could not parse recipe from this page. Try the other import method." |
| Network Error | Mealie unreachable | "Cannot connect to Mealie. Check your instance URL and network." |
| No recipe found | Page has no recipe data | "No recipe data found on this page." |

#### 6.2 Fallback Strategy
1. Try Simple Import first
2. If fails, suggest Local Parse
3. Show helpful error messages

---

### Phase 7: Polish & UX

#### 7.1 Visual Feedback
- Loading spinners during API calls
- Success animations
- Clear error states with actionable messages

#### 7.2 Success Actions
- Show link to imported recipe
- Option to open recipe in new tab
- Badge notification on extension icon

#### 7.3 Keyboard Shortcuts
- Consider adding keyboard shortcut for quick import

---

## API Reference Summary

### Authentication
All requests require header:
```
Authorization: Bearer <api_token>
```

### Simple Import
```http
POST /api/recipes/create/url
Content-Type: application/json

{
  "url": "https://example.com/recipe",
  "include_tags": false
}

Response: "recipe-slug"
```

### Local Parse (HTML)
```http
POST /api/recipes/create/html-or-json
Content-Type: application/json

{
  "html": "<html>...</html>"
}

Response: { recipe object }
```

### Test Connection
```http
GET /api/users/self
Authorization: Bearer <token>

Response: { user object }
```

---

## Development Steps

### Step 1: Initial Setup
- [ ] Create directory structure
- [ ] Create manifest.json
- [ ] Create placeholder icons

### Step 2: Options Page
- [ ] Build settings UI
- [ ] Implement storage save/load
- [ ] Add connection test functionality

### Step 3: Popup UI
- [ ] Create popup HTML/CSS
- [ ] Display current page URL
- [ ] Add import buttons

### Step 4: API Integration
- [ ] Create mealie-api.js wrapper
- [ ] Implement simple import
- [ ] Implement local parse

### Step 5: Content Script
- [ ] Create content script for HTML extraction
- [ ] Set up message passing

### Step 6: Testing
- [ ] Test on various recipe sites
- [ ] Test error handling
- [ ] Test with actual Mealie instance

### Step 7: Polish
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Add success feedback

---

## Security Considerations

1. **Token Storage**: API token stored in `chrome.storage.sync` (encrypted by Chrome)
2. **HTTPS Only**: Only communicate with Mealie over HTTPS
3. **Minimal Permissions**: Only request necessary permissions
4. **No External Services**: All communication is directly with user's Mealie instance

---

## Future Enhancements

1. **Bulk Import**: Import multiple recipes from a page listing recipes
2. **Recipe Preview**: Show parsed recipe before importing
3. **Category/Tag Selection**: Choose categories/tags before import
4. **Offline Queue**: Queue imports when offline
5. **Context Menu**: Right-click menu option to import
6. **Browser Support**: Firefox/Edge versions

---

## Getting Started

To begin implementation:

1. Create the extension directory structure
2. Start with the manifest and options page (to configure the connection)
3. Build the popup UI
4. Implement the API calls
5. Add the content script for HTML extraction
6. Test thoroughly with your Mealie instance

Would you like me to start implementing any of these components?
