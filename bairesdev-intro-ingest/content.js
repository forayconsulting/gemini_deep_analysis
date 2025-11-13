/**
 * BairesDev Intro Ingest - Content Script
 * Scrapes intro data from the BairesDev referrals portal table
 */

(function() {
  'use strict';

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeIntros') {
      scrapeIntrosTable()
        .then(intros => sendResponse({ success: true, data: intros }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response
    }
  });

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
        const intro = await extractIntroFromRow(row);
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
   * Extracts intro data from a single table row
   */
  async function extractIntroFromRow(row) {
    const cells = Array.from(row.querySelectorAll('td'));

    // Based on the BairesDev portal table structure:
    // Columns: Intro Id, Partner Type, Partner Company, Partner Name, Intro Status,
    //          Intro Substatus, Prospect Name, Prospect Company Name, Prospect Role

    const intro = {
      partnerName: '',
      partnerProfile: '',
      partnerCompany: '',
      partnerCompanyProfile: '',
      prospectName: '',
      prospectProfile: '',
      prospectCompany: '',
      prospectCompanyProfile: '',
      prospectCompanyJobs: ''
    };

    // Extract Partner Company (column 2)
    const partnerCompanyCell = cells[2];
    if (partnerCompanyCell) {
      intro.partnerCompany = extractText(partnerCompanyCell);
      intro.partnerCompanyProfile = extractLinkedInUrl(partnerCompanyCell);
    }

    // Extract Partner Name (column 3)
    const partnerNameCell = cells[3];
    if (partnerNameCell) {
      intro.partnerName = extractText(partnerNameCell);
      intro.partnerProfile = extractLinkedInUrl(partnerNameCell);
    }

    // Extract Prospect Name (column 6)
    const prospectNameCell = cells[6];
    if (prospectNameCell) {
      intro.prospectName = extractText(prospectNameCell);
      intro.prospectProfile = extractLinkedInUrl(prospectNameCell);
    }

    // Extract Prospect Company (column 7)
    const prospectCompanyCell = cells[7];
    if (prospectCompanyCell) {
      intro.prospectCompany = extractText(prospectCompanyCell);
      intro.prospectCompanyProfile = extractLinkedInUrl(prospectCompanyCell);
    }

    // Construct prospect company jobs URL if we have a company profile URL
    if (intro.prospectCompanyProfile) {
      try {
        intro.prospectCompanyJobs = await constructJobsUrl(intro.prospectCompanyProfile);
      } catch (error) {
        console.error('[BairesDev Ingest] Error constructing jobs URL:', error);
        intro.prospectCompanyJobs = ''; // Leave empty if we can't construct it
      }
    }

    return intro;
  }

  /**
   * Extracts text content from an element
   */
  function extractText(element) {
    if (!element) return '';

    // Remove LinkedIn icon spans before getting text
    const clone = element.cloneNode(true);
    const linkedInIcons = clone.querySelectorAll('a[href*="linkedin.com"]');
    linkedInIcons.forEach(icon => {
      // Only remove if it's just the icon without text
      if (icon.textContent.trim() === '' || icon.querySelector('img')) {
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
      const href = linkedInLink.getAttribute('href');

      // Handle relative URLs
      if (href && href.startsWith('/')) {
        return 'https://www.linkedin.com' + href;
      }

      return href || '';
    }

    return '';
  }

  /**
   * Constructs LinkedIn jobs URL from company profile URL
   * Opens the company page, extracts company ID, builds jobs search URL
   */
  async function constructJobsUrl(companyProfileUrl) {
    if (!companyProfileUrl) return '';

    console.log('[BairesDev Ingest] Constructing jobs URL for:', companyProfileUrl);

    // Open the company page in a background tab and extract company ID
    const companyId = await openTabAndExtractCompanyId(companyProfileUrl);

    if (!companyId) {
      console.warn('[BairesDev Ingest] Could not extract company ID from:', companyProfileUrl);
      return '';
    }

    // Construct the jobs search URL
    const jobsUrl = `https://www.linkedin.com/jobs/search/?f_C=${companyId}&start=0`;
    console.log('[BairesDev Ingest] Constructed jobs URL:', jobsUrl);

    return jobsUrl;
  }

  /**
   * Opens a LinkedIn company page in a background tab and extracts the company ID
   */
  function openTabAndExtractCompanyId(companyUrl) {
    return new Promise((resolve, reject) => {
      // Send message to background/popup to open tab and extract company ID
      chrome.runtime.sendMessage(
        { action: 'extractCompanyId', url: companyUrl },
        response => {
          if (response && response.success) {
            resolve(response.companyId);
          } else {
            reject(new Error(response?.error || 'Failed to extract company ID'));
          }
        }
      );
    });
  }

})();
