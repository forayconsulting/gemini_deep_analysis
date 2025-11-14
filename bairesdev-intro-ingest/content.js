/**
 * BairesDev Intro Ingest - Content Script
 * Injects a button into the BairesDev intros page and handles scraping + webhook POST
 */

(function() {
  'use strict';

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    console.log('[BairesDev Ingest] Initializing extension...');
    injectButton();
  }

  /**
   * Injects a floating button into the page
   */
  function injectButton() {
    // Create button container
    const container = document.createElement('div');
    container.id = 'bairesdev-ingest-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create button
    const button = document.createElement('button');
    button.id = 'bairesdev-ingest-button';
    button.textContent = 'Ingest Intros';
    button.style.cssText = `
      padding: 12px 24px;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.2s;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#0052a3';
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#0066cc';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });

    button.addEventListener('click', handleIngestClick);

    // Create status message div
    const statusDiv = document.createElement('div');
    statusDiv.id = 'bairesdev-ingest-status';
    statusDiv.style.cssText = `
      margin-top: 10px;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      display: none;
      max-width: 300px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    `;

    container.appendChild(button);
    container.appendChild(statusDiv);
    document.body.appendChild(container);

    console.log('[BairesDev Ingest] Button injected successfully');
  }

  /**
   * Handles button click - orchestrates scraping and webhook POST
   */
  async function handleIngestClick() {
    const button = document.getElementById('bairesdev-ingest-button');
    const statusDiv = document.getElementById('bairesdev-ingest-status');

    try {
      // Disable button
      button.disabled = true;
      button.style.background = '#ccc';
      button.style.cursor = 'not-allowed';
      button.textContent = 'Processing...';

      showStatus('info', 'Scraping intros table...');

      // Scrape the table
      const intros = await scrapeIntrosTable();

      if (!intros || intros.length === 0) {
        throw new Error('No intros found on the page');
      }

      showStatus('info', `Found ${intros.length} intros. Sending to n8n...`);

      // Send to n8n
      await sendToN8N(intros);

      // Success
      showStatus('success', `Successfully ingested ${intros.length} intros!`);

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 5000);

    } catch (error) {
      console.error('[BairesDev Ingest] Error:', error);
      showStatus('error', error.message);
    } finally {
      // Re-enable button
      button.disabled = false;
      button.style.background = '#0066cc';
      button.style.cursor = 'pointer';
      button.textContent = 'Ingest Intros';
    }
  }

  /**
   * Scrapes all visible intro rows from the BairesDev table
   */
  async function scrapeIntrosTable() {
    console.log('[BairesDev Ingest] Starting table scrape...');

    // Find the table
    const table = document.querySelector('table');
    if (!table) {
      throw new Error('Could not find intros table on page');
    }

    // Get column mapping from headers
    const columnMap = getColumnMapping(table);
    console.log('[BairesDev Ingest] Column mapping:', columnMap);

    // Find all table rows (skip header)
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    console.log(`[BairesDev Ingest] Found ${rows.length} rows`);

    if (rows.length === 0) {
      throw new Error('No intro rows found in table');
    }

    const intros = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`[BairesDev Ingest] Processing row ${i + 1}/${rows.length}`);

      try {
        const intro = extractIntroFromRow(row, columnMap);
        if (intro) {
          intros.push(intro);
        }
      } catch (error) {
        console.error(`[BairesDev Ingest] Error processing row ${i + 1}:`, error);
        // Continue with other rows even if one fails
      }
    }

    console.log(`[BairesDev Ingest] Successfully extracted ${intros.length} intros`);
    return intros;
  }

  /**
   * Creates a mapping of column names to indices by reading table headers
   */
  function getColumnMapping(table) {
    const mapping = {};

    // Find the header row
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) {
      console.warn('[BairesDev Ingest] No header row found, using default column order');
      return null;
    }

    // Get all header cells
    const headers = Array.from(headerRow.querySelectorAll('th'));

    headers.forEach((header, index) => {
      // Get raw text and clean it up
      let columnName = header.textContent.trim();

      // Remove Material UI icons and sort indicators
      // These appear as text like "filter_alt", "arrow_upward", etc.
      columnName = columnName
        .replace(/filter_alt/g, '')
        .replace(/arrow_upward/g, '')
        .replace(/arrow_downward/g, '')
        .trim();

      // Only map non-empty column names
      if (columnName) {
        mapping[columnName] = index;
      }
    });

    return mapping;
  }

  /**
   * Extracts intro data from a single table row
   * Uses dynamic column mapping to handle reordered columns
   */
  function extractIntroFromRow(row, columnMap) {
    const cells = Array.from(row.querySelectorAll('td'));

    const intro = {
      introId: '',
      handlerName: '',
      partnerName: '',
      partnerProfile: '',
      partnerCompany: '',
      partnerCompanyProfile: '',
      prospectName: '',
      prospectProfile: '',
      prospectCompany: '',
      prospectCompanyProfile: '',
      prospectCompanyJobs: '', // Empty - n8n will populate later
      icpValue: ''
    };

    // If no column mapping available, fall back to hardcoded indices
    if (!columnMap) {
      // Fallback to default column positions
      extractByIndex(cells, intro, {
        'Intro Id': 0,
        'Partner Handler': 10, // Adjust based on actual column position
        'Partner Company': 2,
        'Partner Name': 3,
        'Prospect Name': 6,
        'Prospect Company Name': 7,
        'ICP Value': 9
      });
      return intro;
    }

    // Use dynamic column mapping
    const introIdIdx = columnMap['Intro Id'];
    if (introIdIdx !== undefined && cells[introIdIdx]) {
      intro.introId = extractText(cells[introIdIdx]);
    }

    const handlerNameIdx = columnMap['Partner Handler'];
    if (handlerNameIdx !== undefined && cells[handlerNameIdx]) {
      intro.handlerName = extractText(cells[handlerNameIdx]);
    }

    const partnerCompanyIdx = columnMap['Partner Company'];
    if (partnerCompanyIdx !== undefined && cells[partnerCompanyIdx]) {
      intro.partnerCompany = extractText(cells[partnerCompanyIdx]);
      intro.partnerCompanyProfile = extractLinkedInUrl(cells[partnerCompanyIdx]);
    }

    const partnerNameIdx = columnMap['Partner Name'];
    if (partnerNameIdx !== undefined && cells[partnerNameIdx]) {
      intro.partnerName = extractText(cells[partnerNameIdx]);
      intro.partnerProfile = extractLinkedInUrl(cells[partnerNameIdx]);
    }

    const prospectNameIdx = columnMap['Prospect Name'];
    if (prospectNameIdx !== undefined && cells[prospectNameIdx]) {
      intro.prospectName = extractText(cells[prospectNameIdx]);
      intro.prospectProfile = extractLinkedInUrl(cells[prospectNameIdx]);
    }

    const prospectCompanyIdx = columnMap['Prospect Company Name'];
    if (prospectCompanyIdx !== undefined && cells[prospectCompanyIdx]) {
      intro.prospectCompany = extractText(cells[prospectCompanyIdx]);
      intro.prospectCompanyProfile = extractLinkedInUrl(cells[prospectCompanyIdx]);
    }

    const icpValueIdx = columnMap['ICP Value'];
    if (icpValueIdx !== undefined && cells[icpValueIdx]) {
      intro.icpValue = extractText(cells[icpValueIdx]);
    }

    return intro;
  }

  /**
   * Helper function for fallback extraction using hardcoded indices
   */
  function extractByIndex(cells, intro, indexMap) {
    const introIdIdx = indexMap['Intro Id'];
    if (introIdIdx !== undefined && cells[introIdIdx]) {
      intro.introId = extractText(cells[introIdIdx]);
    }

    const handlerNameIdx = indexMap['Partner Handler'];
    if (handlerNameIdx !== undefined && cells[handlerNameIdx]) {
      intro.handlerName = extractText(cells[handlerNameIdx]);
    }

    const partnerCompanyIdx = indexMap['Partner Company'];
    if (cells[partnerCompanyIdx]) {
      intro.partnerCompany = extractText(cells[partnerCompanyIdx]);
      intro.partnerCompanyProfile = extractLinkedInUrl(cells[partnerCompanyIdx]);
    }

    const partnerNameIdx = indexMap['Partner Name'];
    if (cells[partnerNameIdx]) {
      intro.partnerName = extractText(cells[partnerNameIdx]);
      intro.partnerProfile = extractLinkedInUrl(cells[partnerNameIdx]);
    }

    const prospectNameIdx = indexMap['Prospect Name'];
    if (cells[prospectNameIdx]) {
      intro.prospectName = extractText(cells[prospectNameIdx]);
      intro.prospectProfile = extractLinkedInUrl(cells[prospectNameIdx]);
    }

    const prospectCompanyIdx = indexMap['Prospect Company Name'];
    if (cells[prospectCompanyIdx]) {
      intro.prospectCompany = extractText(cells[prospectCompanyIdx]);
      intro.prospectCompanyProfile = extractLinkedInUrl(cells[prospectCompanyIdx]);
    }

    const icpValueIdx = indexMap['ICP Value'];
    if (cells[icpValueIdx]) {
      intro.icpValue = extractText(cells[icpValueIdx]);
    }
  }

  /**
   * Extracts text content from an element
   */
  function extractText(element) {
    if (!element) return '';

    // Remove LinkedIn icon links before getting text
    const clone = element.cloneNode(true);
    const linkedInIcons = clone.querySelectorAll('a[href*="linkedin.com"]');
    linkedInIcons.forEach(icon => {
      // Only remove if it's just the icon without text
      if (icon.textContent.trim() === '' || icon.querySelector('img, svg')) {
        icon.remove();
      }
    });

    return clone.textContent?.trim() || '';
  }

  /**
   * Extracts LinkedIn URL from cell containing a LinkedIn icon link
   */
  function extractLinkedInUrl(cell) {
    if (!cell) return '';

    const linkedInLink = cell.querySelector('a[href*="linkedin.com"]');
    if (linkedInLink) {
      let href = linkedInLink.getAttribute('href');

      // Handle relative URLs
      if (href && href.startsWith('/')) {
        href = 'https://www.linkedin.com' + href;
      }

      // Clean up tracking parameters
      if (href) {
        try {
          const url = new URL(href);
          // Remove tracking params like ?miniProfileUrn=...
          url.search = '';
          return url.toString();
        } catch (e) {
          return href;
        }
      }

      return href || '';
    }

    return '';
  }

  /**
   * Sends intro data to n8n webhook
   */
  async function sendToN8N(intros) {
    console.log('[BairesDev Ingest] Sending to n8n:', intros);

    // Check if CONFIG is available
    if (typeof CONFIG === 'undefined') {
      throw new Error('CONFIG not loaded. Please check config.js');
    }

    const response = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${CONFIG.auth.username}:${CONFIG.auth.password}`)
      },
      body: JSON.stringify(intros)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n webhook failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('[BairesDev Ingest] n8n response:', result);

    return result;
  }

  /**
   * Shows a status message
   */
  function showStatus(type, message) {
    const statusDiv = document.getElementById('bairesdev-ingest-status');

    // Set styles based on type
    if (type === 'success') {
      statusDiv.style.background = '#d4edda';
      statusDiv.style.color = '#155724';
      statusDiv.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
      statusDiv.style.background = '#f8d7da';
      statusDiv.style.color = '#721c24';
      statusDiv.style.border = '1px solid #f5c6cb';
    } else if (type === 'info') {
      statusDiv.style.background = '#d1ecf1';
      statusDiv.style.color = '#0c5460';
      statusDiv.style.border = '1px solid #bee5eb';
    }

    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
  }

})();
