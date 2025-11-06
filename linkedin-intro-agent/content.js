(() => {
    /**
     * LinkedIn-specific content extractor
     * Returns structured JSON data from LinkedIn pages (profiles, companies, schools)
     */

    function detectPageType() {
        const url = window.location.href;

        if (url.includes('/in/')) return 'profile';
        if (url.includes('/company/') && url.includes('/jobs')) return 'company_jobs';
        if (url.includes('/company/')) return 'company';
        if (url.includes('/school/')) return 'school';

        return 'unknown';
    }

    function extractText(element) {
        if (!element) return '';
        return element.textContent?.trim() || '';
    }

    function extractCompanyId() {
        /**
         * Extract numeric company ID for building advanced job search URLs
         * Tries multiple methods:
         * 1. From URL pattern: /company/123456/
         * 2. From page source: urn:li:fsd_company:123456
         * 3. From "Show all jobs" link on page
         */

        try {
            // Method 1: Extract from URL if it's numeric
            const urlMatch = window.location.href.match(/\/company\/(\d+)/);
            if (urlMatch) {
                console.log('Found company ID from URL:', urlMatch[1]);
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
                    console.log('Found company ID from page source:', match[1]);
                    return match[1];
                }
            }

            // Method 3: Look for "Show all jobs" link with f_C parameter
            const allJobsLink = document.querySelector('a[href*="f_C="]');
            if (allJobsLink) {
                const fCMatch = allJobsLink.href.match(/f_C=(\d+)/);
                if (fCMatch) {
                    console.log('Found company ID from jobs link:', fCMatch[1]);
                    return fCMatch[1];
                }
            }

            console.log('Could not extract company ID');
            return null;

        } catch (error) {
            console.error('Error extracting company ID:', error);
            return null;
        }
    }

    function extractProfileData() {
        const data = {
            type: 'profile',
            url: window.location.href,
            name: '',
            headline: '',
            location: '',
            about: '',
            experience: [],
            education: [],
            skills: [],
            activity: [],
            linkedUrls: []
        };

        try {
            // Extract name - multiple selectors for different LinkedIn layouts
            const nameSelectors = [
                '.text-heading-xlarge',
                '.pv-text-details__left-panel h1',
                'h1.inline',
                '.pv-top-card--list li:first-child'
            ];

            for (const selector of nameSelectors) {
                const nameEl = document.querySelector(selector);
                if (nameEl && extractText(nameEl).length > 0) {
                    data.name = extractText(nameEl);
                    break;
                }
            }

            // Extract headline
            const headlineSelectors = [
                '.text-body-medium.break-words',
                '.pv-text-details__left-panel .text-body-medium',
                '.pv-top-card--list-bullet li:first-child'
            ];

            for (const selector of headlineSelectors) {
                const headlineEl = document.querySelector(selector);
                if (headlineEl && extractText(headlineEl).length > 0) {
                    data.headline = extractText(headlineEl);
                    break;
                }
            }

            // Extract location
            const locationSelectors = [
                '.text-body-small.inline.t-black--light.break-words',
                '.pv-text-details__left-panel .text-body-small',
                '.pv-top-card--list-bullet li:last-child'
            ];

            for (const selector of locationSelectors) {
                const locationEl = document.querySelector(selector);
                if (locationEl && extractText(locationEl).length > 0) {
                    data.location = extractText(locationEl);
                    break;
                }
            }

            // Extract About section
            const aboutSection = document.querySelector('#about') ||
                                document.querySelector('[data-section="summary"]');
            if (aboutSection) {
                const aboutParent = aboutSection.closest('section');
                if (aboutParent) {
                    const aboutText = extractText(aboutParent);
                    data.about = aboutText.replace('About', '').trim().substring(0, 500);
                }
            }

            // Extract Experience
            const experienceSection = document.querySelector('#experience') ||
                                     document.querySelector('[data-section="experience"]');
            if (experienceSection) {
                const experienceParent = experienceSection.closest('section');
                if (experienceParent) {
                    const experienceItems = experienceParent.querySelectorAll('li.artdeco-list__item');

                    experienceItems.forEach(item => {
                        const titleEl = item.querySelector('.t-bold');
                        const companyEl = item.querySelector('.t-14.t-normal');
                        const durationEl = item.querySelector('.t-14.t-normal.t-black--light');

                        if (titleEl) {
                            const exp = {
                                title: extractText(titleEl),
                                company: companyEl ? extractText(companyEl) : '',
                                duration: durationEl ? extractText(durationEl) : ''
                            };

                            // Extract company URL if available
                            const companyLink = item.querySelector('a[href*="/company/"]');
                            if (companyLink) {
                                exp.companyUrl = companyLink.href;
                                data.linkedUrls.push(companyLink.href);
                            }

                            data.experience.push(exp);
                        }
                    });
                }
            }

            // Extract Education
            const educationSection = document.querySelector('#education') ||
                                    document.querySelector('[data-section="education"]');
            if (educationSection) {
                const educationParent = educationSection.closest('section');
                if (educationParent) {
                    const educationItems = educationParent.querySelectorAll('li.artdeco-list__item');

                    educationItems.forEach(item => {
                        const schoolEl = item.querySelector('.t-bold');
                        const degreeEl = item.querySelector('.t-14.t-normal');
                        const datesEl = item.querySelector('.t-14.t-normal.t-black--light');

                        if (schoolEl) {
                            const edu = {
                                school: extractText(schoolEl),
                                degree: degreeEl ? extractText(degreeEl) : '',
                                dates: datesEl ? extractText(datesEl) : ''
                            };

                            // Extract school URL if available
                            const schoolLink = item.querySelector('a[href*="/school/"]');
                            if (schoolLink) {
                                edu.schoolUrl = schoolLink.href;
                                data.linkedUrls.push(schoolLink.href);
                            }

                            data.education.push(edu);
                        }
                    });
                }
            }

            // Extract Skills (top skills only)
            const skillsSection = document.querySelector('#skills') ||
                                 document.querySelector('[data-section="skills"]');
            if (skillsSection) {
                const skillsParent = skillsSection.closest('section');
                if (skillsParent) {
                    const skillItems = skillsParent.querySelectorAll('.artdeco-list__item');

                    skillItems.forEach((item, index) => {
                        if (index < 10) { // Top 10 skills only
                            const skillName = extractText(item);
                            if (skillName && !skillName.includes('Show all')) {
                                data.skills.push(skillName.split('\n')[0].trim());
                            }
                        }
                    });
                }
            }

            // Extract recent activity (posts, articles)
            const activitySection = document.querySelector('#recent-activity') ||
                                   document.querySelector('[data-section="activity"]');
            if (activitySection) {
                const activityParent = activitySection.closest('section');
                if (activityParent) {
                    const posts = activityParent.querySelectorAll('.feed-shared-update-v2');

                    posts.forEach((post, index) => {
                        if (index < 5) { // Last 5 posts only
                            const postText = extractText(post).substring(0, 200);
                            if (postText) {
                                data.activity.push(postText);
                            }
                        }
                    });
                }
            }

            // Extract all LinkedIn URLs from page for recursive exploration
            const allLinks = document.querySelectorAll('a[href*="linkedin.com"]');
            allLinks.forEach(link => {
                const href = link.href;
                if ((href.includes('/company/') ||
                     href.includes('/school/') ||
                     href.includes('/in/')) &&
                    !data.linkedUrls.includes(href)) {
                    data.linkedUrls.push(href);
                }
            });

        } catch (error) {
            console.error('Error extracting profile data:', error);
        }

        return data;
    }

    function extractCompanyData() {
        const data = {
            type: 'company',
            url: window.location.href,
            name: '',
            tagline: '',
            industry: '',
            companySize: '',
            headquarters: '',
            about: '',
            companyId: null,
            linkedUrls: []
        };

        try {
            // Extract company ID for advanced job search URLs
            data.companyId = extractCompanyId();
            // Company name
            const nameEl = document.querySelector('.org-top-card-summary__title');
            if (nameEl) data.name = extractText(nameEl);

            // Tagline
            const taglineEl = document.querySelector('.org-top-card-summary__tagline');
            if (taglineEl) data.tagline = extractText(taglineEl);

            // Industry, size, headquarters
            const infoItems = document.querySelectorAll('.org-page-details__definition-text');
            infoItems.forEach((item, index) => {
                const text = extractText(item);
                if (index === 0) data.industry = text;
                if (index === 1) data.companySize = text;
                if (index === 2) data.headquarters = text;
            });

            // About section
            const aboutSection = document.querySelector('.org-about-us-organization-description__text');
            if (aboutSection) {
                data.about = extractText(aboutSection).substring(0, 500);
            }

        } catch (error) {
            console.error('Error extracting company data:', error);
        }

        return data;
    }

    function extractSchoolData() {
        const data = {
            type: 'school',
            url: window.location.href,
            name: '',
            location: '',
            about: '',
            linkedUrls: []
        };

        try {
            // School name
            const nameEl = document.querySelector('.org-top-card-summary__title') ||
                          document.querySelector('h1');
            if (nameEl) data.name = extractText(nameEl);

            // Location
            const locationEl = document.querySelector('.org-top-card-summary-info-list__info-item');
            if (locationEl) data.location = extractText(locationEl);

            // About
            const aboutSection = document.querySelector('.org-about-us-organization-description__text');
            if (aboutSection) {
                data.about = extractText(aboutSection).substring(0, 500);
            }

        } catch (error) {
            console.error('Error extracting school data:', error);
        }

        return data;
    }

    function extractCompanyJobsData() {
        const data = {
            type: 'company_jobs',
            url: window.location.href,
            companyName: '',
            jobs: [],
            linkedUrls: []
        };

        try {
            // Extract company name from page header or URL
            const nameEl = document.querySelector('.org-top-card-summary__title') ||
                          document.querySelector('h1');
            if (nameEl) {
                data.companyName = extractText(nameEl);
            }

            // Extract job listings - LinkedIn uses various selectors
            const jobListSelectors = [
                '.jobs-search__results-list li',
                '.scaffold-layout__list-container li',
                'ul.jobs-search__results-list > li'
            ];

            let jobElements = [];
            for (const selector of jobListSelectors) {
                jobElements = document.querySelectorAll(selector);
                if (jobElements.length > 0) break;
            }

            // Limit to top 30 jobs (increased from 10)
            const jobsToExtract = Math.min(jobElements.length, 30);

            // Try to get the job description from the detail panel (if a job is currently selected)
            let currentJobDescription = '';
            const descriptionSelectors = [
                '.jobs-description__content',
                '.jobs-box__html-content',
                '.jobs-description-content__text',
                '[class*="job-details"] .jobs-description'
            ];

            for (const selector of descriptionSelectors) {
                const descEl = document.querySelector(selector);
                if (descEl) {
                    currentJobDescription = extractText(descEl).substring(0, 1000);
                    break;
                }
            }

            for (let i = 0; i < jobsToExtract; i++) {
                const jobEl = jobElements[i];

                try {
                    const job = {
                        title: '',
                        location: '',
                        type: '',
                        posted: '',
                        url: '',
                        description: '',
                        applicants: '',
                        seniority: ''
                    };

                    // Job title
                    const titleEl = jobEl.querySelector('.job-card-list__title') ||
                                   jobEl.querySelector('.jobs-unified-top-card__job-title') ||
                                   jobEl.querySelector('h3') ||
                                   jobEl.querySelector('a[href*="/jobs/"]');
                    if (titleEl) {
                        job.title = extractText(titleEl);
                    }

                    // Job URL
                    const linkEl = jobEl.querySelector('a[href*="/jobs/"]');
                    if (linkEl) {
                        job.url = linkEl.href;
                    }

                    // Location
                    const locationEl = jobEl.querySelector('.job-card-container__metadata-item') ||
                                      jobEl.querySelector('.job-card-container__primary-description');
                    if (locationEl) {
                        job.location = extractText(locationEl);
                    }

                    // Job type (Full-time, Remote, Hybrid, etc.)
                    const typeEl = jobEl.querySelector('.job-card-container__job-insight') ||
                                  jobEl.querySelector('.job-card-list__footer-wrapper');
                    if (typeEl) {
                        job.type = extractText(typeEl);
                    }

                    // Posted date
                    const postedEl = jobEl.querySelector('time') ||
                                    jobEl.querySelector('.job-card-container__listed-time');
                    if (postedEl) {
                        job.posted = extractText(postedEl);
                    }

                    // Applicants count
                    const applicantsEl = jobEl.querySelector('.job-card-container__applicant-count') ||
                                        jobEl.querySelector('[class*="applicant"]');
                    if (applicantsEl) {
                        job.applicants = extractText(applicantsEl);
                    }

                    // Seniority level
                    const seniorityEl = jobEl.querySelector('.job-card-container__job-insight-text') ||
                                       jobEl.querySelector('[class*="seniority"]');
                    if (seniorityEl) {
                        const text = extractText(seniorityEl);
                        if (text.includes('Entry level') || text.includes('Mid-Senior') ||
                            text.includes('Director') || text.includes('Executive')) {
                            job.seniority = text;
                        }
                    }

                    // Try to extract description from job element itself (some layouts show preview)
                    const descEl = jobEl.querySelector('.job-card-list__description') ||
                                  jobEl.querySelector('[class*="description"]');
                    if (descEl) {
                        job.description = extractText(descEl).substring(0, 500);
                    }
                    // If this is the first job and we have a currentJobDescription, use it
                    else if (i === 0 && currentJobDescription) {
                        job.description = currentJobDescription;
                    }

                    // Only add if we got at least a title
                    if (job.title) {
                        data.jobs.push(job);
                    }
                } catch (error) {
                    console.error('Error extracting individual job:', error);
                }
            }

            console.log(`Extracted ${data.jobs.length} job listings from ${data.companyName || 'company'}`);

            if (data.jobs.length === 0) {
                console.warn('No jobs extracted. LinkedIn DOM may have changed. Checked selectors:', jobListSelectors);
                console.log('Sample HTML:', document.body.innerHTML.substring(0, 1000));
            }

        } catch (error) {
            console.error('Error extracting company jobs data:', error);
        }

        return data;
    }

    function extractLinkedInData() {
        const pageType = detectPageType();

        console.log('LinkedIn page type detected:', pageType);

        let data;

        switch (pageType) {
            case 'profile':
                data = extractProfileData();
                break;
            case 'company':
                data = extractCompanyData();
                break;
            case 'company_jobs':
                data = extractCompanyJobsData();
                break;
            case 'school':
                data = extractSchoolData();
                break;
            default:
                data = {
                    type: 'unknown',
                    url: window.location.href,
                    error: 'Unable to detect LinkedIn page type'
                };
        }

        console.log('Extracted LinkedIn data:', data);
        return data;
    }

    // Return the extracted data
    return extractLinkedInData();
})();
