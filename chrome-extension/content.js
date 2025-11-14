(() => {
    // Original full-page extraction function
    function extractFullPageContent() {
        const excludeTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas'];
        const textParts = [];

        function shouldProcess(element) {
            if (!element) return false;

            const tagName = element.tagName?.toLowerCase();
            if (excludeTags.includes(tagName)) {
                return false;
            }

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }

            return true;
        }

        function getAbsoluteUrl(url) {
            if (!url) return null;
            try {
                return new URL(url, window.location.href).href;
            } catch (e) {
                return url;
            }
        }

        function processElement(element) {
            if (!shouldProcess(element)) {
                return;
            }

            if (element.tagName?.toLowerCase() === 'a' && element.href) {
                const linkText = element.textContent.trim();
                if (linkText) {
                    const absoluteUrl = getAbsoluteUrl(element.href);
                    textParts.push(`[${linkText}|${absoluteUrl}]`);
                }
                return;
            }

            for (const child of element.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent.trim();
                    if (text) {
                        textParts.push(text);
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    processElement(child);
                }
            }
        }

        processElement(document.body);

        const content = textParts
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        return content || 'No text content found on this page.';
    }

    function extractPageContent() {
        // Priority 1: User selected text (always honor user selection)
        const selectedText = window.getSelection().toString();
        if (selectedText && selectedText.trim().length > 50) {
            return selectedText.trim();
        }

        // Priority 2: Try smart article extraction
        try {
            // First, load the contentExtractor if available
            const script = document.createElement('script');
            script.textContent = `
                ${contentExtractorCode}
            `;
            document.head.appendChild(script);

            // Use the smart extractor
            if (window.__contentExtractor && window.__contentExtractor.extractArticleContent) {
                const articleContent = window.__contentExtractor.extractArticleContent();
                if (articleContent && articleContent.length > 500) {
                    console.log('Using smart article extraction');
                    return articleContent;
                }
            }
        } catch (error) {
            console.log('Smart extraction failed, falling back to full extraction:', error);
        }

        // Priority 3: Fall back to full page extraction
        console.log('Using full page extraction');
        return extractFullPageContent();
    }

    // Inline the contentExtractor code
    const contentExtractorCode = `
    (() => {
        const WEIGHTS = {
            paragraphCount: 5,
            textDensity: 2,
            semanticBonus: 25,
            linkDensityPenalty: -3,
            shortTextPenalty: -10,
            listBonus: 3
        };

        const POSITIVE_PATTERNS = [
            'article', 'content', 'main', 'post', 'entry',
            'text', 'body', 'story', 'narrative', 'readable'
        ];

        const NEGATIVE_PATTERNS = [
            'nav', 'menu', 'sidebar', 'footer', 'header',
            'comment', 'advertisement', 'popup', 'modal',
            'banner', 'widget', 'sponsor', 'social', 'share'
        ];

        const IGNORE_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'form'];

        function extractArticleContent() {
            const selectedText = window.getSelection().toString();
            if (selectedText && selectedText.trim().length > 100) {
                return selectedText.trim();
            }

            const articleTags = document.querySelectorAll('article, main, [role="main"]');
            if (articleTags.length === 1) {
                const extracted = extractTextFromElement(articleTags[0]);
                if (extracted.length > 500) {
                    return extracted;
                }
            }

            const candidates = [];
            const allElements = document.querySelectorAll('div, section, article, main');

            for (const element of allElements) {
                const score = scoreElement(element);
                if (score > 0) {
                    candidates.push({ element, score });
                }
            }

            candidates.sort((a, b) => b.score - a.score);

            if (candidates.length > 0 && candidates[0].score > 20) {
                return extractTextFromElement(candidates[0].element);
            }

            return null;
        }

        function scoreElement(element) {
            let score = 0;

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return 0;
            }

            const textContent = element.textContent || '';
            const textLength = textContent.trim().length;

            if (textLength < 200) {
                return score + WEIGHTS.shortTextPenalty;
            }

            const paragraphs = element.querySelectorAll('p');
            const links = element.querySelectorAll('a');
            const lists = element.querySelectorAll('ul, ol');

            score += paragraphs.length * WEIGHTS.paragraphCount;
            score += lists.length * WEIGHTS.listBonus;

            const linkText = Array.from(links).reduce((sum, link) => sum + (link.textContent || '').length, 0);
            const linkDensity = linkText / Math.max(textLength, 1);
            if (linkDensity > 0.3) {
                score += WEIGHTS.linkDensityPenalty * (linkDensity * 10);
            }

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
                    return 0;
                }
            }

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
                if (processedNodes.has(node)) return;
                processedNodes.add(node);

                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    if (IGNORE_TAGS.includes(tagName)) return;

                    const style = window.getComputedStyle(node);
                    if (style.display === 'none' || style.visibility === 'hidden') return;

                    const className = (node.className || '').toLowerCase();
                    const idName = (node.id || '').toLowerCase();
                    for (const pattern of NEGATIVE_PATTERNS) {
                        if (className.includes(pattern) || idName.includes(pattern)) {
                            return;
                        }
                    }

                    if (tagName === 'a' && node.href) {
                        const linkText = node.textContent.trim();
                        if (linkText) {
                            const absoluteUrl = getAbsoluteUrl(node.href);
                            textParts.push(\`[\${linkText}|\${absoluteUrl}]\`);
                        }
                        return;
                    }
                }

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

            return textParts
                .join(' ')
                .replace(/\\s+/g, ' ')
                .trim();
        }

        window.__contentExtractor = {
            extractArticleContent
        };
    })();
    `;

    return extractPageContent();
})();