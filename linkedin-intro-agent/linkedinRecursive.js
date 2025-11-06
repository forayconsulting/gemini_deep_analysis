/**
 * LinkedIn Recursive Explorer
 * Recursively scrapes LinkedIn profiles and related entities to find connection points
 */

class LinkedInRecursiveExplorer {
    constructor(options = {}) {
        this.maxDepth = options.maxDepth || 2;
        this.maxPages = options.maxPages || 20;
        this.requestDelay = options.requestDelay || 2500; // 2.5 seconds between requests
        this.visitedUrls = new Set();
        this.profileData = new Map(); // url -> data
        this.scrapeQueue = [];
        this.currentDepth = 0;
        this.totalPages = 0;
        this.onProgress = options.onProgress || (() => {});
    }

    /**
     * Main entry point - explore two LinkedIn profiles and find connections
     */
    async explore(handlerUrl, prospectUrl) {
        // Normalize URLs first to ensure consistent lookups
        handlerUrl = this.normalizeLinkedInUrl(handlerUrl);
        prospectUrl = this.normalizeLinkedInUrl(prospectUrl);

        console.log('Starting LinkedIn exploration:', { handlerUrl, prospectUrl, maxDepth: this.maxDepth });

        try {
            // Initialize queue with both profiles at depth 0
            this.scrapeQueue.push({ url: handlerUrl, depth: 0, type: 'handler' });
            this.scrapeQueue.push({ url: prospectUrl, depth: 0, type: 'prospect' });

            // Process queue using breadth-first search
            while (this.scrapeQueue.length > 0 && this.totalPages < this.maxPages) {
                const item = this.scrapeQueue.shift();

                if (this.visitedUrls.has(item.url)) {
                    continue;
                }

                if (item.depth > this.maxDepth) {
                    continue;
                }

                await this.scrapePage(item.url, item.depth, item.type);
                await this.delay(this.requestDelay);
            }

            // Get the two main profiles
            const handlerData = this.profileData.get(handlerUrl);
            const prospectData = this.profileData.get(prospectUrl);

            if (!handlerData || !prospectData) {
                console.error('Profile data lookup failed:', {
                    handlerUrl,
                    prospectUrl,
                    hasHandler: !!handlerData,
                    hasProspect: !!prospectData,
                    allUrls: Array.from(this.profileData.keys())
                });
                throw new Error('Failed to extract main profile data. Check console for details.');
            }

            // Validate that profiles are valid
            if (handlerData.type === 'unknown' || prospectData.type === 'unknown') {
                console.error('Invalid profile type detected:', {
                    handler: handlerData,
                    prospect: prospectData
                });
                throw new Error('One or both profiles could not be properly parsed from LinkedIn');
            }

            // Analyze connections
            const connections = this.findConnections(handlerData, prospectData);

            return {
                success: true,
                handlerData,
                prospectData,
                connections,
                allData: Array.from(this.profileData.values())
            };

        } catch (error) {
            console.error('Exploration error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Scrape a single LinkedIn page
     */
    async scrapePage(url, depth, type) {
        if (this.visitedUrls.has(url)) {
            return;
        }

        this.visitedUrls.add(url);
        this.totalPages++;

        this.onProgress({
            status: 'scraping',
            url,
            depth,
            current: this.totalPages,
            total: this.scrapeQueue.length + this.totalPages
        });

        console.log(`Scraping [depth ${depth}]: ${url}`);

        try {
            // Check cache first
            const cachedData = await this.getCachedData(url);
            if (cachedData) {
                console.log('Using cached data for:', url);
                this.profileData.set(url, cachedData);
                this.queueLinkedUrls(cachedData, depth);
                return;
            }

            // Open URL in background tab
            const tab = await chrome.tabs.create({
                url: url,
                active: false
            });

            // Wait for tab to load
            await this.waitForTabComplete(tab.id);

            // Additional wait for dynamic content
            await this.delay(2000);

            // Inject content script and extract data
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Close the tab
            await chrome.tabs.remove(tab.id);

            if (results && results[0] && results[0].result) {
                const data = results[0].result;
                data.explorationDepth = depth;
                data.explorationType = type;

                this.profileData.set(url, data);

                // Cache the data
                await this.cacheData(url, data);

                // Queue linked URLs for next depth level
                if (depth < this.maxDepth) {
                    this.queueLinkedUrls(data, depth);
                }

                // Special handling: Queue current company's jobs pages for both handler and prospect
                if ((type === 'handler' || type === 'prospect') && data.type === 'profile' && data.experience && data.experience.length > 0) {
                    const currentJob = data.experience[0]; // First experience is typically current
                    if (currentJob.companyUrl && currentJob.duration && currentJob.duration.includes('Present')) {
                        // First, try to find company data to get company ID
                        const normalizedCompanyUrl = this.normalizeLinkedInUrl(currentJob.companyUrl);
                        const companyData = this.profileData.get(normalizedCompanyUrl);

                        let jobUrls = [];

                        if (companyData && companyData.companyId) {
                            // Build advanced jobs URL with f_C parameter
                            console.log(`Building advanced jobs URL for ${type} company (ID: ${companyData.companyId})`);

                            // Queue multiple pages for pagination (0, 25, 50)
                            for (let offset = 0; offset <= 50; offset += 25) {
                                const advancedUrl = `https://www.linkedin.com/jobs/search/?f_C=${companyData.companyId}&start=${offset}`;
                                jobUrls.push(advancedUrl);
                            }
                        } else {
                            // Fallback to simple /jobs URL
                            console.log(`Using simple jobs URL for ${type} company (no ID available yet)`);
                            const simpleJobsUrl = `${normalizedCompanyUrl}/jobs`;
                            jobUrls.push(simpleJobsUrl);
                        }

                        // Queue all job URLs
                        jobUrls.forEach((jobsUrl, index) => {
                            if (!this.visitedUrls.has(jobsUrl) && this.totalPages + this.scrapeQueue.length < this.maxPages) {
                                this.scrapeQueue.push({
                                    url: jobsUrl,
                                    depth: depth + 1,
                                    type: `${type}_company_jobs${index > 0 ? '_page' + (index + 1) : ''}`
                                });
                                console.log(`Queued jobs page: ${jobsUrl}`);
                            }
                        });
                    }
                }

                // Special handling: After scraping a company page, queue its jobs if we now have the ID
                if (data.type === 'company' && data.companyId) {
                    console.log(`Company page scraped with ID ${data.companyId}, queueing advanced jobs URLs`);

                    // Queue multiple pages for pagination
                    for (let offset = 0; offset <= 50; offset += 25) {
                        const advancedUrl = `https://www.linkedin.com/jobs/search/?f_C=${data.companyId}&start=${offset}`;

                        if (!this.visitedUrls.has(advancedUrl) && this.totalPages + this.scrapeQueue.length < this.maxPages) {
                            this.scrapeQueue.push({
                                url: advancedUrl,
                                depth: depth + 1,
                                type: 'company_jobs'
                            });
                            console.log(`Queued advanced jobs page: ${advancedUrl}`);
                        }
                    }
                }

                console.log(`Successfully scraped: ${url}`, {
                    type: data.type,
                    name: data.name || data.companyName || data.school || 'Unknown',
                    hasExperience: !!data.experience?.length,
                    hasEducation: !!data.education?.length,
                    hasJobs: data.type === 'company_jobs' ? data.jobs?.length || 0 : undefined
                });
            } else {
                console.error('No data extracted from:', url);
            }

        } catch (error) {
            console.error(`Error scraping ${url}:`, error);

            // Try to close tab if it still exists
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

    /**
     * Queue linked URLs for next depth level
     */
    queueLinkedUrls(data, currentDepth) {
        if (!data.linkedUrls || currentDepth >= this.maxDepth) {
            return;
        }

        const nextDepth = currentDepth + 1;

        // Prioritize company and school URLs
        const priorityUrls = data.linkedUrls.filter(url =>
            url.includes('/company/') || url.includes('/school/')
        );

        // Limit to top 3 linked entities per profile to avoid explosion
        const urlsToQueue = priorityUrls.slice(0, 3);

        urlsToQueue.forEach(url => {
            if (!this.visitedUrls.has(url) && this.totalPages + this.scrapeQueue.length < this.maxPages) {
                this.scrapeQueue.push({
                    url: this.normalizeLinkedInUrl(url),
                    depth: nextDepth,
                    type: 'linked'
                });
            }
        });
    }

    /**
     * Normalize LinkedIn URLs (remove query params, fragments)
     */
    normalizeLinkedInUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '');
        } catch (e) {
            return url;
        }
    }

    /**
     * Wait for tab to complete loading
     */
    waitForTabComplete(tabId) {
        return new Promise((resolve) => {
            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };

            chrome.tabs.onUpdated.addListener(listener);

            // Timeout after 15 seconds
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }, 15000);
        });
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cache data in chrome.storage.local
     */
    async cacheData(url, data) {
        try {
            const cacheKey = `linkedin_cache_${this.hashUrl(url)}`;
            const cacheEntry = {
                data,
                timestamp: Date.now()
            };
            await chrome.storage.local.set({ [cacheKey]: cacheEntry });
        } catch (error) {
            console.error('Error caching data:', error);
        }
    }

    /**
     * Get cached data (24 hour TTL)
     */
    async getCachedData(url) {
        try {
            const cacheKey = `linkedin_cache_${this.hashUrl(url)}`;
            const result = await chrome.storage.local.get(cacheKey);
            const cacheEntry = result[cacheKey];

            if (cacheEntry) {
                const age = Date.now() - cacheEntry.timestamp;
                const ttl = 24 * 60 * 60 * 1000; // 24 hours

                if (age < ttl) {
                    return cacheEntry.data;
                } else {
                    // Clear expired cache
                    await chrome.storage.local.remove(cacheKey);
                }
            }
        } catch (error) {
            console.error('Error getting cached data:', error);
        }

        return null;
    }

    /**
     * Simple hash function for URLs
     */
    hashUrl(url) {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Find connections between two profiles
     */
    findConnections(handlerData, prospectData) {
        console.log('Finding connections between profiles:', {
            handler: handlerData.name,
            prospect: prospectData.name,
            handlerExperience: handlerData.experience?.length || 0,
            prospectExperience: prospectData.experience?.length || 0,
            handlerEducation: handlerData.education?.length || 0,
            prospectEducation: prospectData.education?.length || 0
        });

        const connections = [];

        // 1. Shared companies (current or past)
        if (handlerData.experience && prospectData.experience) {
            handlerData.experience.forEach(handlerExp => {
                prospectData.experience.forEach(prospectExp => {
                    if (this.companiesMatch(handlerExp.company, prospectExp.company)) {
                        const strength = this.calculateOverlapStrength(handlerExp, prospectExp);
                        connections.push({
                            type: 'shared_company',
                            strength,
                            handlerDetail: `${handlerExp.title} at ${handlerExp.company} (${handlerExp.duration})`,
                            prospectDetail: `${prospectExp.title} at ${prospectExp.company} (${prospectExp.duration})`,
                            company: handlerExp.company,
                            description: `Both worked at ${handlerExp.company}`
                        });
                    }
                });
            });
        }

        // 2. Shared education
        if (handlerData.education && prospectData.education) {
            handlerData.education.forEach(handlerEdu => {
                prospectData.education.forEach(prospectEdu => {
                    if (this.schoolsMatch(handlerEdu.school, prospectEdu.school)) {
                        connections.push({
                            type: 'shared_education',
                            strength: 70,
                            handlerDetail: `${handlerEdu.degree} from ${handlerEdu.school} (${handlerEdu.dates})`,
                            prospectDetail: `${prospectEdu.degree} from ${prospectEdu.school} (${prospectEdu.dates})`,
                            school: handlerEdu.school,
                            description: `Both attended ${handlerEdu.school}`
                        });
                    }
                });
            });
        }

        // 3. Same location
        if (handlerData.location && prospectData.location) {
            if (this.locationsMatch(handlerData.location, prospectData.location)) {
                connections.push({
                    type: 'shared_location',
                    strength: 40,
                    handlerDetail: handlerData.location,
                    prospectDetail: prospectData.location,
                    description: `Both based in ${handlerData.location}`
                });
            }
        }

        // 4. Shared skills
        if (handlerData.skills && prospectData.skills) {
            const commonSkills = handlerData.skills.filter(skill =>
                prospectData.skills.some(pSkill =>
                    pSkill.toLowerCase().includes(skill.toLowerCase()) ||
                    skill.toLowerCase().includes(pSkill.toLowerCase())
                )
            );

            if (commonSkills.length > 0) {
                connections.push({
                    type: 'shared_skills',
                    strength: 30,
                    skills: commonSkills,
                    description: `Shared skills: ${commonSkills.slice(0, 5).join(', ')}`
                });
            }
        }

        // 5. Career trajectory similarity
        if (handlerData.experience && prospectData.experience) {
            const handlerIndustries = this.extractIndustries(handlerData.experience);
            const prospectIndustries = this.extractIndustries(prospectData.experience);

            const commonIndustries = handlerIndustries.filter(ind =>
                prospectIndustries.includes(ind)
            );

            if (commonIndustries.length > 0) {
                connections.push({
                    type: 'similar_industry',
                    strength: 50,
                    industries: commonIndustries,
                    description: `Both have experience in ${commonIndustries[0]}`
                });
            }
        }

        // Sort by strength (highest first)
        connections.sort((a, b) => b.strength - a.strength);

        console.log('Found connections:', connections);
        return connections;
    }

    /**
     * Helper: Check if company names match
     */
    companiesMatch(company1, company2) {
        if (!company1 || !company2) return false;

        const normalize = (str) => str.toLowerCase()
            .replace(/[,.\-()]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const c1 = normalize(company1);
        const c2 = normalize(company2);

        return c1 === c2 || c1.includes(c2) || c2.includes(c1);
    }

    /**
     * Helper: Check if school names match
     */
    schoolsMatch(school1, school2) {
        if (!school1 || !school2) return false;

        const normalize = (str) => str.toLowerCase()
            .replace(/university/g, '')
            .replace(/college/g, '')
            .replace(/[,.\-()]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const s1 = normalize(school1);
        const s2 = normalize(school2);

        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
    }

    /**
     * Helper: Check if locations match
     */
    locationsMatch(loc1, loc2) {
        if (!loc1 || !loc2) return false;

        const normalize = (str) => str.toLowerCase()
            .replace(/area|metropolitan/g, '')
            .replace(/[,.\-()]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const l1 = normalize(loc1);
        const l2 = normalize(loc2);

        return l1.includes(l2) || l2.includes(l1);
    }

    /**
     * Calculate temporal overlap strength for shared company experience
     */
    calculateOverlapStrength(exp1, exp2) {
        // Base strength for same company
        let strength = 60;

        // Parse years from duration strings
        const years1 = this.extractYears(exp1.duration);
        const years2 = this.extractYears(exp2.duration);

        if (years1.length > 0 && years2.length > 0) {
            // Check for temporal overlap
            const overlap = years1.some(year => years2.includes(year));
            if (overlap) {
                strength += 30; // Boost for overlapping time period
            }

            // Check if it's current (includes "Present")
            const isCurrent1 = exp1.duration.includes('Present');
            const isCurrent2 = exp2.duration.includes('Present');

            if (isCurrent1 && isCurrent2) {
                strength += 20; // Both currently at same company
            }
        }

        return Math.min(strength, 100);
    }

    /**
     * Extract years from duration string (e.g., "2020 - 2023" -> [2020, 2021, 2022, 2023])
     */
    extractYears(duration) {
        if (!duration) return [];

        const years = [];
        const yearMatches = duration.match(/\d{4}/g);

        if (yearMatches && yearMatches.length >= 2) {
            const start = parseInt(yearMatches[0]);
            const end = duration.includes('Present') ? new Date().getFullYear() : parseInt(yearMatches[1]);

            for (let year = start; year <= end; year++) {
                years.push(year);
            }
        }

        return years;
    }

    /**
     * Extract industry keywords from experience
     */
    extractIndustries(experiences) {
        const industries = new Set();
        const industryKeywords = [
            'technology', 'software', 'engineering', 'finance', 'banking',
            'consulting', 'healthcare', 'education', 'marketing', 'sales',
            'retail', 'manufacturing', 'media', 'telecommunications'
        ];

        experiences.forEach(exp => {
            const text = `${exp.title} ${exp.company}`.toLowerCase();
            industryKeywords.forEach(keyword => {
                if (text.includes(keyword)) {
                    industries.add(keyword);
                }
            });
        });

        return Array.from(industries);
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.LinkedInRecursiveExplorer = LinkedInRecursiveExplorer;
}
