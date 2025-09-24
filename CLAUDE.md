# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension that integrates with Google's Gemini API to analyze web content. The extension specializes in critical analysis of articles, identifying arguments, fallacies, and creating "steel man" counter-arguments.

## Architecture

### Core Components

1. **Popup Interface** (`popup.html`, `popup.js`, `styles.css`)
   - Two-stage content capture system:
     - Stage 1: "Capture Page" - Scrapes current tab using content.js
     - Stage 2: "Capture Linked Pages" - Deep scrapes linked URLs and inserts content inline
   - Domain exclusion field for filtering during deep scrape
   - System and user prompt fields for Gemini API interaction

2. **Content Extraction** (`content.js`)
   - Extracts all visible text from web pages
   - Preserves link structure as `[text|url]` format
   - Filters out scripts, styles, and hidden elements
   - Returns as IIFE for injection via chrome.scripting.executeScript

3. **Background Service Worker** (`background.js`)
   - Handles Gemini API calls using fetch
   - Uses importScripts to load config.js
   - Processes messages from popup with system/user prompts
   - Returns Gemini responses to popup

4. **Configuration** (`config.js`)
   - Contains Gemini API key and endpoint
   - Currently using `gemini-2.5-pro` model
   - 4096 maxOutputTokens configured in background.js

### Key Technical Details

- **Manifest V3** with service worker architecture
- **Permissions Required**:
  - `scripting` and `tabs` for content injection
  - `<all_urls>` host permission for deep scraping any website
  - `activeTab` for current tab access
- **Deep Scraping Logic**:
  - Extracts URLs from textarea content (not stored variable)
  - Opens each URL in background tab
  - Waits for tab 'complete' status + 1 second for dynamic content
  - Replaces `[text|url]` patterns with inline content insertions

## Development Commands

### Loading the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

### Reloading After Changes
- Click the refresh icon on the extension card in `chrome://extensions/`
- Or use Ctrl+R/Cmd+R on the extensions page

### Debugging
- Open DevTools on any webpage to see console logs from content scripts
- Click "Inspect views: service worker" in extension card for background script logs
- Right-click extension popup and "Inspect" for popup debugging

## Common Modifications

### Changing Gemini Model
Edit `chrome-extension/config.js`:
- Change model in URL from `gemini-2.5-pro` to desired model

### Adjusting Output Length
Edit `chrome-extension/background.js` line 38:
- Modify `maxOutputTokens` value (currently 4096)

### Modifying Default System Prompt
Edit both locations:
1. `chrome-extension/popup.html` - textarea default value
2. `chrome-extension/popup.js` - fallback in sendMessage call

### Adding/Removing Permissions
Edit `chrome-extension/manifest.json`:
- Add to `permissions` array for Chrome APIs
- Add to `host_permissions` for website access