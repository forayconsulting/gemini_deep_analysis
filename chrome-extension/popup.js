document.addEventListener('DOMContentLoaded', () => {
    const actionBtn = document.getElementById('actionBtn');
    const captureBtn = document.getElementById('captureBtn');
    const deepCaptureBtn = document.getElementById('deepCaptureBtn');
    const responseDiv = document.getElementById('response');
    const captureStatus = document.getElementById('captureStatus');
    const systemPromptInput = document.getElementById('systemPrompt');
    const userPromptInput = document.getElementById('userPrompt');
    const excludeDomainsInput = document.getElementById('excludeDomains');

    let capturedContent = '';

    actionBtn.addEventListener('click', async () => {
        const systemPrompt = systemPromptInput.value.trim();
        const userPrompt = userPromptInput.value.trim();

        if (!userPrompt) {
            responseDiv.textContent = 'Please enter a message';
            responseDiv.classList.add('active');
            return;
        }

        responseDiv.textContent = 'Thinking...';
        responseDiv.classList.add('active');
        actionBtn.disabled = true;

        chrome.runtime.sendMessage({
            action: 'callGemini',
            systemPrompt: systemPrompt || 'You identify the arguments and ideas in featured articles. Summarize the arguments provided, identifying primary arguments versus secondary/supporting ones, syllogisms, and any fallacies. Present a "steel man" argument from the opposing view. Please note that, alongside the primary article, any linked pages or supplementary content has also been fetched and inserted within the place in the article where it was linked. Use this as a way to gain extra insight into the author\'s thought process and argumentation.',
            userPrompt: userPrompt
        }, (response) => {
            if (response && response.success) {
                responseDiv.textContent = response.message;
            } else {
                responseDiv.textContent = `Error: ${response.error || 'Failed to get response'}`;
            }
            actionBtn.disabled = false;
        });
    });

    userPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            actionBtn.click();
        }
    });

    captureBtn.addEventListener('click', async () => {
        try {
            captureBtn.disabled = true;
            captureStatus.textContent = 'Capturing page...';
            captureStatus.style.color = '#667eea';

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            if (results && results[0] && results[0].result) {
                capturedContent = results[0].result;

                const currentText = userPromptInput.value;
                const newText = currentText ? `${currentText}\n\nPage content:\n${capturedContent}` : `Page content:\n${capturedContent}`;
                userPromptInput.value = newText;

                captureStatus.textContent = '✓ Content captured';
                captureStatus.style.color = '#10b981';

                // Enable deep capture button
                deepCaptureBtn.disabled = false;

                setTimeout(() => {
                    captureStatus.textContent = '';
                }, 2000);
            } else {
                captureStatus.textContent = 'No content found';
                captureStatus.style.color = '#ef4444';
            }
        } catch (error) {
            console.error('Error capturing content:', error);
            captureStatus.textContent = 'Failed to capture';
            captureStatus.style.color = '#ef4444';
        } finally {
            captureBtn.disabled = false;
        }
    });

    deepCaptureBtn.addEventListener('click', async () => {
        try {
            deepCaptureBtn.disabled = true;

            // Extract URLs from the textarea content (not the stored variable)
            const urlPattern = /\[([^\]]+)\|([^\]]+)\]/g;
            const textareaContent = userPromptInput.value;
            const matches = [...textareaContent.matchAll(urlPattern)];

            console.log('Extracting URLs from textarea content');
            console.log('Found', matches.length, 'links in textarea');

            if (matches.length === 0) {
                captureStatus.textContent = 'No links found in textarea content';
                captureStatus.style.color = '#ef4444';
                console.log('First 500 chars of textarea:', textareaContent.substring(0, 500));
                return;
            }

            // Get excluded domains
            const excludedDomains = excludeDomainsInput.value
                .split(',')
                .map(d => d.trim().toLowerCase())
                .filter(d => d.length > 0);

            // Filter URLs
            const urlsToScrape = [];
            for (const match of matches) { // Process all links
                const linkText = match[1];
                const url = match[2];

                try {
                    const urlObj = new URL(url);
                    const hostname = urlObj.hostname.toLowerCase();

                    // Check if domain should be excluded
                    const shouldExclude = excludedDomains.some(domain =>
                        hostname.includes(domain)
                    );

                    if (!shouldExclude) {
                        urlsToScrape.push({ text: linkText, url: url });
                    }
                } catch (e) {
                    console.error('Invalid URL:', url);
                }
            }

            if (urlsToScrape.length === 0) {
                captureStatus.textContent = 'All links were excluded';
                captureStatus.style.color = '#ef4444';
                return;
            }

            let successCount = 0;

            // Helper function to escape special regex characters
            function escapeRegex(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            // Scrape each URL
            const failedUrls = [];
            for (let i = 0; i < urlsToScrape.length; i++) {
                const { text, url } = urlsToScrape[i];
                captureStatus.textContent = `Capturing ${i + 1} of ${urlsToScrape.length}...`;

                try {
                    // Create a new tab
                    const newTab = await chrome.tabs.create({
                        url: url,
                        active: false
                    });

                    // Wait for tab to complete loading
                    await new Promise((resolve) => {
                        const listener = (tabId, changeInfo) => {
                            if (tabId === newTab.id && changeInfo.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);
                                resolve();
                            }
                        };
                        chrome.tabs.onUpdated.addListener(listener);

                        // Fallback timeout after 10 seconds
                        setTimeout(() => {
                            chrome.tabs.onUpdated.removeListener(listener);
                            console.log(`Timeout waiting for ${url} to load`);
                            resolve();
                        }, 10000);
                    });

                    // Additional wait for dynamic content
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Scrape the new tab
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: newTab.id },
                        files: ['content.js']
                    });

                    console.log(`Results for ${url}:`, results);

                    if (results && results[0]) {
                        if (results[0].result) {
                            const linkedContent = results[0].result;

                            // Create the pattern to search for
                            const escapedText = escapeRegex(text);
                            const escapedUrl = escapeRegex(url);
                            const linkPattern = `\\[${escapedText}\\|${escapedUrl}\\]`;
                            const regex = new RegExp(linkPattern, 'g');

                            // Get current content and check if pattern exists
                            const currentContent = userPromptInput.value;
                            const patternExists = regex.test(currentContent);

                            if (patternExists) {
                                // Reset regex after test
                                regex.lastIndex = 0;

                                // Create the replacement with linked content
                                const insertion = `[${text}|${url}]\n--- Linked Content: ${text} ---\n${linkedContent}\n--- End Linked Content ---`;
                                const updatedContent = currentContent.replace(regex, insertion);

                                // Update UI immediately
                                userPromptInput.value = updatedContent;
                                successCount++;
                                console.log(`Successfully captured and inserted content for ${url}`);
                            } else {
                                console.log(`Pattern [${text}|${url}] not found in current content`);
                                console.log('Searching for regex:', linkPattern);
                                console.log('First occurrence of URL in textarea:', currentContent.indexOf(url));
                                console.log('Sample of textarea around that position:', currentContent.substring(Math.max(0, currentContent.indexOf(url) - 50), currentContent.indexOf(url) + 100));
                                failedUrls.push(`${url} (pattern not found)`);
                            }
                        } else {
                            console.log(`No content returned for ${url}`);
                            failedUrls.push(url);
                        }
                    } else {
                        console.log(`Script injection failed for ${url}`);
                        failedUrls.push(url);
                    }

                    // Close the tab
                    await chrome.tabs.remove(newTab.id);

                } catch (error) {
                    console.error(`Error scraping ${url}:`, error);
                    failedUrls.push(url);

                    // Try to close tab if it exists
                    try {
                        const tabs = await chrome.tabs.query({ url: url });
                        for (const tab of tabs) {
                            await chrome.tabs.remove(tab.id);
                        }
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
            }

            if (successCount > 0) {
                let statusMessage = `✓ Captured ${successCount} of ${urlsToScrape.length} pages`;
                if (failedUrls.length > 0) {
                    statusMessage += ` (check console for failed URLs)`;
                    console.log('Failed to capture:', failedUrls);
                }
                captureStatus.textContent = statusMessage;
                captureStatus.style.color = '#10b981';
            } else {
                captureStatus.textContent = `Failed to capture any pages (check console)`;
                captureStatus.style.color = '#ef4444';
                console.log('All captures failed. URLs attempted:', urlsToScrape.map(u => u.url));
            }

            setTimeout(() => {
                captureStatus.textContent = '';
            }, 5000);

        } catch (error) {
            console.error('Error in deep capture:', error);
            captureStatus.textContent = 'Deep capture failed';
            captureStatus.style.color = '#ef4444';
        } finally {
            deepCaptureBtn.disabled = false;
        }
    });
});