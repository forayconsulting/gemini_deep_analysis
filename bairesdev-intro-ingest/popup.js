/**
 * BairesDev Intro Ingest - Popup Script
 * Orchestrates scraping, company ID extraction, and webhook POST
 */

document.addEventListener('DOMContentLoaded', () => {
  const ingestButton = document.getElementById('ingestButton');
  const statusDiv = document.getElementById('status');
  const progressDiv = document.getElementById('progress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const resultsDiv = document.getElementById('results');
  const resultsText = document.getElementById('resultsText');

  ingestButton.addEventListener('click', handleIngestClick);

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractCompanyId') {
      handleCompanyIdExtraction(request.url)
        .then(companyId => sendResponse({ success: true, companyId }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open
    }
  });

  async function handleIngestClick() {
    try {
      // Disable button
      ingestButton.disabled = true;
      ingestButton.textContent = 'Processing...';

      // Hide previous status/results
      hideElement(statusDiv);
      hideElement(resultsDiv);

      // Show progress
      showElement(progressDiv);
      updateProgress(0, 'Checking current tab...');

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Verify we're on the BairesDev portal
      if (!tab.url.includes('handlers-referralsportal.bairesdev.com/intros')) {
        throw new Error('Please navigate to the BairesDev intros page first');
      }

      updateProgress(10, 'Scraping intros table...');

      // Send message to content script to scrape the table
      const response = await sendMessageToTab(tab.id, { action: 'scrapeIntros' });

      if (!response.success) {
        throw new Error(response.error || 'Failed to scrape intros table');
      }

      const intros = response.data;
      console.log('[Popup] Scraped intros:', intros);

      if (!intros || intros.length === 0) {
        throw new Error('No intros found on the page');
      }

      updateProgress(30, `Processing ${intros.length} intros...`);

      // Extract company IDs for prospect companies
      const introsWithJobs = await processCompanyJobsUrls(intros);

      updateProgress(70, 'Sending data to n8n...');

      // Send to n8n webhook
      await sendToN8N(introsWithJobs);

      updateProgress(100, 'Complete!');

      // Hide progress, show success
      hideElement(progressDiv);
      showStatus('success', `Successfully ingested ${introsWithJobs.length} intros!`);
      showResults(introsWithJobs);

    } catch (error) {
      console.error('[Popup] Error:', error);
      hideElement(progressDiv);
      showStatus('error', error.message);
    } finally {
      // Re-enable button
      ingestButton.disabled = false;
      ingestButton.textContent = 'Ingest Intros';
    }
  }

  /**
   * Processes intros to construct jobs URLs for prospect companies
   */
  async function processCompanyJobsUrls(intros) {
    const total = intros.length;

    for (let i = 0; i < intros.length; i++) {
      const intro = intros[i];
      const progress = 30 + Math.floor((i / total) * 40); // 30% to 70%

      updateProgress(
        progress,
        `Processing ${i + 1}/${total}: ${intro.prospectCompany || 'Unknown Company'}...`
      );

      // Skip if no prospect company profile URL
      if (!intro.prospectCompanyProfile) {
        console.warn('[Popup] No company profile URL for:', intro.prospectName);
        intro.prospectCompanyJobs = '';
        continue;
      }

      try {
        const companyId = await extractCompanyIdFromUrl(intro.prospectCompanyProfile);

        if (companyId) {
          intro.prospectCompanyJobs = `https://www.linkedin.com/jobs/search/?f_C=${companyId}&start=0`;
          console.log('[Popup] Constructed jobs URL:', intro.prospectCompanyJobs);
        } else {
          console.warn('[Popup] Could not extract company ID for:', intro.prospectCompanyProfile);
          intro.prospectCompanyJobs = '';
        }
      } catch (error) {
        console.error('[Popup] Error extracting company ID:', error);
        intro.prospectCompanyJobs = '';
      }

      // Add delay to avoid rate limiting
      if (i < intros.length - 1) {
        await sleep(2500); // 2.5 second delay between requests
      }
    }

    return intros;
  }

  /**
   * Extracts company ID from a LinkedIn company URL
   */
  async function extractCompanyIdFromUrl(companyUrl) {
    console.log('[Popup] Opening company page:', companyUrl);

    // Open the company page in a background tab
    const tab = await chrome.tabs.create({ url: companyUrl, active: false });

    // Wait for the tab to load
    await waitForTabComplete(tab.id);

    // Wait additional time for dynamic content
    await sleep(1000);

    // Inject script to extract company ID
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractCompanyIdFromPage
    });

    // Close the tab
    await chrome.tabs.remove(tab.id);

    const companyId = results[0]?.result;
    console.log('[Popup] Extracted company ID:', companyId);

    return companyId;
  }

  /**
   * This function runs in the context of the LinkedIn company page
   * Borrows logic from linkedin-intro-agent/content.js
   */
  function extractCompanyIdFromPage() {
    try {
      // Method 1: Extract from URL if it's numeric
      const urlMatch = window.location.href.match(/\/company\/(\d+)/);
      if (urlMatch) {
        return urlMatch[1];
      }

      // Method 2: Search page HTML for company URN
      const html = document.documentElement.outerHTML;
      const urnPatterns = [
        /urn:li:fsd_company:(\d+)/,
        /urn:li:fs_company:(\d+)/,
        /urn:li:organization:(\d+)/
      ];

      for (const pattern of urnPatterns) {
        const match = html.match(pattern);
        if (match) {
          return match[1];
        }
      }

      // Method 3: Look for "Show all jobs" link with f_C parameter
      const allJobsLink = document.querySelector('a[href*="f_C="]');
      if (allJobsLink) {
        const fCMatch = allJobsLink.href.match(/f_C=(\d+)/);
        if (fCMatch) {
          return fCMatch[1];
        }
      }

      return null;

    } catch (error) {
      console.error('Error extracting company ID:', error);
      return null;
    }
  }

  /**
   * Sends intro data to n8n webhook
   */
  async function sendToN8N(intros) {
    console.log('[Popup] Sending to n8n:', intros);

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
    console.log('[Popup] n8n response:', result);

    return result;
  }

  /**
   * Helper function to send message to tab
   */
  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Waits for a tab to finish loading
   */
  function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // Also check if tab is already complete
      chrome.tabs.get(tabId, (tab) => {
        if (tab.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
  }

  /**
   * Helper function to handle company ID extraction requests from content script
   */
  async function handleCompanyIdExtraction(url) {
    try {
      const companyId = await extractCompanyIdFromUrl(url);
      return companyId;
    } catch (error) {
      console.error('[Popup] Error in handleCompanyIdExtraction:', error);
      throw error;
    }
  }

  /**
   * UI Helper Functions
   */

  function updateProgress(percentage, text) {
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = text;
  }

  function showStatus(type, message) {
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    showElement(statusDiv);
  }

  function showResults(intros) {
    const summary = [
      `Total intros: ${intros.length}`,
      `With jobs URLs: ${intros.filter(i => i.prospectCompanyJobs).length}`,
      `Partners: ${new Set(intros.map(i => i.partnerName)).size}`,
      `Prospects: ${intros.length}`
    ];

    resultsText.textContent = summary.join('\n');
    showElement(resultsDiv);
  }

  function showElement(element) {
    element.classList.remove('hidden');
  }

  function hideElement(element) {
    element.classList.add('hidden');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
