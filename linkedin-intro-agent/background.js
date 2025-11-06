importScripts('config.js');

chrome.runtime.onInstalled.addListener(() => {
    console.log('LinkedIn Intro Agent installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'generateIntroEmail') {
        generateIntroEmail(request.handlerData, request.prospectData, request.connections, request.regenerate, request.allData)
            .then(email => sendResponse({ success: true, email }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

/**
 * Generate introduction email using Gemini API
 */
async function generateIntroEmail(handlerData, prospectData, connections, regenerate = false, allData = null) {
    console.log('Generating intro email with Gemini');
    console.log('Handler:', handlerData.name || 'Unknown', '| Prospect:', prospectData.name || 'Unknown', '| Connections found:', connections?.length || 0);

    // Check if we have job listings data
    if (allData) {
        console.log('allData received:', allData.length, 'items');
        console.log('allData types:', allData.map(d => d.type));

        const jobsData = allData.find(d => d.type === 'company_jobs');
        if (jobsData && jobsData.jobs && jobsData.jobs.length > 0) {
            console.log('Job listings available:', jobsData.jobs.length, 'jobs at', jobsData.companyName);
        } else {
            console.log('No job listings found in allData. JobsData:', jobsData);
        }
    } else {
        console.log('allData is null or undefined');
    }

    // Build system prompt - SIMPLIFIED for brevity
    const systemPrompt = `You write brief introduction request emails.

LENGTH REQUIREMENT: MAXIMUM 150 words. Anything longer will be rejected.

TASK: Write an email TO the Handler asking them to introduce you TO the Prospect.

STRUCTURE:
-Line 1: "Hi [Handler First Name],"
-Paragraph 1 (2-3 sentences): "I'm reaching out because I'd love to connect with
[Prospect Full Name]. [Brief reason why, mentioning 1-2 Handler-Prospect connections
from the data. Leverage focused, motivated, connections. Find the "needle in the (data) haystack connecting these two individuals meaningfully. Avoid any inconsequential, throwaway connections and focus on the most crucial and important ones.]."
- Paragraph 2 (1-2 sentences): "Would you be open to making an introduction?"

TONE: Warm, professional, brief. No fluff.

JOB OPENINGS CONTEXT: If job openings at the Prospect's company are provided, reference them ONLY if genuinely relevant (e.g., staffing opportunities, talent needs align with your value proposition). Do not force job mentions if they're not meaningful to the introduction.

CRITICAL: Stay under 150 words total. Be concise.`;

    // Build user prompt with profile data and connections
    const userPrompt = buildUserPrompt(handlerData, prospectData, connections, regenerate, allData);

    // Call Gemini API
    const apiUrl = `${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: userPrompt
                    }
                ]
            }
        ],
        systemInstruction: {
            parts: [
                {
                    text: systemPrompt
                }
            ]
        },
        generationConfig: {
            temperature: regenerate ? 0.9 : 0.7, // Higher temp for regeneration to get variety
            maxOutputTokens: 8192, // Increased aggressively - provides 40x buffer for 200-word email
            topP: 0.95
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();

        // Comprehensive validation of Gemini API response structure
        if (data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0] &&
            data.candidates[0].content.parts[0].text) {

            const emailText = data.candidates[0].content.parts[0].text;
            return emailText.trim();
        } else {
            // Log the actual response for debugging
            console.error('Unexpected Gemini API response structure:', JSON.stringify(data, null, 2));

            // Check for common error patterns
            if (data.promptFeedback) {
                const feedback = data.promptFeedback;
                throw new Error(`Gemini blocked request due to: ${feedback.blockReason || 'safety filters'}. Details: ${JSON.stringify(feedback)}`);
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].finishReason) {
                throw new Error(`Gemini generation stopped: ${data.candidates[0].finishReason}`);
            }

            throw new Error(`Unexpected response format from Gemini API. Response structure: ${JSON.stringify(data)}`);
        }
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

/**
 * Build user prompt with structured profile data
 */
function buildUserPrompt(handlerData, prospectData, connections, regenerate, allData) {
    let prompt = '';

    if (regenerate) {
        prompt += 'GENERATE A DIFFERENT VERSION from before. Use different phrasing, different connection emphasis, or different approach while maintaining quality.\n\n';
    }

    // Handler profile summary (SIMPLIFIED - reduced data)
    prompt += '=== HANDLER (Address email TO this person) ===\n';
    prompt += `Name: ${handlerData.name || 'Unknown'}\n`;
    prompt += `Headline: ${handlerData.headline || 'N/A'}\n\n`;

    if (handlerData.experience && handlerData.experience.length > 0) {
        prompt += 'Experience:\n';
        handlerData.experience.slice(0, 2).forEach(exp => {
            prompt += `- ${exp.title} at ${exp.company}\n`;
        });
        prompt += '\n';
    }

    if (handlerData.education && handlerData.education.length > 0) {
        prompt += `Education: ${handlerData.education[0].school}\n\n`;
    }

    // Prospect profile summary (SIMPLIFIED - reduced data)
    prompt += '=== PROSPECT (Person you want intro TO - mention in email) ===\n';
    prompt += `Name: ${prospectData.name || 'Unknown'}\n`;
    prompt += `Headline: ${prospectData.headline || 'N/A'}\n\n`;

    if (prospectData.experience && prospectData.experience.length > 0) {
        prompt += 'Experience:\n';
        prospectData.experience.slice(0, 2).forEach(exp => {
            prompt += `- ${exp.title} at ${exp.company}\n`;
        });
        prompt += '\n';
    }

    if (prospectData.education && prospectData.education.length > 0) {
        prompt += `Education: ${prospectData.education[0].school}\n\n`;
    }

    // Discovered connections (SIMPLIFIED - top 3, description only)
    prompt += '=== CONNECTIONS between Handler and Prospect ===\n';

    if (connections && connections.length > 0) {
        connections.slice(0, 3).forEach((conn, index) => {
            prompt += `${index + 1}. ${conn.description}\n`;
        });
    } else {
        prompt += 'No direct connections found.\n';
    }
    prompt += '\n';

    // Job openings at prospect's and handler's current companies (if available)
    if (allData) {
        const allJobsData = allData.filter(d => d.type === 'company_jobs' && d.jobs && d.jobs.length > 0);

        if (allJobsData.length > 0) {
            prompt += '=== JOB OPENINGS (Staffing Opportunities) ===\n';

            allJobsData.forEach(jobsData => {
                prompt += `\n${jobsData.companyName || "Company"} - ${jobsData.jobs.length} position(s):\n`;

                // Include top 10 jobs with full details
                jobsData.jobs.slice(0, 10).forEach((job, index) => {
                    prompt += `\n${index + 1}. ${job.title}`;
                    if (job.location) prompt += ` | ${job.location}`;
                    if (job.type) prompt += ` | ${job.type}`;
                    if (job.seniority) prompt += ` | ${job.seniority}`;
                    if (job.applicants) prompt += ` | ${job.applicants}`;
                    if (job.posted) prompt += ` | Posted: ${job.posted}`;
                    prompt += '\n';

                    // Include job description if available (most important for context!)
                    if (job.description && job.description.length > 0) {
                        prompt += `   Description: ${job.description}\n`;
                    }

                    if (job.url) {
                        prompt += `   URL: ${job.url}\n`;
                    }
                });
                prompt += '\n';
            });
        }
    }

    prompt += '=== TASK ===\n';
    prompt += 'Write 150-word MAX email to Handler asking for intro to Prospect. Use structure from system prompt.\n';

    return prompt;
}
