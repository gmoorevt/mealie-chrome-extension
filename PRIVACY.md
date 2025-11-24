# Privacy Policy for Mealie Recipe Importer

**Last updated: November 24, 2024**

## Overview

Mealie Recipe Importer is a browser extension that helps you import recipes from websites into your self-hosted Mealie instance. This privacy policy explains how we handle your data.

## Data Collection

**We do not collect any personal data.**

This extension:
- Does NOT send any data to our servers (we don't have any)
- Does NOT track your browsing activity
- Does NOT use analytics or telemetry
- Does NOT share any information with third parties

## Data Storage

The extension stores the following data locally in your browser using Chrome's secure storage:

- **Mealie Instance URL**: The URL of your self-hosted Mealie server
- **API Token**: Your Mealie API authentication token
- **Group Slug**: Your Mealie group identifier
- **User Preferences**: Settings like "include tags by default"
- **Domain Preferences**: Which import method works best for sites you've used

This data is stored using `chrome.storage.sync`, which is encrypted by Chrome and synced across your signed-in browsers.

## Data Transmission

When you import a recipe, the extension communicates **only with your self-hosted Mealie instance**:

- Your Mealie URL and API token are sent to your Mealie server for authentication
- Recipe data (URL, HTML, or JSON-LD) is sent to your Mealie server for import

**No data is ever sent to any other server or third party.**

## Permissions

The extension requests the following permissions:

- **activeTab**: To read the current page URL and content for recipe extraction
- **storage**: To save your settings locally
- **scripting**: To extract recipe data from web pages
- **Host permission for your Mealie instance**: To communicate with your server

## Open Source

This extension is open source. You can review all code at:
https://github.com/gmoorevt/mealie-chrome-extension

## Contact

If you have questions about this privacy policy, please open an issue on GitHub:
https://github.com/gmoorevt/mealie-chrome-extension/issues

## Changes

Any changes to this privacy policy will be posted to the GitHub repository.
