(() => {
    function extractPageContent() {
        const selectedText = window.getSelection().toString();

        if (selectedText) {
            return selectedText.trim();
        }

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

    return extractPageContent();
})();