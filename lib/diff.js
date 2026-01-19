/**
 * Diff computation and grouping utilities
 * Pure functions for word-level diff operations
 */

const DiffMatchPatch = require('diff-match-patch');

/**
 * Compute word-level diff between original and proposed text
 * @param {string} original - Original text
 * @param {string} proposed - Proposed new text
 * @returns {Array<{type: number, text: string}>} Array of diff parts (type: -1=delete, 0=equal, 1=insert)
 */
function computeWordDiff(original, proposed) {
  const dmp = new DiffMatchPatch();

  function tokenize(text) {
    return text.match(/\S+|\s+/g) || [];
  }

  const originalTokens = tokenize(original);
  const proposedTokens = tokenize(proposed);

  const wordMap = new Map();
  let charCode = 0x100;

  function getWordChar(word) {
    if (!wordMap.has(word)) {
      wordMap.set(word, String.fromCharCode(charCode++));
    }
    return wordMap.get(word);
  }

  const originalChars = originalTokens.map(getWordChar).join('');
  const proposedChars = proposedTokens.map(getWordChar).join('');

  const charDiffs = dmp.diff_main(originalChars, proposedChars);
  dmp.diff_cleanupSemantic(charDiffs);

  const reverseMap = new Map();
  wordMap.forEach((char, word) => reverseMap.set(char, word));

  const result = [];
  for (const [op, chars] of charDiffs) {
    for (const char of chars) {
      const word = reverseMap.get(char);
      if (word !== undefined) {
        result.push({ type: op, text: word });
      }
    }
  }

  const merged = [];
  for (const item of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
      merged[merged.length - 1].text += item.text;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

/**
 * Group diffs into logical change units
 * @param {Array<{type: number, text: string}>} diffs - Array of diff parts
 * @returns {Array<{id: number|null, type: string, parts: Array}>} Grouped changes
 */
function groupDiffsIntoChanges(diffs) {
  const changes = [];
  let changeId = 0;
  let i = 0;

  while (i < diffs.length) {
    const diff = diffs[i];

    if (diff.type === 0) {
      changes.push({ id: null, type: 'equal', parts: [diff] });
      i++;
    } else if (diff.type === -1) {
      const change = { id: changeId++, type: 'change', parts: [diff] };

      if (i + 1 < diffs.length && diffs[i + 1].type === 1) {
        change.parts.push(diffs[i + 1]);
        i += 2;
      } else {
        i++;
      }
      changes.push(change);
    } else if (diff.type === 1) {
      changes.push({ id: changeId++, type: 'change', parts: [diff] });
      i++;
    }
  }

  return changes;
}

module.exports = {
  computeWordDiff,
  groupDiffsIntoChanges
};
