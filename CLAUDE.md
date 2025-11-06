# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two Chrome extensions that integrate with Google's Gemini API:

1. **Gemini Assistant** (`chrome-extension/`) - Analyzes web content, identifies arguments and fallacies, creates "steel man" counter-arguments
2. **LinkedIn Intro Agent** (`linkedin-intro-agent/`) - Generates hyper-personalized introduction requests by recursively analyzing LinkedIn profiles

---

## Extension 1: Gemini Assistant (`chrome-extension/`)

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

---

## Extension 2: LinkedIn Intro Agent (`linkedin-intro-agent/`)

### Overview

The LinkedIn Intro Agent is a specialized Chrome extension designed for use with the BairesDev referrals portal. It generates hyper-personalized introduction request emails by:
1. Recursively scraping LinkedIn profiles (handler + prospect)
2. Exploring linked entities (companies, schools) multiple layers deep
3. Intelligently discovering nuanced connections
4. Using Gemini AI to craft personalized introduction requests

### Core Components

1. **Popup Interface** (`popup.html`, `popup.js`, `styles.css`)
   - Auto-detects LinkedIn URLs from BairesDev portal page
   - Manual URL input for handler and prospect profiles
   - Exploration depth selector (1-3 levels)
   - Real-time progress tracking during scraping
   - Editable email output with copy/regenerate options

2. **LinkedIn Content Extractor** (`content.js`)
   - Detects LinkedIn page type (profile, company, school)
   - Extracts structured data:
     - **Profiles**: name, headline, location, about, experience, education, skills, activity
     - **Companies**: name, industry, size, headquarters, about
     - **Schools**: name, location, about
   - Returns JSON instead of plain text
   - Preserves linked URLs for recursive exploration

3. **Recursive Explorer** (`linkedinRecursive.js`)
   - Implements breadth-first search through LinkedIn pages
   - Configurable exploration depth (default: 2)
   - Intelligent URL queueing (prioritizes companies/schools)
   - Rate limiting (2.5 seconds between requests)
   - Profile caching (24-hour TTL in chrome.storage.local)
   - Connection analysis algorithms:
     - Shared companies (with temporal overlap detection)
     - Shared education (alumni matching)
     - Geographic proximity
     - Shared skills and industries
     - Career trajectory similarity
   - Connection strength ranking (0-100 scale)

4. **Background Service Worker** (`background.js`)
   - Handles Gemini API calls for email generation
   - Specialized system prompt for intro emails:
     - Prioritizes meaningful connections
     - Emphasizes recent/current overlaps
     - Authentic, conversational tone
     - Concise format (2-3 paragraphs)
   - Temperature: 0.7 for generation, 0.9 for regeneration
   - maxOutputTokens: 1024

5. **Page Detector** (`pageDetector.js`)
   - Content script running on BairesDev portal
   - Auto-detects LinkedIn URLs from page
   - Extracts associated names from table context
   - Stores detected profiles in chrome.storage.local
   - Monitors DOM changes for SPA support

6. **Configuration** (`config.js`)
   - Same Gemini API key as main extension
   - Uses `gemini-2.5-pro` model

### Key Technical Details

- **Manifest V3** with service worker architecture
- **Domain Restrictions**:
  - Only active on `handlers-referralsportal.bairesdev.com`
  - Requires LinkedIn permissions for scraping
- **Permissions Required**:
  - `storage` for profile caching
  - `scripting` and `tabs` for LinkedIn extraction
  - Host permissions for BairesDev portal, LinkedIn, and Gemini API
- **Recursive Scraping Logic**:
  - Starts with 2 main profiles (handler + prospect)
  - Depth 1: Just the profiles
  - Depth 2: + current companies + latest school
  - Depth 3: + all past companies + all schools
  - Max 20 pages total to prevent excessive scraping
  - Tracks visited URLs to avoid infinite loops
- **Anti-Detection Measures**:
  - 2.5-second delays between LinkedIn requests
  - User must be logged into LinkedIn (uses their session)
  - Respects LinkedIn's client-side data structure
  - Caching to minimize repeated requests

### Workflow

1. User navigates to BairesDev referrals portal (intro page for a handler)
2. Page detector automatically extracts LinkedIn URLs from table
3. User clicks extension icon
4. Extension displays detected profiles, auto-fills handler and prospect URLs
5. User selects exploration depth and clicks "Generate Intro Email"
6. Extension:
   - Opens handler's LinkedIn profile in background tab
   - Extracts profile data + linked entities (companies, schools)
   - Queues linked entities for next depth level
   - Repeats for prospect's LinkedIn
   - Visits queued entities up to depth limit
   - Analyzes all data to find connections
   - Ranks connections by strength
   - Sends comprehensive context to Gemini
7. Gemini generates personalized introduction email
8. User can edit, copy, or regenerate email

### Connection Analysis

The explorer identifies and ranks these connection types:

1. **Shared Company** (60-100 strength)
   - Current colleagues at same company (+20 boost)
   - Past colleagues with overlapping tenure (+30 boost)
   - Includes job titles and time periods

2. **Shared Education** (70 strength)
   - Alumni from same school
   - Includes degree and graduation dates

3. **Shared Location** (40 strength)
   - Based in same geographic area
   - Fuzzy matching for variations

4. **Shared Skills** (30 strength)
   - Common professional skills
   - Top 5 displayed

5. **Similar Industry** (50 strength)
   - Experience in same niche industry
   - Extracted from job titles and company names

### Development Commands

#### Loading the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `linkedin-intro-agent` folder

#### Reloading After Changes
- Click the refresh icon on the extension card
- Note: Background service worker automatically reloads
- Content scripts require page refresh on BairesDev portal

#### Debugging
- **Popup**: Right-click extension icon → "Inspect"
- **Background worker**: Click "Inspect views: service worker" in extension card
- **Page detector**: Open DevTools on BairesDev portal, check console
- **LinkedIn scraping**: Background worker logs show scraping progress

### Common Modifications

#### Changing Exploration Depth Limits
Edit `linkedin-intro-agent/linkedinRecursive.js` line 6-7:
```javascript
this.maxDepth = options.maxDepth || 2;
this.maxPages = options.maxPages || 20;
```

#### Adjusting Rate Limiting
Edit `linkedin-intro-agent/linkedinRecursive.js` line 8:
```javascript
this.requestDelay = options.requestDelay || 2500; // milliseconds
```

#### Modifying Connection Weights
Edit connection strength calculations in `linkedinRecursive.js`:
- `calculateOverlapStrength()` - for shared company overlaps
- `findConnections()` - for base strength values

#### Customizing Gemini Prompt
Edit `linkedin-intro-agent/background.js`:
- System prompt starts at line 19
- User prompt builder starts at line 80

#### Changing Cache TTL
Edit `linkedin-intro-agent/linkedinRecursive.js` line 232:
```javascript
const ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
```

### Limitations & Considerations

1. **LinkedIn Rate Limiting**: LinkedIn actively blocks bots. The extension:
   - Uses 2.5-second delays to appear human
   - Requires user to be logged in
   - May be rate-limited if used excessively

2. **Data Availability**: Can only access data visible to logged-in user:
   - Some profiles are private
   - Connection lists often hidden
   - Activity feed may be limited

3. **Performance**: Recursive scraping takes time:
   - Depth 1: ~10-15 seconds
   - Depth 2: ~30-60 seconds
   - Depth 3: ~1-2 minutes

4. **LinkedIn ToS**: This extension is for personal, legitimate business use. Bulk scraping or automated data collection may violate LinkedIn's Terms of Service.

5. **Gemini API Costs**: Each email generation uses tokens:
   - Input: ~2000-5000 tokens (profile data + connections)
   - Output: up to 1024 tokens
   - Consider costs for heavy usage