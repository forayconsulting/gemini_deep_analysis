/**
 * Page Detector - Content Script
 * Runs on BairesDev referrals portal to detect and extract LinkedIn URLs
 * Stores detected profiles for use by popup
 */

(() => {
    console.log('LinkedIn Intro Agent: Page detector loaded');

    // Detect table column indexes for Partner and Prospect names
    function detectTableColumns() {
        const tables = document.querySelectorAll('table');

        for (const table of tables) {
            const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
            if (!headerRow) continue;

            const headers = Array.from(headerRow.querySelectorAll('th, td'));
            const columns = {
                partnerCol: -1,
                prospectCol: -1
            };

            headers.forEach((header, index) => {
                const text = header.textContent.trim().toLowerCase();

                if (text.includes('partner') && text.includes('name')) {
                    columns.partnerCol = index;
                }
                if (text.includes('prospect') && text.includes('name')) {
                    columns.prospectCol = index;
                }
            });

            // If we found at least one column, return this table's config
            if (columns.partnerCol >= 0 || columns.prospectCol >= 0) {
                console.log('Detected columns:', columns);
                return columns;
            }
        }

        return { partnerCol: -1, prospectCol: -1 };
    }

    // Extract name from table cell
    function extractNameFromCell(row, columnIndex) {
        if (columnIndex < 0) return null;

        const cells = row.querySelectorAll('td, th');
        if (cells[columnIndex]) {
            const text = cells[columnIndex].textContent.trim();
            // Filter out empty strings and LinkedIn URLs
            if (text && !text.includes('linkedin.com')) {
                return text;
            }
        }
        return null;
    }

    // Truncate LinkedIn URL to username
    function truncateUrl(url) {
        try {
            const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
            if (!match) return 'LinkedIn Profile';

            const username = match[1];
            if (username.length <= 25) return username;

            // Truncate at word boundary or hyphen
            const truncated = username.substring(0, 22);
            const lastHyphen = truncated.lastIndexOf('-');

            if (lastHyphen > 15) {
                return truncated.substring(0, lastHyphen) + '...';
            }

            return truncated + '...';
        } catch (e) {
            return 'LinkedIn Profile';
        }
    }

    // Store detected profiles in extension storage
    function storeDetectedProfiles() {
        const linkedInLinks = [];
        const links = document.querySelectorAll('a[href*="linkedin.com/in/"]');

        // Detect table columns
        const columns = detectTableColumns();

        links.forEach((link, index) => {
            const url = link.href;
            let name = null;
            let role = null;
            const row = link.closest('tr');

            if (row) {
                // Find which cell this link is in
                const linkCell = link.closest('td, th');
                const cells = Array.from(row.querySelectorAll('td, th'));
                const linkCellIndex = linkCell ? cells.indexOf(linkCell) : -1;

                // First, try to get the name from the link cell itself or adjacent cells
                // LinkedIn links are often in a column with the person's name
                if (linkCell) {
                    // Try link text first
                    const linkText = link.textContent?.trim();
                    if (linkText && linkText.length > 2 && linkText.length < 50 && !linkText.includes('linkedin.com')) {
                        name = linkText;
                    }

                    // If link text is empty/icon, try the cell text
                    if (!name) {
                        const cellText = linkCell.textContent?.trim();
                        if (cellText && cellText.length > 2 && cellText.length < 50 && !cellText.includes('linkedin.com')) {
                            name = cellText;
                        }
                    }

                    // If still no name, try adjacent cells (usually name is before or after the link)
                    if (!name && linkCellIndex >= 0) {
                        // Try cell before the link
                        if (linkCellIndex > 0) {
                            const prevCellText = cells[linkCellIndex - 1]?.textContent?.trim();
                            if (prevCellText && prevCellText.length > 2 && prevCellText.length < 50 &&
                                !prevCellText.includes('linkedin.com') && !prevCellText.match(/^\d+$/)) {
                                name = prevCellText;
                            }
                        }

                        // Try cell after the link
                        if (!name && linkCellIndex < cells.length - 1) {
                            const nextCellText = cells[linkCellIndex + 1]?.textContent?.trim();
                            if (nextCellText && nextCellText.length > 2 && nextCellText.length < 50 &&
                                !nextCellText.includes('linkedin.com') && !nextCellText.match(/^\d+$/)) {
                                name = nextCellText;
                            }
                        }
                    }
                }

                // Determine role based on which column the link is in or near
                if (linkCellIndex >= 0) {
                    // Check if link is in or adjacent to partner column (within 2 columns)
                    if (columns.partnerCol >= 0 && Math.abs(linkCellIndex - columns.partnerCol) <= 2) {
                        role = 'partner';
                    }
                    // Check if link is in or adjacent to prospect column (within 2 columns)
                    else if (columns.prospectCol >= 0 && Math.abs(linkCellIndex - columns.prospectCol) <= 2) {
                        role = 'prospect';
                    }
                    // Fallback: if link is in later columns, assume prospect
                    else if (linkCellIndex > 5) {
                        role = 'prospect';
                    }
                }
            }

            // Fallback: Use truncated URL if still no name
            if (!name) {
                name = truncateUrl(url);
            }

            // Fallback role assignment: first link is partner, rest are prospects
            if (!role) {
                role = index === 0 ? 'partner' : 'prospect';
            }

            // Avoid duplicates (check both URL and name to catch same person with same URL appearing multiple times)
            const normalizedUrl = normalizeLinkedInUrl(url);
            const isDuplicate = linkedInLinks.some(l =>
                l.url === normalizedUrl ||
                (l.name === name && l.role === role && name && name !== 'LinkedIn Profile')
            );

            if (url && !isDuplicate) {
                linkedInLinks.push({
                    url: normalizedUrl,
                    name: name,
                    fullName: name, // For tooltip
                    role: role
                });
                console.log(`LinkedIn Intro Agent: Added ${role}:`, name, normalizedUrl);
            } else if (isDuplicate) {
                console.log(`LinkedIn Intro Agent: Skipped duplicate ${role}:`, name, normalizedUrl);
            }
        });

        if (linkedInLinks.length > 0) {
            // Log summary
            const partners = linkedInLinks.filter(p => p.role === 'partner');
            const prospects = linkedInLinks.filter(p => p.role === 'prospect');
            console.log(`LinkedIn Intro Agent: Detected ${partners.length} partner(s) and ${prospects.length} prospect(s)`);
            console.log('Partners:', partners.map(p => p.name));
            console.log('Prospects:', prospects.map(p => p.name));

            chrome.storage.local.set({
                'detectedLinkedInProfiles': linkedInLinks,
                'detectedLinkedInProfilesTimestamp': Date.now()
            });
        }
    }

    // Normalize LinkedIn URLs
    function normalizeLinkedInUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '');
        } catch (e) {
            return url;
        }
    }

    // Run detection on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', storeDetectedProfiles);
    } else {
        storeDetectedProfiles();
    }

    // Re-run detection when DOM changes (for SPAs)
    const observer = new MutationObserver(() => {
        storeDetectedProfiles();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Clean up observer after 30 seconds (page should be stable by then)
    setTimeout(() => {
        observer.disconnect();
    }, 30000);
})();
