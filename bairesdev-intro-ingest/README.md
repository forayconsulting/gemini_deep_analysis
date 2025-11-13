# BairesDev Intro Ingest Extension

A lightweight Chrome extension that scrapes introduction data from the BairesDev referrals portal and sends it to an n8n workflow for storage and processing.

## Overview

This extension is part of a scalable architecture that separates data ingestion (Chrome extension) from data enrichment (n8n workflow):

1. **Chrome Extension** (this extension) - Scrapes intro data from BairesDev portal
2. **n8n Workflow** - Receives data via webhook, stores in native data table
3. **n8n AI Agent + MCP Server** - Separately handles LinkedIn profile scraping and email generation

This architectural approach:
- Removes heavy AI/scraping burden from the browser extension
- Enables scalable, server-side processing with n8n
- Separates concerns between ingestion and enrichment
- Leverages n8n's native data tables for centralized storage

## Use Case

When browsing the BairesDev referrals portal (`https://handlers-referralsportal.bairesdev.com/intros`), users can click "Ingest Intros" to:

1. Scrape all visible introduction rows from the current page (up to 50 rows based on page size)
2. Extract partner and prospect information including:
   - Names
   - LinkedIn profile URLs
   - Company names
   - Company LinkedIn URLs
   - Dynamically constructed "Show All Jobs" LinkedIn URLs for prospect companies
3. Send the data to an n8n webhook with Basic Authentication
4. Store in n8n's native "Partner Intros" data table

## Architecture

### Data Flow

```
┌─────────────────────┐
│  BairesDev Portal   │
│   (Intros Table)    │
└──────────┬──────────┘
           │
           │ User clicks "Ingest Intros"
           │
┌──────────▼──────────┐
│  Chrome Extension   │
│  - Scrapes table    │
│  - Extracts URLs    │
│  - Constructs jobs  │
│    URLs             │
└──────────┬──────────┘
           │
           │ POST with Basic Auth
           │
┌──────────▼──────────┐
│   n8n Webhook       │
│  - Receives data    │
│  - Inserts rows     │
└──────────┬──────────┘
           │
           │
┌──────────▼──────────┐
│  n8n Data Table     │
│  "Partner Intros"   │
│  - 9 string columns │
└─────────────────────┘
           │
           │ Later processed by...
           │
┌──────────▼──────────┐
│  n8n AI Agent +     │
│  MCP Server         │
│  - Scrapes LinkedIn │
│  - Generates emails │
└─────────────────────┘
```

### n8n Data Table Schema

The "Partner Intros" data table has 9 string columns:

| Column Name              | Type   | Description                                    |
|-------------------------|--------|------------------------------------------------|
| `partnerName`           | string | Partner's full name                            |
| `partnerProfile`        | string | Partner's LinkedIn profile URL                 |
| `partnerCompany`        | string | Partner's company name                         |
| `partnerCompanyProfile` | string | Partner's company LinkedIn URL                 |
| `prospectName`          | string | Prospect's full name                           |
| `prospectProfile`       | string | Prospect's LinkedIn profile URL                |
| `prospectCompany`       | string | Prospect's company name                        |
| `prospectCompanyProfile`| string | Prospect's company LinkedIn URL                |
| `prospectCompanyJobs`   | string | Dynamically constructed LinkedIn jobs URL      |

### Webhook Configuration

- **Endpoint**: `https://bairesdevsales.app.n8n.cloud/webhook/249ae115-73e4-4782-b730-a9ba84352db6`
- **Method**: POST
- **Authentication**: Basic Auth
  - Username: `bairesdev`
  - Password: `n8nification`
- **Content-Type**: `application/json`
- **Payload**: Array of intro objects matching the data table schema

## Key Features

### 1. Table Scraping

The extension injects a content script into the BairesDev referrals portal page that:

- Locates the intros table in the DOM
- Iterates through all visible rows
- Extracts text content and LinkedIn URLs
- Handles cases where LinkedIn links may be missing

### 2. LinkedIn Jobs URL Construction

For each prospect company, the extension:

1. Opens the company's LinkedIn page in a background tab
2. Extracts the numeric company ID using three fallback methods:
   - URL pattern match: `/company/(\d+)/`
   - Page source URN patterns: `urn:li:fsd_company:(\d+)`, `urn:li:fs_company:(\d+)`, `urn:li:organization:(\d+)`
   - Existing "Show All Jobs" link: `f_C=(\d+)`
3. Constructs the jobs search URL: `https://www.linkedin.com/jobs/search/?f_C={companyId}&start=0`
4. Includes in the payload as `prospectCompanyJobs`

This logic is borrowed from the existing `linkedin-intro-agent` extension's `extractCompanyId()` function.

### 3. Webhook Integration

The extension sends data to n8n using:

```javascript
const response = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + btoa('bairesdev:n8nification')
  },
  body: JSON.stringify(introsArray)
});
```

n8n receives the array and inserts each intro as a new row in the data table (no upsert logic - n8n auto-generates unique IDs).

## Files

- **manifest.json** - Chrome extension manifest (Manifest V3)
- **popup.html** - Simple modal UI with "Ingest Intros" button
- **popup.js** - Coordinates scraping and webhook POST
- **content.js** - Scrapes BairesDev table + constructs jobs URLs
- **config.js** - Stores webhook URL and Basic Auth credentials (gitignored)
- **config.example.js** - Template for config.js
- **styles.css** - Minimal popup styling
- **.gitignore** - Excludes config.js

## Installation

1. Clone this repository
2. Copy `config.example.js` to `config.js`
3. Update `config.js` with your n8n webhook URL and credentials
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" (top right)
6. Click "Load unpacked"
7. Select the `bairesdev-intro-ingest` folder

## Usage

1. Navigate to the BairesDev referrals portal intros page
2. Click the extension icon in the Chrome toolbar
3. Click the "Ingest Intros" button
4. Wait for the extension to scrape the table and construct jobs URLs
5. View success/error feedback in the popup
6. Check your n8n data table to verify rows were inserted

## Development

### Reloading After Changes

- Click the refresh icon on the extension card in `chrome://extensions/`
- Or use Ctrl+R/Cmd+R on the extensions page

### Debugging

- **Popup**: Right-click extension icon → "Inspect"
- **Content script**: Open DevTools on BairesDev portal, check console
- **Network requests**: Use Chrome DevTools Network tab to inspect webhook POSTs

### Testing Webhook

You can test the webhook directly using curl:

```bash
curl -X POST https://bairesdevsales.app.n8n.cloud/webhook/249ae115-73e4-4782-b730-a9ba84352db6 \
  -H "Content-Type: application/json" \
  -u "bairesdev:n8nification" \
  -d '[{
    "partnerName": "Test Partner",
    "partnerProfile": "https://linkedin.com/in/testpartner",
    "partnerCompany": "Test Company",
    "partnerCompanyProfile": "https://linkedin.com/company/testcompany",
    "prospectName": "Test Prospect",
    "prospectProfile": "https://linkedin.com/in/testprospect",
    "prospectCompany": "Prospect Company",
    "prospectCompanyProfile": "https://linkedin.com/company/prospectco",
    "prospectCompanyJobs": "https://linkedin.com/jobs/search/?f_C=12345&start=0"
  }]'
```

## Limitations & Considerations

1. **Page Scope**: Only scrapes visible rows on the current page (respects pagination)
2. **Rate Limiting**: LinkedIn may rate-limit company page requests when constructing jobs URLs
3. **Data Availability**: Can only extract data that's visible in the BairesDev table
4. **No Deduplication**: n8n auto-generates IDs, so multiple ingests will create duplicate rows
5. **Company ID Extraction**: Requires opening LinkedIn company pages, which takes time

## Future Enhancements

- Add pagination support to scrape all 1,000+ intros across multiple pages
- Implement client-side deduplication to avoid re-ingesting the same intros
- Add progress indicator showing X/Y rows processed
- Batch webhook requests to reduce n8n API calls
- Add retry logic for failed webhook POSTs
- Support selective row ingestion (checkboxes)

## Comparison to LinkedIn Intro Agent

This extension is intentionally simpler than the existing `linkedin-intro-agent`:

| Feature | LinkedIn Intro Agent | BairesDev Intro Ingest |
|---------|---------------------|------------------------|
| Scraping | Recursive LinkedIn profile scraping | Single table scrape |
| Processing | Client-side AI email generation | Server-side (n8n) |
| Storage | Chrome local storage | n8n native data table |
| Scope | Deep profile analysis | Lightweight data capture |
| Architecture | Monolithic | Modular (ingest + enrich) |

The new architecture enables:
- Scalability: n8n handles heavy processing
- Maintainability: Separation of concerns
- Flexibility: Can swap out AI models/MCP servers without changing extension
- Reliability: Server-side processing is more robust than browser-based

## License

Same as parent repository
