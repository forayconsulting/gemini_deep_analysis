# n8n Workflow Configuration Guide

This document describes the n8n workflow setup for processing intro data from the Chrome extension and enriching it with LinkedIn company job URLs using AI + web scraping.

## Workflow Overview

The workflow receives intro data from the Chrome extension, splits it into individual records, extracts LinkedIn company job URLs using an AI Agent with Bright Data MCP scraping, processes the output with JavaScript code, and stores everything in a native data table.

## Workflow Architecture

```
Chrome Extension
  ↓ (POST with Basic Auth)
Webhook (receives array)
  ↓
Split Out (array → individual items)
  ↓
AI Agent + BrightData MCP (extract jobs URL)
  ↓
Code in JavaScript (extract URL from AI response)
  ↓
Upsert row(s) (insert/update)
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

### 3. AI Agent
**Type:** AI Agent
**Chat Model:** Anthropic Chat Model
- **Recommended:** Haiku 4.5 for speed (7 min for 50 items)
- **Alternative:** Sonnet 4.5 for accuracy (14 min for 50 items)
**Tools:** BrightData (MCP)

**Source for Prompt:** Define below

**Prompt:**
```
Use the BrightData tool to scrape this LinkedIn company profile URL: {{ $json.prospectCompanyProfile }}

Your task is to extract the numeric LinkedIn company ID from the scraped page HTML.

LinkedIn company IDs are typically 8-digit numbers. Search for these patterns in the HTML:
1. URN identifiers: "urn:li:fsd_company:74126343", "urn:li:fs_company:74126343", or "urn:li:organization:74126343"
2. Links with f_C parameter: href="/jobs/search/?f_C=74126343"
3. Numeric IDs in URL paths: "/company/74126343/"

Once you find the numeric ID, return the complete jobs URL in this exact format:
https://www.linkedin.com/jobs/search/?f_C={COMPANY_ID}&start=0

If no valid company ID can be located, return:
ID_NOT_FOUND
```

**Settings:**
- Require Specific Output Format: ❌ Disabled (we handle formatting in Code node)
- Enable Fallback Model: ❌ Disabled

---

### 4. BrightData MCP Tool Configuration
**Type:** MCP Tool (under AI Agent → Tools)
**Endpoint:** `https://mcp.brightdata.com/sse?token=[your-token]`
**Server Transport:** SSE (Server-Sent Events) ⚠️ **Important: Must be SSE, not HTTP**
**Authentication:** None (token embedded in endpoint URL)
**Tools to Include:** All

---

### 5. Code in JavaScript
**Type:** Code
**Mode:** Run Once for Each Item
**Language:** JavaScript

**JavaScript Code:**
```javascript
// Get the AI Agent output
const aiOutput = $input.item.json.output || $input.item.json.text || '';

// Extract just the LinkedIn jobs URL using regex
const urlMatch = aiOutput.match(/https:\/\/www\.linkedin\.com\/jobs\/search\/\?f_C=\d+&start=0/);

// Return all original fields from Split Out + the extracted URL
return {
  json: {
    partnerName: $('Split Out').item.json.partnerName,
    partnerProfile: $('Split Out').item.json.partnerProfile,
    partnerCompany: $('Split Out').item.json.partnerCompany,
    partnerCompanyProfile: $('Split Out').item.json.partnerCompanyProfile,
    prospectName: $('Split Out').item.json.prospectName,
    prospectProfile: $('Split Out').item.json.prospectProfile,
    prospectCompany: $('Split Out').item.json.prospectCompany,
    prospectCompanyProfile: $('Split Out').item.json.prospectCompanyProfile,
    prospectCompanyJobs: urlMatch ? urlMatch[0] : 'ID_NOT_FOUND',
    icpValue: $('Split Out').item.json.icpValue
  }
};
```

**Purpose:**
- Extracts clean LinkedIn jobs URL from AI Agent's potentially verbose response
- Uses regex to find the exact URL pattern we need
- Merges all original fields from Split Out node with the extracted URL
- Handles edge case where no URL is found (returns 'ID_NOT_FOUND')

---

### 6. Upsert row(s)
**Type:** Data Table
**Resource:** Row
**Operation:** Upsert
**Data Table:** `[your-data-table-name]`
**Must Match:** Any Condition

**Condition:**
- Column: `prospectName` (string)
- Condition: Equals
- Value: `{{ $('Split Out').item.json.prospectName }}`

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
- `prospectCompanyJobs` → `{{ $json.prospectCompanyJobs }}`
- `icpValue` → `{{ $json.icpValue }}`

**Note:** By referencing `Split Out` in the matching condition, we can insert/update in a single Upsert operation (no need for separate initial insert).

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
| `icpValue`               | number | ICP score (numeric value)                    |

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
- Returns URL directly (formatting handled in Code node)
- Handles edge cases (ID not found)

### Code Node Processing
- Uses regex to extract clean URL from AI response
- Handles verbose AI output (explanations, formatting, etc.)
- References Split Out node to preserve all original fields
- More reliable than Structured Output Parser for this use case

### Upsert Logic
- Single upsert operation handles both insert and update
- Matching on `prospectName` prevents duplicates
- All fields mapped from Code node output
- References Split Out for matching condition

---

## Performance Expectations

- **Chrome Extension Ingest:** ~2-3 seconds to send 50 items to webhook
- **Webhook → Split Out:** ~1 second
- **AI Agent + BrightData per company:**
  - Haiku 4.5: ~8-10 seconds per item
  - Sonnet 4.5: ~15-20 seconds per item
- **Code Node:** ~100ms per item
- **Upsert:** ~1-2 seconds per item
- **Total workflow for 50 intros:**
  - Haiku 4.5: ~7 minutes
  - Sonnet 4.5: ~14 minutes

---

## Troubleshooting

### "Could not connect to your MCP server"
**Solution:** ✅ Verify Server Transport is set to **SSE** (not HTTP)
- Check that BrightData token is valid in endpoint URL
- Ensure n8n can reach external MCP servers (firewall/network)
- This was the initial issue - switching from HTTP to SSE transport fixed it

### "Unexpected object input" error in Upsert
**Cause:** Structured Output Parser was returning the entire schema object instead of just the URL value
**Solution:** Replaced Structured Output Parser with Code in JavaScript node
- Code node uses regex to extract clean URL from AI response
- More reliable and gives full control over output format
- Handles verbose AI responses gracefully

### AI Agent returns "ID_NOT_FOUND"
**Common causes:**
- LinkedIn page structure may have changed
- Company page may be private/restricted
- BrightData timeout or blocking
**Solutions:**
- Update prompt patterns based on current LinkedIn HTML structure
- Try different AI model (Sonnet for harder cases)
- Check BrightData service status

### Duplicate rows in data table
**Solution:**
- Verify upsert matching condition uses `prospectName`
- Ensure `prospectName` values are consistent (trim whitespace in Chrome extension)

### Lost original data in Upsert
**Cause:** Not referencing the correct source node for all fields
**Solution:** Code node explicitly references `Split Out` node for all original fields
- Ensures data integrity through entire workflow
- No data loss when merging AI-generated URL

### icpValue type mismatch
**Cause:** Chrome extension sent string values like "Building..." instead of numbers
**Solution:** Extension updated to send numeric values only
- Table column type set to `number`
- Extension validates before sending

---

## Evolution & Design Decisions

### Why Code Node Instead of Structured Output Parser?
**Initial Approach:** Tried using n8n's Structured Output Parser with JSON schema
**Issue:** Parser returned entire schema object instead of just the URL value
**Final Approach:** Code in JavaScript node with regex extraction
**Benefits:**
- Full control over output format
- Handles any AI response format (verbose, terse, etc.)
- Simple regex pattern ensures clean URL extraction
- Easy to debug and modify

### Why Single Upsert Instead of Two?
**Initial Approach:** Two upsert operations (initial insert, then update with jobs URL)
**Issue:** Redundant - first upsert served no purpose
**Final Approach:** Single upsert at the end
**Benefits:**
- Simpler workflow
- Fewer database operations
- Faster execution
- Easier to maintain

### Why Haiku 4.5 Instead of Sonnet 4.5?
**Testing Results:**
- Sonnet 4.5: 14 minutes for 50 items, very high accuracy
- Haiku 4.5: 7 minutes for 50 items, equally accurate for this task
**Decision:** Haiku 4.5 is the default
**Reasoning:**
- Company ID extraction is straightforward pattern matching
- Both models achieved 100% accuracy in testing
- 2x speed improvement worth the cost savings

---

## Future Enhancements

- [ ] Add caching layer (n8n data table for company ID lookups)
- [ ] Implement retry logic for failed scrapes
- [ ] Add logging/monitoring for AI Agent success rate
- [ ] Batch processing optimization for large ingests
- [ ] Error handling for malformed LinkedIn URLs
- [ ] Webhook response includes success/failure counts
