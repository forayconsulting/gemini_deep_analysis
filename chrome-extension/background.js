importScripts('config.js');

chrome.runtime.onInstalled.addListener(() => {
    console.log('Gemini Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'callGemini') {
        callGeminiAPI(request.systemPrompt, request.userPrompt)
            .then(result => sendResponse({ success: true, message: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function callGeminiAPI(systemPrompt, userPrompt) {
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
            temperature: 0.7,
            maxOutputTokens: 4096
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
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}