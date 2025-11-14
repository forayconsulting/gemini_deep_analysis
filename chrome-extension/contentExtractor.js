(() => {
    // Scoring weights for content detection
    const WEIGHTS = {
        paragraphCount: 5,
        textDensity: 2,
        semanticBonus: 25,
        linkDensityPenalty: -3,
        shortTextPenalty: -10,
        listBonus: 3
    };

    // Patterns that indicate main content
    const POSITIVE_PATTERNS = [
        'article', 'content', 'main', 'post', 'entry',
        'text', 'body', 'story', 'narrative', 'readable'
    ];

    // Patterns that indicate non-content
    const NEGATIVE_PATTERNS = [
        'nav', 'menu', 'sidebar', 'footer', 'header',
        'comment', 'advertisement', 'popup', 'modal',
        'banner', 'widget', 'sponsor', 'social', 'share'
    ];

    // Tags to completely ignore
    const IGNORE_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'form'];

    function extractArticleContent() {
        // Priority 1: Check for selected text
        const selectedText = window.getSelection().toString();
        if (selectedText && selectedText.trim().length > 100) {
            return selectedText.trim();
        }

        // Priority 2: Look for semantic HTML5 article tags
        const articleTags = document.querySelectorAll('article, main, [role="main"]');
        if (articleTags.length === 1) {
            const extracted = extractTextFromElement(articleTags[0]);
            if (extracted.length > 500) {
                return extracted;
            }
        }

        // Priority 3: Score all container elements
        const candidates = [];
        const allElements = document.querySelectorAll('div, section, article, main');

        for (const element of allElements) {
            const score = scoreElement(element);
            if (score > 0) {
                candidates.push({ element, score });
            }
        }

        // Sort by score and extract from best candidate
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0 && candidates[0].score > 20) {
            return extractTextFromElement(candidates[0].element);
        }

        // No good candidate found
        return null;
    }

    function scoreElement(element) {
        let score = 0;

        // Skip if hidden or too small
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return 0;
        }

        // Get text content metrics
        const textContent = element.textContent || '';
        const textLength = textContent.trim().length;

        // Skip very short content
        if (textLength < 200) {
            return score + WEIGHTS.shortTextPenalty;
        }

        // Count content indicators
        const paragraphs = element.querySelectorAll('p');
        const links = element.querySelectorAll('a');
        const lists = element.querySelectorAll('ul, ol');
        const images = element.querySelectorAll('img');

        // Calculate scores
        score += paragraphs.length * WEIGHTS.paragraphCount;
        score += lists.length * WEIGHTS.listBonus;

        // Calculate link density (penalize navigation-heavy areas)
        const linkText = Array.from(links).reduce((sum, link) => sum + (link.textContent || '').length, 0);
        const linkDensity = linkText / Math.max(textLength, 1);
        if (linkDensity > 0.3) {
            score += WEIGHTS.linkDensityPenalty * (linkDensity * 10);
        }

        // Check for semantic indicators
        const className = (element.className || '').toLowerCase();
        const idName = (element.id || '').toLowerCase();
        const attributes = className + ' ' + idName;

        for (const pattern of POSITIVE_PATTERNS) {
            if (attributes.includes(pattern)) {
                score += WEIGHTS.semanticBonus;
                break;
            }
        }

        for (const pattern of NEGATIVE_PATTERNS) {
            if (attributes.includes(pattern)) {
                return 0; // Completely disqualify
            }
        }

        // Bonus for having substantial text in paragraphs
        const paragraphText = Array.from(paragraphs).reduce((sum, p) => sum + (p.textContent || '').length, 0);
        if (paragraphText > textLength * 0.5) {
            score += 10;
        }

        return score;
    }

    function extractTextFromElement(element) {
        const textParts = [];
        const processedNodes = new Set();

        function getAbsoluteUrl(url) {
            if (!url) return null;
            try {
                return new URL(url, window.location.href).href;
            } catch (e) {
                return url;
            }
        }

        function processNode(node) {
            // Avoid processing the same node twice
            if (processedNodes.has(node)) return;
            processedNodes.add(node);

            // Skip ignored elements
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                if (IGNORE_TAGS.includes(tagName)) return;

                // Skip hidden elements
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') return;

                // Skip navigation and other non-content areas
                const className = (node.className || '').toLowerCase();
                const idName = (node.id || '').toLowerCase();
                for (const pattern of NEGATIVE_PATTERNS) {
                    if (className.includes(pattern) || idName.includes(pattern)) {
                        return;
                    }
                }

                // Handle links specially to preserve [text|url] format
                if (tagName === 'a' && node.href) {
                    const linkText = node.textContent.trim();
                    if (linkText) {
                        const absoluteUrl = getAbsoluteUrl(node.href);
                        textParts.push(`[${linkText}|${absoluteUrl}]`);
                    }
                    return;
                }
            }

            // Process child nodes
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent.trim();
                    if (text && text.length > 1) {
                        textParts.push(text);
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    processNode(child);
                }
            }
        }

        processNode(element);

        // Clean up and join text
        return textParts
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Export for use in content.js
    window.__contentExtractor = {
        extractArticleContent
    };

    return extractArticleContent;
})();