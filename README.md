# Mealie Recipe Importer - Chrome Extension

A Chrome extension that makes it quick and easy to import recipes from any website into your self-hosted [Mealie](https://mealie.io/) instance.

## Features

- **Smart Import Detection** - Automatically detects recipe data on pages and recommends the best import method
- **Three Import Methods**:
  - **URL Import** - Send the page URL to Mealie for server-side parsing (fastest)
  - **Schema Extraction** - Extract JSON-LD recipe data directly from the page (works for authenticated sites)
  - **HTML Parsing** - Send full page HTML to Mealie (fallback option)
- **Domain Learning** - Remembers which import method works best for each website
- **ATK/Cook's Illustrated Support** - Special extraction for "Why This Recipe Works" and "Before You Begin" sections
- **Tag Support** - Optionally include tags found on the recipe page
- **Debug Tools** - Built-in page analysis for troubleshooting

## Screenshots

*Coming soon*

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the extension folder
6. The extension icon should appear in your toolbar

### First-Time Setup

1. Click the extension icon and then the **Settings** gear icon
2. Enter your Mealie instance URL (e.g., `https://mealie.yourdomain.com`)
3. Generate an API token in Mealie:
   - Log into your Mealie instance
   - Go to **User Settings** → **API Tokens**
   - Click **Create** and give it a name
   - Copy the generated token
4. Paste the API token into the extension settings
5. Click **Test Connection** to verify
6. Click **Save Settings**

## Usage

1. Navigate to any recipe page (AllRecipes, Food Network, Serious Eats, etc.)
2. Click the Mealie extension icon
3. The extension will analyze the page and recommend an import method
4. Click **Import Recipe**
5. Once complete, click **Open Recipe** to view it in Mealie

### Advanced Options

Click **Advanced options** to:
- Manually select an import method (Auto, URL, Schema, HTML)
- Toggle tag inclusion
- Access debug tools for troubleshooting

### Supported Sites

The extension works with most recipe websites that use standard recipe markup. Sites with known optimizations:

| Site | Recommended Method |
|------|-------------------|
| AllRecipes | URL |
| Food Network | URL |
| Serious Eats | URL |
| Budget Bytes | URL |
| America's Test Kitchen* | Schema |
| Cook's Illustrated* | Schema |
| NY Times Cooking* | Schema |
| Bon Appetit | Schema |

*Sites behind paywalls work best with Schema extraction when you're logged in.

## Troubleshooting

### "Authentication failed"
- Check that your API token is correct in settings
- Try generating a new token in Mealie
- Ensure your token hasn't expired

### "Could not parse recipe"
- Try a different import method (if URL fails, try Schema or HTML)
- Use the **Debug Page** button to check if recipe data exists on the page
- The page may not have structured recipe data (schema.org markup)

### "Cannot connect to Mealie"
- Verify your Mealie URL is correct and includes `https://`
- Check that your Mealie instance is accessible from your network
- Ensure there are no firewall/proxy issues

### No recipe detected
- Some sites don't include recipe schema markup
- Try the HTML import method as a fallback
- Use the debug tools to analyze what data is available

## Technical Details

### Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current tab URL and content for recipe extraction |
| `storage` | Save extension settings (URL, API token) |
| `scripting` | Execute content scripts for HTML/schema extraction |
| Host permission | Connect to your Mealie instance API |

### Mealie API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/recipes/create/url` | POST | Import recipe from URL |
| `/api/recipes/create/html-or-json` | POST | Import from HTML or JSON-LD |
| `/api/users/self` | GET | Test API connection |

### File Structure

```
mealie-chrome-extension/
├── manifest.json           # Extension manifest (v3)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup logic & import handling
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styling
│   └── options.js         # Settings logic
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   └── content.js         # Content script for page extraction
├── lib/
│   └── mealie-api.js      # Mealie API wrapper class
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development

### Prerequisites

- Chrome browser
- A running Mealie instance with API access

### Local Development

1. Clone the repository
2. Make changes to the source files
3. Go to `chrome://extensions/`
4. Click the refresh icon on the extension card to reload

### Building Icons

The icons are generated from `icons/icon.svg`. To regenerate PNGs:

```bash
# Using ImageMagick
convert -background none icons/icon.svg -resize 16x16 icons/icon16.png
convert -background none icons/icon.svg -resize 48x48 icons/icon48.png
convert -background none icons/icon.svg -resize 128x128 icons/icon128.png
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mealie](https://mealie.io/) - The excellent self-hosted recipe manager this extension connects to
- Recipe schema extraction inspired by various recipe parsing tools

## Related Projects

- [Mealie](https://github.com/mealie-recipes/mealie) - Self-hosted recipe manager
