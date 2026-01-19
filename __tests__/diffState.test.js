const {
  createInitialDiffState,
  clearDiffState,
  updateSelectionState,
} = require('../lib/diffState');

describe('diffState', () => {
  describe('createInitialDiffState', () => {
    test('creates state with all expected properties', () => {
      const state = createInitialDiffState();

      expect(state).toEqual({
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
      });
    });
  });

  describe('clearDiffState', () => {
    test('clears all diff-related properties', () => {
      const state = {
        hasPendingDiff: true,
        originalContent: 'original',
        originalHtml: '<p>original</p>',
        originalFullContent: 'full original',
        proposedContent: 'proposed',
        proposedHtml: '<p>proposed</p>',
        isSelectionEdit: true,
        selectedText: 'selected',
        selectionStart: 10,
        selectionEnd: 20,
        diffChanges: [{ id: 0, type: 'change' }],
      };

      clearDiffState(state);

      expect(state.hasPendingDiff).toBe(false);
      expect(state.originalContent).toBe('');
      expect(state.originalHtml).toBe('');
      expect(state.originalFullContent).toBe('');
      expect(state.proposedContent).toBe('');
      expect(state.proposedHtml).toBe('');
      expect(state.isSelectionEdit).toBe(false);
      expect(state.diffChanges).toEqual([]);
    });

    test('clears selection state to fix stale selection bug', () => {
      // This test specifically verifies the bug fix:
      // Previously, clearDiff() did NOT reset selectedText, selectionStart, selectionEnd
      // This caused subsequent diff requests to use stale selection data
      const state = {
        hasPendingDiff: true,
        originalContent: 'original',
        originalHtml: '',
        originalFullContent: '',
        proposedContent: '',
        proposedHtml: '',
        isSelectionEdit: true,
        selectedText: 'this was selected text',
        selectionStart: 5,
        selectionEnd: 27,
        diffChanges: [],
      };

      clearDiffState(state);

      // Critical assertions for the bug fix
      expect(state.selectedText).toBe('');
      expect(state.selectionStart).toBe(0);
      expect(state.selectionEnd).toBe(0);
    });

    test('returns the mutated state object', () => {
      const state = createInitialDiffState();
      state.hasPendingDiff = true;

      const result = clearDiffState(state);

      expect(result).toBe(state);
    });
  });

  describe('updateSelectionState', () => {
    test('updates selection properties', () => {
      const state = createInitialDiffState();

      updateSelectionState(state, 'selected text', 10, 23);

      expect(state.selectedText).toBe('selected text');
      expect(state.selectionStart).toBe(10);
      expect(state.selectionEnd).toBe(23);
    });

    test('clears selection when empty', () => {
      const state = createInitialDiffState();
      state.selectedText = 'previously selected';
      state.selectionStart = 5;
      state.selectionEnd = 24;

      updateSelectionState(state, '', 0, 0);

      expect(state.selectedText).toBe('');
      expect(state.selectionStart).toBe(0);
      expect(state.selectionEnd).toBe(0);
    });
  });
});
