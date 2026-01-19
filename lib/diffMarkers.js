/**
 * Diff marker conversion utilities
 * Functions for converting between internal diff markers and HTML
 */

/**
 * Convert internal diff markers to placeholder HTML tags
 * Markers format: \x00DEL{id}\x00...content...\x00/DEL\x00
 * Output format: <diffdelete data-id="{id}">...content...</diffdelete>
 *
 * @param {string} text - Text with internal diff markers
 * @returns {string} Text with placeholder HTML tags
 */
function markersToPlaceholders(text) {
  let result = text;
  result = result.replace(/\x00DEL(\d+)\x00([\s\S]*?)\x00\/DEL\x00/g,
    '<diffdelete data-id="$1">$2</diffdelete>');
  result = result.replace(/\x00INS(\d+)\x00([\s\S]*?)\x00\/INS\x00/g,
    '<diffinsert data-id="$1">$2</diffinsert>');
  return result;
}

/**
 * Convert placeholder HTML tags to final diff span elements
 * Input format: <diffdelete data-id="{id}">...content...</diffdelete>
 * Output format: <span class="diff-delete" data-change-id="{id}">...content...</span>
 *
 * @param {string} html - HTML with placeholder tags
 * @returns {string} HTML with proper diff spans
 */
function placeholdersToSpans(html) {
  let result = html;
  result = result.replace(/<diffdelete data-id="(\d+)">([\s\S]*?)<\/diffdelete>/g,
    '<span class="diff-delete" data-change-id="$1">$2</span>');
  result = result.replace(/<diffinsert data-id="(\d+)">([\s\S]*?)<\/diffinsert>/g,
    '<span class="diff-insert" data-change-id="$1">$2</span>');
  return result;
}

/**
 * Build diff markdown with internal markers from grouped changes
 *
 * @param {Array} changes - Array of change objects from groupDiffsIntoChanges
 * @returns {string} Markdown text with embedded diff markers
 */
function buildDiffMarkdown(changes) {
  let diffMarkdown = '';

  for (const change of changes) {
    if (change.type === 'equal') {
      diffMarkdown += change.parts[0].text;
    } else {
      const changeId = change.id;
      for (const part of change.parts) {
        if (part.type === -1) {
          diffMarkdown += `\x00DEL${changeId}\x00${part.text}\x00/DEL\x00`;
        } else if (part.type === 1) {
          diffMarkdown += `\x00INS${changeId}\x00${part.text}\x00/INS\x00`;
        }
      }
    }
  }

  return diffMarkdown;
}

module.exports = {
  markersToPlaceholders,
  placeholdersToSpans,
  buildDiffMarkdown
};
