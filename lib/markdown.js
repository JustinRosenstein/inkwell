/**
 * Markdown and inline formatting utilities
 * Pure functions for text processing
 */

/**
 * Process inline markdown formatting (bold, italic, code, strikethrough)
 * @param {string} html - HTML string to process
 * @returns {string} HTML with inline formatting applied
 */
function processInlineFormatting(html) {
  // Process bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Process italic (*text* or _text_) - careful not to match ** or __
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

  // Process inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Process strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return html;
}

/**
 * Clean markdown horizontal rules from start/end of content
 * @param {string} markdown - Markdown content
 * @returns {string} Cleaned markdown
 */
function cleanHorizontalRules(markdown) {
  // Remove leading horizontal rules
  markdown = markdown.replace(/^(\s*(\*\*\*|---|___)\s*\n)+/, '');
  // Remove trailing horizontal rules
  markdown = markdown.replace(/(\n\s*(\*\*\*|---|___)\s*)+$/, '');
  return markdown;
}

/**
 * Normalize horizontal rule syntax
 * @param {string} markdown - Markdown content
 * @returns {string} Normalized markdown
 */
function normalizeHorizontalRules(markdown) {
  return markdown
    .replace(/^(\s*---\s*\n)+/, '')
    .replace(/(\n\s*---\s*)+$/, '')
    .replace(/^---$/gm, '***')
    .replace(/^___$/gm, '***');
}

/**
 * Escape HTML entities in text
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => entities[char]);
}

module.exports = {
  processInlineFormatting,
  cleanHorizontalRules,
  normalizeHorizontalRules,
  escapeHtml
};
