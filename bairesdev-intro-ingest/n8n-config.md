# n8n Workflow Configuration Guide

This document describes the n8n workflow setup for processing intro data from the Chrome extension and enriching it with LinkedIn company job URLs using AI + web scraping.

## Workflow Overview

The workflow receives intro data from the Chrome extension, splits it into individual records, extracts LinkedIn company job URLs using an AI Agent with Bright Data MCP scraping, and stores everything in a native data table.

## Workflow Architecture

```
Chrome Extension
  ↓ (POST with Basic Auth)
Webhook (receives array)
  ↓
Split Out (array → individual items)
  ↓
Upsert row(s) (initial insert)
  ↓
AI Agent + BrightData MCP (extract jobs URL)
  ↓
Set/Code (merge jobs URL back)
  ↓
Upsert row(s) (update with jobs URL)
```

---

## Node Configurations

### 1. Webhook (Trigger)
**Type:** Webhook
**Method:** POST
**Path:** `[your-webhook-path]`
**Authentication:** Basic Auth
- Username: `[your-username]`
- Password: `[your-password]`
**Respond:** Immediately

**Expected Input:** Array of intro objects
```json
[
  {
    "partnerName": "...",
    "partnerProfile": "https://linkedin.com/in/...",
    "partnerCompany": "...",
    "partnerCompanyProfile": "https://linkedin.com/company/...",
    "prospectName": "...",
    "prospectProfile": "https://linkedin.com/in/...",
    "prospectCompany": "...",
    "prospectCompanyProfile": "https://linkedin.com/company/...",
    "prospectCompanyJobs": "",
    "icpValue": "..."
  }
]
```

---

### 2. Split Out
**Type:** Item Lists
**Operation:** Split Out
**Field to Split:** `body`
**Include:** No Other Fields

Converts the webhook's array payload into individual items for per-row processing.

---

### 3. Upsert row(s) (Initial Insert)
**Type:** Data Table
**Resource:** Row
**Operation:** Upsert
**Data Table:** `[your-data-table-name]`
**Must Match:** Any Condition

**Condition:**
- Column: `prospectName` (string)
- Condition: Equals
- Value: `{{ $json.prospectName }}`

**Mapping Column Mode:** Map Each Column Manually

**Fields to Map:**
- `partnerName` → `{{ $json.partnerName }}`
- `partnerProfile` → `{{ $json.partnerProfile }}`
- `partnerCompany` → `{{ $json.partnerCompany }}`
- `partnerCompanyProfile` → `{{ $json.partnerCompanyProfile }}`
- `prospectName` → `{{ $json.prospectName }}`
- `prospectProfile` → `{{ $json.prospectProfile }}`
- `prospectCompany` → `{{ $json.prospectCompany }}`
- `prospectCompanyProfile` → `{{ $json.prospectCompanyProfile }}`
- `prospectCompanyJobs` → `{{ $json.prospectCompanyJobs }}` (empty at this stage)
- `icpValue` → `{{ $json.icpValue }}`

---

### 4. AI Agent
**Type:** AI Agent
**Chat Model:** Anthropic Chat Model (Sonnet 4.5 recommended)
**Tools:** BrightData (MCP)

**Source for Prompt:** Define below

**Prompt:**
```
Use the BrightData tool to scrape this LinkedIn company profile URL: {{ $json.prospectCompanyProfile }}

Your task is to extract the numeric LinkedIn company ID from the scraped page HTML and construct a jobs search URL.

LinkedIn company IDs are typically 8-digit numbers. Search for these patterns in the HTML:
1. URN identifiers: "urn:li:fsd_company:74126343", "urn:li:fs_company:74126343", or "urn:li:organization:74126343"
2. Links with f_C parameter: href="/jobs/search/?f_C=74126343"
3. Numeric IDs in URL paths: "/company/74126343/"

Once you find the numeric ID, construct the jobs URL in this exact format:
https://www.linkedin.com/jobs/search/?f_C={COMPANY_ID}&start=0

Return ONLY the complete jobs URL (nothing else), or return "ID_NOT_FOUND" if no valid company ID can be located.
```

**Settings:**
- Require Specific Output Format: ✅ Enabled
- Output Format: `The jobs URL in format: https://www.linkedin.com/jobs/search/?f_C=XXXXXXXX&start=0`
- Enable Fallback Model: ❌ Disabled

---

### 5. BrightData MCP Tool Configuration
**Type:** MCP Tool (under AI Agent → Tools)
**Endpoint:** `https://mcp.brightdata.com/sse?token=[your-token]`
**Server Transport:** SSE (Server-Sent Events) ⚠️ **Important: Must be SSE, not HTTP**
**Authentication:** None (token embedded in endpoint URL)
**Tools to Include:** All

---

### 6. Set Node (Merge Jobs URL)
**Type:** Set
**Mode:** Manual Mapping

**Fields to Set:**
- Keep all existing fields from input
- Add/Update: `prospectCompanyJobs` = `{{ $('AI Agent').item.json.output }}`

This merges the AI Agent's extracted jobs URL back into the original row data.

---

### 7. Upsert row(s) (Update with Jobs URL)
**Type:** Data Table
**Resource:** Row
**Operation:** Upsert
**Data Table:** `[your-data-table-name]` (same as step 3)
**Must Match:** Any Condition

**Condition:**
- Column: `prospectName` (string)
- Condition: Equals
- Value: `{{ $json.prospectName }}`

**Mapping:** Same as step 3, but now `prospectCompanyJobs` will contain the extracted URL

---

## Data Table Schema

**Table Name:** `[your-data-table-name]`

| Column Name               | Type   | Description                                  |
|--------------------------|--------|----------------------------------------------|
| `partnerName`            | string | Partner's full name                          |
| `partnerProfile`         | string | Partner's LinkedIn profile URL               |
| `partnerCompany`         | string | Partner's company name                       |
| `partnerCompanyProfile`  | string | Partner's company LinkedIn URL               |
| `prospectName`           | string | Prospect's full name (matching key)          |
| `prospectProfile`        | string | Prospect's LinkedIn profile URL              |
| `prospectCompany`        | string | Prospect's company name                      |
| `prospectCompanyProfile` | string | Prospect's company LinkedIn URL              |
| `prospectCompanyJobs`    | string | LinkedIn jobs search URL (AI-generated)      |
| `icpValue`               | string | ICP score (numeric or text placeholder)      |

---

## Key Configuration Notes

### Webhook Setup
- Store webhook URL and Basic Auth credentials in `config.js` (gitignored)
- Chrome extension posts array of intros to this endpoint
- Webhook should respond immediately (don't wait for processing)

### BrightData MCP
- **Critical:** Server Transport must be set to **SSE** (not HTTP)
- Token is embedded in the endpoint URL
- Provides web scraping capabilities to AI Agent
- Handles anti-bot detection and residential proxies

### AI Agent Prompt
- Explicitly instructs to use BrightData tool
- Provides multiple fallback patterns for company ID extraction
- Enforces strict output format (jobs URL only)
- Handles edge cases (ID not found)

### Upsert Logic
- First upsert: Inserts initial data (jobs URL is empty)
- Second upsert: Updates same row with extracted jobs URL
- Matching on `prospectName` prevents duplicates
- All fields sent in both upserts to ensure data integrity

---

## Performance Expectations

- **Webhook → Split → Initial Upsert:** ~1-2 seconds for 50 items
- **AI Agent + BrightData per company:** ~2-5 seconds
- **Total workflow for 50 intros:** ~2-5 minutes (parallel processing)

---

## Troubleshooting

### "Could not connect to your MCP server"
- ✅ Verify Server Transport is set to **SSE** (not HTTP)
- Check that BrightData token is valid in endpoint URL
- Ensure n8n can reach external MCP servers (firewall/network)

### AI Agent returns "ID_NOT_FOUND"
- LinkedIn page structure may have changed
- Company page may be private/restricted
- Update prompt patterns based on current LinkedIn HTML structure

### Duplicate rows in data table
- Verify upsert matching condition uses `prospectName`
- Ensure `prospectName` values are consistent (trim whitespace)

---

## Future Enhancements

- [ ] Add caching layer (n8n data table for company ID lookups)
- [ ] Implement retry logic for failed scrapes
- [ ] Add logging/monitoring for AI Agent success rate
- [ ] Batch processing optimization for large ingests
