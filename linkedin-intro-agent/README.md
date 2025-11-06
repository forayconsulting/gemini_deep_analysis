# LinkedIn Intro Agent

A Chrome extension that generates hyper-personalized introduction request emails by recursively analyzing LinkedIn profiles.

## Quick Start

### Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `linkedin-intro-agent` folder
5. Ensure you're logged into LinkedIn in the same browser

### Usage

1. Navigate to a BairesDev referrals portal page showing intros
2. Click the LinkedIn Intro Agent extension icon
3. The extension will auto-detect LinkedIn URLs from the page
4. Handler and prospect profiles will be auto-filled
5. Select exploration depth:
   - **Quick** (Depth 1): Just the two profiles (~10-15 sec)
   - **Balanced** (Depth 2): + Current companies (~30-60 sec) [Recommended]
   - **Deep** (Depth 3): + All companies & schools (~1-2 min)
6. Click "Generate Intro Email"
7. Wait for recursive exploration to complete
8. Review, edit, and copy the generated email

## Features

### Intelligent Connection Discovery

The extension finds nuanced connections between profiles:

- **Shared Companies**: Current colleagues or past colleagues with overlapping tenure
- **Shared Education**: Alumni connections with graduation context
- **Geographic Proximity**: Location-based connections
- **Shared Skills**: Professional skill overlaps
- **Industry Alignment**: Similar career trajectories

### Recursive Exploration

Goes beyond surface-level profile data:

- Explores linked companies, schools, and other entities
- Follows connections up to 3 layers deep
- Caches profiles to avoid redundant scraping (24-hour TTL)
- Rate-limited to avoid triggering LinkedIn's anti-bot measures

### AI-Powered Email Generation

Uses Gemini 2.5 Pro to:

- Analyze all discovered connections
- Prioritize meaningful, recent overlaps
- Craft authentic, conversational introduction requests
- Focus on specific details, not generic similarities
- Keep emails concise (2-3 paragraphs)

### Smart Features

- **Auto-detection**: Automatically finds LinkedIn URLs on BairesDev portal
- **Progress tracking**: Real-time status updates during exploration
- **Editable output**: Review and modify generated emails
- **Copy to clipboard**: One-click copy functionality
- **Regenerate**: Get alternative versions with different phrasing

## File Structure

```
linkedin-intro-agent/
├── manifest.json           # Chrome extension configuration
├── popup.html              # Extension popup UI
├── popup.js                # Popup orchestration logic
├── styles.css              # UI styling
├── content.js              # LinkedIn data extraction
├── linkedinRecursive.js    # Recursive exploration engine
├── background.js           # Gemini API integration
├── pageDetector.js         # Auto-detection on BairesDev portal
└── config.js               # API configuration (copy from main extension)
```

## Configuration

### API Key Setup

Copy your Gemini API key to `config.js`:

```javascript
const CONFIG = {
    GEMINI_API_KEY: 'your-api-key-here',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
};
```

### Adjusting Parameters

**Exploration Depth** (in `linkedinRecursive.js`):
```javascript
this.maxDepth = options.maxDepth || 2;        // Max recursion layers
this.maxPages = options.maxPages || 20;       // Max total pages to scrape
```

**Rate Limiting** (in `linkedinRecursive.js`):
```javascript
this.requestDelay = options.requestDelay || 2500;  // Milliseconds between requests
```

**Cache Duration** (in `linkedinRecursive.js`):
```javascript
const ttl = 24 * 60 * 60 * 1000;  // 24 hours in milliseconds
```

## Debugging

### Popup Issues
Right-click extension icon → "Inspect" to open DevTools for popup

### Background Worker
Go to `chrome://extensions/` → Find extension → "Inspect views: service worker"

### Page Detection
Open DevTools on BairesDev portal page → Check Console for detection logs

### LinkedIn Scraping
Background worker console shows detailed scraping progress and connection analysis

## Limitations

1. **LinkedIn Rate Limiting**: Uses 2.5-second delays to appear human. Excessive use may trigger rate limits.

2. **Data Availability**: Can only access data visible to logged-in user. Some profiles are private.

3. **Performance**:
   - Depth 1: ~10-15 seconds
   - Depth 2: ~30-60 seconds
   - Depth 3: ~1-2 minutes

4. **Terms of Service**: For personal, legitimate business use only. Bulk scraping may violate LinkedIn ToS.

5. **API Costs**: Each email generation uses ~2000-5000 input tokens and up to 1024 output tokens.

## Connection Strength Hierarchy

Connections are ranked 0-100 based on type and context:

1. **Current colleagues** (90-100): Both currently at same company
2. **Past colleagues with overlap** (80-90): Worked together at same time
3. **Alumni** (70): Same school, similar graduation year
4. **Same company, different times** (60): Shared company experience
5. **Similar industry** (50): Work in same niche
6. **Shared location** (40): Geographic proximity
7. **Shared skills** (30): Common professional skills

## Troubleshooting

**Extension not detecting profiles**
- Ensure you're on the BairesDev referrals portal
- Check that LinkedIn icons are visible on the page
- Try clicking "Auto-Detect LinkedIn URLs" button manually

**LinkedIn scraping fails**
- Verify you're logged into LinkedIn
- Check if you've been rate-limited (try again later)
- Reduce exploration depth to minimize requests

**Email generation fails**
- Verify Gemini API key in config.js
- Check background worker console for API errors
- Ensure you have available API quota

**No connections found**
- Profiles may have limited public information
- Try increasing exploration depth
- Some connections require deeper analysis

## Advanced Usage

### Custom Prompts

Edit `background.js` to customize the email generation prompt. The system prompt starts at line 19.

### Connection Weights

Modify connection strength calculations in `linkedinRecursive.js`:
- `calculateOverlapStrength()` - temporal overlap scoring
- `findConnections()` - base strength values for each connection type

### Additional Connection Types

Add custom connection detection in `linkedinRecursive.js` `findConnections()` method.

## Support

For issues or questions, see the main repository documentation in `/CLAUDE.md`.
