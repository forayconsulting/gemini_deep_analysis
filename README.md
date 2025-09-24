# Gemini Deep Analysis Chrome Extension

A Chrome extension that uses Google's Gemini AI to perform critical analysis of web articles, identifying arguments, fallacies, and constructing steel-man counter-arguments. Features deep content scraping that captures linked pages for comprehensive context.

## Features

- **Two-Stage Content Capture**:
  - Stage 1: Capture main article text with preserved link structure
  - Stage 2: Deep scrape linked pages and insert content inline for context

- **Critical Analysis**: Uses Gemini 2.5 Pro to:
  - Identify primary and secondary arguments
  - Detect logical fallacies and syllogisms
  - Generate steel-man counter-arguments
  - Analyze linked content for deeper insight

- **Smart Filtering**:
  - Domain exclusion for unwanted sites
  - Automatic text extraction with link preservation
  - Filters scripts, styles, and hidden elements

## Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/forayconsulting/gemini_deep_analysis.git
   cd gemini_deep_analysis
   ```

2. **Configure API Key**:
   ```bash
   cp chrome-extension/config.example.js chrome-extension/config.js
   ```
   Edit `chrome-extension/config.js` and add your Gemini API key.

3. **Load the Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

## Usage

1. Navigate to any article or webpage
2. Click the extension icon
3. Click "Capture Page" to extract the main content
4. Optionally:
   - Add domains to exclude (e.g., "facebook.com, twitter.com")
   - Click "Capture Linked Pages" to deep scrape referenced content
5. Click "Send to Gemini" for analysis

## Configuration

- **System Prompt**: Customize the analysis instructions
- **Excluded Domains**: Comma-separated list of domains to skip during deep scraping
- **API Model**: Currently using Gemini 2.5 Pro (configurable in config.js)

## Development

See [CLAUDE.md](CLAUDE.md) for detailed architecture and development guidelines.

## License

MIT