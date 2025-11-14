# BairesDev Intro Ingest & Personalization System

A Chrome extension + n8n workflow system that scrapes introduction data from the BairesDev referrals portal, enriches it with LinkedIn insights, and generates hyper-personalized introduction request emails.

## Overview

This system consists of three main components that work together to automate the intro request personalization workflow:

1. **Chrome Extension** (this directory) - Scrapes intro data from BairesDev referrals portal
2. **n8n Workflow: "Ingest & Upsert"** - Receives data, enriches with LinkedIn job URLs, stores in data table
3. **n8n Workflow: "Generate Personalized Messages"** - Uses AI to generate hyper-personalized intro request emails

## Architecture

### Complete Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│  BairesDev Referrals Portal (Intros Table)                   │
│  - Intro ID, Partner Handler, Partner/Prospect details       │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ User clicks "Ingest Intros" button
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  Chrome Extension (content.js)                                │
│  - Injects floating button into page                          │
│  - Scrapes table with dynamic column mapping                  │
│  - Extracts: introId, handlerName, partner/prospect data      │
│  - POSTs to n8n webhook (Basic Auth)                          │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ POST array of intro objects
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  n8n Workflow #1: "Ingest & Upsert"                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Webhook (Basic Auth)                              │   │
│  │ 2. Split Out (array → individual items)              │   │
│  │ 3. AI Agent (Claude Haiku 4.5 + BrightData MCP)      │   │
│  │    - Scrapes prospect company LinkedIn page          │   │
│  │    - Extracts numeric company ID from HTML           │   │
│  │    - Constructs LinkedIn jobs URL                    │   │
│  │ 4. Code in JavaScript (parse AI output)              │   │
│  │ 5. Upsert row(s) (match on introId)                  │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ Inserts/updates rows
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  n8n Data Table: "Partner Intros"                            │
│  - 12 columns (introId, handlerName, partner/prospect        │
│    details, prospectCompanyJobs, icpValue,                   │
│    personalizedMessage)                                       │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     │ Manual trigger (or automatic)
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  n8n Workflow #2: "Generate Personalized Messages"          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Get row(s) where personalizedMessage is empty     │   │
│  │ 2. Sort by icpValue descending (highest first)       │   │
│  │ 3. Limit to N rows (configurable, default 5)         │   │
│  │ 4. AI Agent (Claude Sonnet 4.5 + BrightData MCP)     │   │
│  │    - Scrapes 5+ LinkedIn URLs recursively            │   │
│  │    - Finds "needle in haystack" connection angles    │   │
│  │    - Generates hyper-personalized email              │   │
│  │ 5. Code in JavaScript (extract Subject + Body)       │   │
│  │ 6. Upsert row(s) (update personalizedMessage field)  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Data Table Schema

The **"Partner Intros"** n8n data table has 12 columns:

| Column Name              | Type   | Description                                           |
|-------------------------|--------|-------------------------------------------------------|
| `introId`               | string | Unique intro request ID (from BairesDev portal)       |
| `handlerName`           | string | BairesDev employee managing this partner relationship |
| `partnerName`           | string | Partner's full name                                   |
| `partnerProfile`        | string | Partner's LinkedIn profile URL                        |
| `partnerCompany`        | string | Partner's company name                                |
| `partnerCompanyProfile` | string | Partner's company LinkedIn URL                        |
| `prospectName`          | string | Prospect's full name                                  |
| `prospectProfile`       | string | Prospect's LinkedIn profile URL                       |
| `prospectCompany`       | string | Prospect's company name                               |
| `prospectCompanyProfile`| string | Prospect's company LinkedIn URL                       |
| `prospectCompanyJobs`   | string | LinkedIn jobs URL (AI-generated via Ingest workflow)  |
| `icpValue`              | number | ICP score for prioritization                          |
| `personalizedMessage`   | string | AI-generated intro email (created by Generate workflow)|

### Key Design Decisions

**1. `introId` as Unique Identifier**
- The `introId` comes directly from the BairesDev portal (first column)
- Used for upsert matching in both workflows
- Ensures multiple partners can request intros to the same prospect without conflicts
- Enables integration with other BairesDev systems

**2. `handlerName` for Email Signatures**
- Extracted from the "Partner Handler" column in the portal
- Used in the personalized message generation
- Ensures emails are signed by the correct BairesDev representative

**3. Separation of Concerns**
- **Ingest workflow**: Fast, lightweight data capture + job URL extraction
- **Generate workflow**: Slow, deep research + email composition
- Allows for manual control, rate limiting, and prioritization

## Chrome Extension

### How It Works

1. **Automatic Button Injection**: When you visit the BairesDev referrals portal (`handlers-referralsportal.bairesdev.com/intros`), the extension injects a floating "Ingest Intros" button in the bottom-right corner.

2. **Table Scraping**: When clicked, the extension:
   - Finds the intros table in the DOM
   - Reads column headers to create a dynamic column mapping
   - Iterates through all visible table rows (respects pagination)
   - Extracts text content and LinkedIn URLs from each cell

3. **Dynamic Column Mapping**: The extension intelligently maps columns by header text (e.g., "Intro Id", "Partner Handler", "Partner Name", etc.), so it works even if columns are reordered.

4. **Webhook POST**: Sends the array of intro objects to the n8n webhook with Basic Authentication.

### Files

- **manifest.json** - Chrome extension manifest (Manifest V3)
- **content.js** - Main content script (button injection + table scraping)
- **config.js** - Webhook URL and Basic Auth credentials (gitignored)
- **config.example.js** - Template for config.js

### Installation

1. Clone this repository
2. Copy `config.example.js` to `config.js`:
   ```bash
   cd bairesdev-intro-ingest
   cp config.example.js config.js
   ```
3. Update `config.js` with your n8n webhook URL and credentials
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" (top right)
6. Click "Load unpacked"
7. Select the `bairesdev-intro-ingest` folder

### Usage

1. Navigate to the BairesDev referrals portal intros page
2. Wait for the page to load completely
3. Click the "Ingest Intros" button in the bottom-right corner
4. The button will show "Processing..." while scraping
5. A success message will appear when complete (e.g., "Successfully ingested 50 intros!")
6. Check your n8n data table to verify rows were inserted/updated

### Debugging

- **Console Logs**: Open DevTools on the BairesDev portal, check console for `[BairesDev Ingest]` messages
- **Network Requests**: Use Chrome DevTools Network tab to inspect webhook POSTs
- **Button Not Appearing**: Check that you're on the correct URL and the page has fully loaded

## n8n Workflow #1: "Ingest & Upsert"

### Purpose

Receives intro data from the Chrome extension, enriches it with LinkedIn job URLs, and stores it in the data table.

### Nodes

1. **Webhook** (POST, Basic Auth)
   - Endpoint: `https://bairesdevsales.app.n8n.cloud/webhook/249ae115-73e4-4782-b730-a9ba84352db6`
   - Username: `bairesdev`
   - Password: `n8nification`

2. **Split Out**
   - Converts array of intros into individual items for processing

3. **AI Agent** (Claude Haiku 4.5 + BrightData MCP)
   - **Tool**: BrightData MCP server for LinkedIn scraping
   - **Task**: Scrape prospect company LinkedIn page and extract numeric company ID
   - **Prompt**:
     ```
     Extract the numeric company ID from the scraped LinkedIn company page.
     Look for patterns like:
     - /company/{8-digit-number}/
     - urn:li:fsd_company:{number}
     - urn:li:fs_company:{number}

     Then construct the jobs URL in this format:
     https://www.linkedin.com/jobs/search/?f_C={companyId}&start=0
     ```

4. **Code in JavaScript**
   - Parses AI output to extract the jobs URL
   - Returns "Not found" if extraction fails

5. **Upsert row(s)** (Data Table)
   - Table: "Partner Intros"
   - Match on: `introId`
   - Fields: All 12 columns (leaves `personalizedMessage` empty)

### Performance

- **Time**: ~6-7 minutes for 50 rows (8-10 seconds per row)
- **Cost**: Uses Claude Haiku 4.5 (cheaper, faster model)
- **Rate Limiting**: BrightData handles LinkedIn scraping without auth issues

## n8n Workflow #2: "Generate Personalized Messages"

### Purpose

Generates hyper-personalized introduction request emails for the highest-value prospects, using recursive LinkedIn research and AI.

### Nodes

1. **Manual Trigger** (or automatic trigger when Ingest completes)

2. **Get row(s)** (Data Table)
   - Table: "Partner Intros"
   - Condition: `personalizedMessage` is empty
   - Returns: All rows that need messages

3. **Sort**
   - Field: `icpValue`
   - Order: Descending (highest first)

4. **Limit**
   - Configurable limit (default: 5, tested with 1-50)
   - Allows rate limiting and batch processing

5. **AI Agent** (Claude Sonnet 4.5 + BrightData MCP)
   - **Tool**: BrightData MCP server
   - **Task**: Recursive LinkedIn research + email generation
   - **Prompt**: Comprehensive ~200-line prompt covering:
     - Role: Senior outbound sales copywriter for BairesDev
     - Context: Partner already knows BairesDev (referral program member)
     - Tools: Scrape 5 initial URLs + up to 5 additional relevant URLs
     - Research: Look for "needle in haystack" connection angles:
       - Job postings (growing teams, tech stack, strategic initiatives)
       - Shared employers, industries, overlapping themes
       - Geographic proximity, mutual interests
     - Style: 3-8 sentences, conversational, specific, no clichés
     - Output: Subject line + email body only
   - **Variables**: All row data (introId, handlerName, partner/prospect details)

6. **Code in JavaScript**
   - Extracts only the Subject + Body from AI output using regex: `/Subject:[\s\S]*/`
   - Removes AI's research notes and reasoning

7. **Upsert row(s)** (Data Table)
   - Table: "Partner Intros"
   - Match on: `introId`
   - Fields: `personalizedMessage` = parsed email

### Performance

- **Time**: ~5 minutes per row (varies based on research depth)
- **Cost**: Uses Claude Sonnet 4.5 (more capable, slower model)
- **Scaling**: Can be configured to loop and process all rows automatically

### Example Output

```
Subject: Quick intro to Adam Singolda at Taboola?

Hi Guy,

I noticed Taboola just opened 9+ sales and solutions engineering roles across their US offices, including multiple Senior Advertising Sales Manager and Account Manager positions. Given your background in scaling enterprise SaaS teams at RevGenius, I thought you might know Adam well enough to make a quick introduction.

We specialize in nearshore engineering squads that can embed with companies during heavy build phases, which is exactly what Taboola seems to be in as they scale their AI-powered ad platform. They likely need engineering capacity to support this expansion while their internal hiring catches up.

Would you be comfortable making a warm introduction?

Best,
Beatriz
```

## Credentials & Configuration

### Chrome Extension

**File**: `bairesdev-intro-ingest/config.js`

```javascript
const CONFIG = {
  webhookUrl: 'https://bairesdevsales.app.n8n.cloud/webhook/...',
  auth: {
    username: 'bairesdev',
    password: 'n8nification'
  }
};
```

### n8n Workflows

**Credentials to configure** (currently using Clayton's accounts):

1. **Anthropic API Key**
   - Used by: Both workflows (Haiku for Ingest, Sonnet for Generate)
   - Current: Clayton's personal key
   - To update: Create new credential in n8n, swap in both workflows

2. **BrightData MCP Server**
   - Used by: Both workflows
   - Current: Endpoint includes Clayton's API token
   - To update: Sign up at BrightData, get new API key, update endpoint URL

3. **Ingest & Upsert Basic Auth**
   - Used by: Webhook node in Ingest workflow
   - Username: `bairesdev`
   - Password: `n8nification`
   - To update: Change credential in n8n, update Chrome extension config.js

## Future Enhancements

### Automatic Looping
Add a loop from the "Upsert row(s)" node back to "Get row(s)" with a "Wait" node:
- Automatically processes all rows until none remain
- Add 1-minute wait between iterations to avoid rate limiting
- Trigger automatically when Ingest workflow completes

### Email Sending Integration
Add a final workflow that:
- Reads rows from data table where `personalizedMessage` is not empty
- Sends emails via Gmail/Outlook/SendGrid
- Tracks sent status in a new column

### API Endpoint
Expose the data table as an API endpoint so BairesDev platform can:
- Fetch personalized messages for display in the portal
- Trigger message generation for specific intro IDs
- Update intro status when emails are sent

### Google Sheets Sync
Add a node to sync the data table to Google Sheets for:
- Manual review and editing
- Collaboration with team members
- Analytics and reporting

## Limitations & Considerations

1. **LinkedIn Rate Limiting**: BrightData handles this, but excessive scraping may still trigger limits
2. **AI Costs**: Claude Sonnet 4.5 costs ~$3 per million input tokens, ~$15 per million output tokens
3. **Processing Time**: Generate workflow takes ~5 minutes per row (can add up for large batches)
4. **Research Depth**: AI is limited to 5 initial URLs + 5 additional URLs to control costs
5. **Chrome Extension Scope**: Only scrapes visible rows (respects pagination)

## Troubleshooting

### Extension button doesn't appear
- Ensure you're on the correct URL: `handlers-referralsportal.bairesdev.com/intros`
- Check that the extension is loaded in `chrome://extensions/`
- Look for errors in the browser console

### Webhook POST fails
- Verify `config.js` has correct webhook URL and credentials
- Check n8n workflow is active (toggle in top-right)
- Use Chrome DevTools Network tab to inspect the request/response

### Ingest workflow fails
- Check that BrightData MCP endpoint is valid (API token may have expired)
- Verify Anthropic API key has credits
- Review workflow execution logs in n8n

### No personalized messages generated
- Ensure Ingest workflow completed successfully (rows exist in data table)
- Check that `personalizedMessage` column is truly empty (not null vs. empty string)
- Verify Generate workflow is using correct data table name
- Review AI Agent output for errors

## License

Same as parent repository
