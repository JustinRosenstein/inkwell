/**
 * Manages diff-related state.
 * Extracted to enable unit testing of state transitions.
 */

/**
 * Creates the initial diff state object
 * @returns {Object} Initial diff state
 */
function createInitialDiffState() {
  return {
    hasPendingDiff: false,
    originalContent: '',
    originalHtml: '',
    originalFullContent: '',
    proposedContent: '',
    proposedHtml: '',
    isSelectionEdit: false,
    selectedText: '',
    selectionStart: 0,
    selectionEnd: 0,
    diffChanges: [],
  };
}

/**
 * Clears all diff-related state, including selection state.
 * This fixes a bug where selection state persisted across diff requests,
 * causing subsequent requests to use stale selection data.
 *
 * @param {Object} state - The state object to clear
 * @returns {Object} The cleared state (same object, mutated)
 */
function clearDiffState(state) {
  state.hasPendingDiff = false;
  state.originalContent = '';
  state.originalHtml = '';
  state.originalFullContent = '';
  state.proposedContent = '';
  state.proposedHtml = '';
  state.isSelectionEdit = false;
  state.selectedText = '';
  state.selectionStart = 0;
  state.selectionEnd = 0;
  state.diffChanges = [];
  return state;
}

/**
 * Updates selection state
 * @param {Object} state - The state object
 * @param {string} text - Selected text
 * @param {number} start - Selection start position
 * @param {number} end - Selection end position
 */
function updateSelectionState(state, text, start, end) {
  state.selectedText = text;
  state.selectionStart = start;
  state.selectionEnd = end;
}

module.exports = {
  createInitialDiffState,
  clearDiffState,
  updateSelectionState,
};
