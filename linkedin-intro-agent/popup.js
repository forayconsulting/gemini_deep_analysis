document.addEventListener('DOMContentLoaded', async () => {
    const handlerUrlInput = document.getElementById('handlerUrl');
    const prospectUrlInput = document.getElementById('prospectUrl');
    const partnerSelect = document.getElementById('partnerSelect');
    const prospectSelect = document.getElementById('prospectSelect');
    const autoDetectedSection = document.getElementById('autoDetectedSection');
    const manualInputSection = document.getElementById('manualInputSection');
    const depthSelect = document.getElementById('depthSelect');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    const regenerateBtn = document.getElementById('regenerateBtn');
    const statusDiv = document.getElementById('status');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const emailOutput = document.getElementById('emailOutput');
    const emailText = document.getElementById('emailText');

    let lastExplorationResult = null;

    // Initialize popup with appropriate mode
    await initializePopup();

    async function initializePopup() {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (currentTab.url && currentTab.url.includes('handlers-referralsportal.bairesdev.com')) {
            // Check storage for detected profiles
            const { detectedLinkedInProfiles } = await chrome.storage.local.get('detectedLinkedInProfiles');

            if (detectedLinkedInProfiles && detectedLinkedInProfiles.length > 0) {
                // Show dropdown mode
                showAutoDetectedMode(detectedLinkedInProfiles);
            } else {
                // Show manual mode
                showManualMode();
            }
        } else {
            // Not on BairesDev portal, always show manual mode
            showManualMode();
        }
    }

    function showAutoDetectedMode(profiles) {
        autoDetectedSection.style.display = 'block';
        manualInputSection.style.display = 'none';
        populateDropdowns(profiles);
    }

    function showManualMode() {
        autoDetectedSection.style.display = 'none';
        manualInputSection.style.display = 'block';
    }

    function populateDropdowns(profiles) {
        // Clear existing options
        partnerSelect.innerHTML = '';
        prospectSelect.innerHTML = '<option value="">Select prospect...</option>';

        // Separate partners and prospects
        const partners = profiles.filter(p => p.role === 'partner');
        const prospects = profiles.filter(p => p.role === 'prospect');

        // Populate partner dropdown
        partners.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.url;
            option.textContent = profile.name;
            option.title = profile.fullName || profile.url; // Full name/URL on hover
            partnerSelect.appendChild(option);
        });

        // Auto-select first partner
        if (partners.length > 0) {
            partnerSelect.value = partners[0].url;
        }

        // Populate prospect dropdown
        prospects.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.url;
            option.textContent = profile.name;
            option.title = profile.fullName || profile.url;
            prospectSelect.appendChild(option);
        });

        // Show status
        if (partners.length > 0 && prospects.length > 0) {
            showStatus(`Detected ${partners.length} partner(s) and ${prospects.length} prospect(s)`, 'success');
        } else if (partners.length > 0) {
            showStatus(`Detected ${partners.length} partner(s)`, 'success');
        }
    }

    // Listen for storage changes (when pageDetector updates profiles)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.detectedLinkedInProfiles) {
            const profiles = changes.detectedLinkedInProfiles.newValue;
            if (profiles && profiles.length > 0) {
                showAutoDetectedMode(profiles);
            }
        }
    });

    // Generate intro email
    generateBtn.addEventListener('click', async () => {
        let handlerUrl, prospectUrl;

        // Check which mode is active
        if (autoDetectedSection.style.display !== 'none') {
            // Dropdown mode
            handlerUrl = partnerSelect.value;
            prospectUrl = prospectSelect.value;

            if (!handlerUrl || !prospectUrl) {
                showStatus('Please select both partner and prospect', 'error');
                if (!prospectUrl) {
                    prospectSelect.focus();
                }
                return;
            }
        } else {
            // Manual mode
            handlerUrl = handlerUrlInput.value.trim();
            prospectUrl = prospectUrlInput.value.trim();

            if (!handlerUrl || !prospectUrl) {
                showStatus('Please enter both LinkedIn URLs', 'error');
                return;
            }

            if (!handlerUrl.includes('linkedin.com') || !prospectUrl.includes('linkedin.com')) {
                showStatus('Please enter valid LinkedIn URLs', 'error');
                return;
            }
        }

        const depth = parseInt(depthSelect.value);

        // Disable button during processing
        generateBtn.disabled = true;
        emailOutput.style.display = 'none';

        try {
            // Show progress
            showStatus('Starting LinkedIn exploration...', 'processing');
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';

            // Create explorer instance
            const explorer = new LinkedInRecursiveExplorer({
                maxDepth: depth,
                maxPages: 20,
                requestDelay: 2500,
                onProgress: (progress) => {
                    const percentage = Math.min((progress.current / Math.max(progress.total, 1)) * 100, 95);
                    progressBar.style.width = `${percentage}%`;

                    let statusText = 'Exploring';
                    if (progress.url.includes('/in/')) {
                        statusText = 'Analyzing profile';
                    } else if (progress.url.includes('/company/')) {
                        statusText = 'Checking company';
                    } else if (progress.url.includes('/school/')) {
                        statusText = 'Checking school';
                    }

                    showStatus(`${statusText}... (${progress.current}/${progress.total})`, 'processing');
                }
            });

            // Explore profiles
            const result = await explorer.explore(handlerUrl, prospectUrl);

            if (!result.success) {
                throw new Error(result.error || 'Exploration failed');
            }

            lastExplorationResult = result;

            // Update progress
            progressBar.style.width = '100%';
            showStatus('Generating introduction email with Gemini...', 'processing');

            // Generate email via background script
            const emailResult = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'generateIntroEmail',
                    handlerData: result.handlerData,
                    prospectData: result.prospectData,
                    connections: result.connections,
                    allData: result.allData
                }, (response) => {
                    if (response && response.success) {
                        resolve(response.email);
                    } else {
                        reject(new Error(response.error || 'Failed to generate email'));
                    }
                });
            });

            // Display email
            emailText.value = emailResult;
            emailOutput.style.display = 'block';
            progressContainer.style.display = 'none';
            showStatus('✓ Introduction email generated!', 'success');

        } catch (error) {
            console.error('Error generating intro:', error);
            showStatus(`Error: ${error.message}`, 'error');
            progressContainer.style.display = 'none';
        } finally {
            generateBtn.disabled = false;
        }
    });

    // Copy email to clipboard
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(emailText.value);
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy Email';
            }, 2000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            showStatus('Failed to copy to clipboard', 'error');
        }
    });

    // Regenerate email
    regenerateBtn.addEventListener('click', async () => {
        if (!lastExplorationResult) {
            showStatus('No previous exploration data available', 'error');
            return;
        }

        regenerateBtn.disabled = true;
        showStatus('Regenerating email...', 'processing');

        try {
            const emailResult = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'generateIntroEmail',
                    handlerData: lastExplorationResult.handlerData,
                    prospectData: lastExplorationResult.prospectData,
                    connections: lastExplorationResult.connections,
                    allData: lastExplorationResult.allData,
                    regenerate: true
                }, (response) => {
                    if (response && response.success) {
                        resolve(response.email);
                    } else {
                        reject(new Error(response.error || 'Failed to generate email'));
                    }
                });
            });

            emailText.value = emailResult;
            showStatus('✓ Email regenerated!', 'success');

        } catch (error) {
            console.error('Error regenerating email:', error);
            showStatus(`Error: ${error.message}`, 'error');
        } finally {
            regenerateBtn.disabled = false;
        }
    });

    // Helper: Show status message
    function showStatus(message, type = 'processing') {
        statusDiv.textContent = message;
        statusDiv.className = `status active ${type}`;

        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                statusDiv.className = 'status';
            }, 5000);
        }
    }

    // Validate LinkedIn URLs on input
    function validateLinkedInUrl(input) {
        const url = input.value.trim();
        if (url && !url.includes('linkedin.com')) {
            input.style.borderColor = '#ef4444';
        } else {
            input.style.borderColor = '';
        }
    }

    handlerUrlInput.addEventListener('blur', () => validateLinkedInUrl(handlerUrlInput));
    prospectUrlInput.addEventListener('blur', () => validateLinkedInUrl(prospectUrlInput));
});
