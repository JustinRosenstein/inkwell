const {
  markersToPlaceholders,
  placeholdersToSpans,
  buildDiffMarkdown
} = require('../lib/diffMarkers');

describe('markersToPlaceholders', () => {
  test('converts deletion markers to placeholder tags', () => {
    const input = 'hello \x00DEL0\x00world\x00/DEL\x00';
    const result = markersToPlaceholders(input);
    expect(result).toBe('hello <diffdelete data-id="0">world</diffdelete>');
  });

  test('converts insertion markers to placeholder tags', () => {
    const input = 'hello \x00INS0\x00universe\x00/INS\x00';
    const result = markersToPlaceholders(input);
    expect(result).toBe('hello <diffinsert data-id="0">universe</diffinsert>');
  });

  test('handles multiple changes with different IDs', () => {
    const input = '\x00DEL0\x00old\x00/DEL\x00 \x00INS0\x00new\x00/INS\x00 middle \x00DEL1\x00removed\x00/DEL\x00';
    const result = markersToPlaceholders(input);
    expect(result).toContain('<diffdelete data-id="0">old</diffdelete>');
    expect(result).toContain('<diffinsert data-id="0">new</diffinsert>');
    expect(result).toContain('<diffdelete data-id="1">removed</diffdelete>');
  });

  test('handles markers spanning multiple lines', () => {
    const input = '\x00DEL0\x00first line\nsecond line\x00/DEL\x00';
    const result = markersToPlaceholders(input);
    expect(result).toBe('<diffdelete data-id="0">first line\nsecond line</diffdelete>');
  });

  test('handles empty content in markers', () => {
    const input = '\x00DEL0\x00\x00/DEL\x00';
    const result = markersToPlaceholders(input);
    expect(result).toBe('<diffdelete data-id="0"></diffdelete>');
  });

  test('preserves text without markers', () => {
    const input = 'plain text without any markers';
    const result = markersToPlaceholders(input);
    expect(result).toBe(input);
  });

  test('handles markers with special characters in content', () => {
    const input = '\x00INS0\x00**bold** and *italic*\x00/INS\x00';
    const result = markersToPlaceholders(input);
    expect(result).toBe('<diffinsert data-id="0">**bold** and *italic*</diffinsert>');
  });
});

describe('placeholdersToSpans', () => {
  test('converts diffdelete placeholders to spans', () => {
    const input = '<diffdelete data-id="0">deleted text</diffdelete>';
    const result = placeholdersToSpans(input);
    expect(result).toBe('<span class="diff-delete" data-change-id="0">deleted text</span>');
  });

  test('converts diffinsert placeholders to spans', () => {
    const input = '<diffinsert data-id="0">inserted text</diffinsert>';
    const result = placeholdersToSpans(input);
    expect(result).toBe('<span class="diff-insert" data-change-id="0">inserted text</span>');
  });

  test('handles placeholders inside paragraph tags', () => {
    const input = '<p>Hello <diffdelete data-id="0">world</diffdelete></p>';
    const result = placeholdersToSpans(input);
    expect(result).toBe('<p>Hello <span class="diff-delete" data-change-id="0">world</span></p>');
  });

  test('handles placeholders spanning multiple paragraphs', () => {
    // This is the key test - after markdown parsing, content might span tags
    const input = '<p><diffdelete data-id="0">first para</diffdelete></p>\n<p><diffdelete data-id="0">second para</diffdelete></p>';
    const result = placeholdersToSpans(input);
    expect(result).toContain('<span class="diff-delete" data-change-id="0">first para</span>');
    expect(result).toContain('<span class="diff-delete" data-change-id="0">second para</span>');
  });

  test('handles multiple different change IDs', () => {
    const input = '<diffdelete data-id="0">a</diffdelete><diffinsert data-id="1">b</diffinsert>';
    const result = placeholdersToSpans(input);
    expect(result).toContain('data-change-id="0"');
    expect(result).toContain('data-change-id="1"');
  });

  test('preserves HTML without placeholders', () => {
    const input = '<p>Normal <strong>HTML</strong> content</p>';
    const result = placeholdersToSpans(input);
    expect(result).toBe(input);
  });
});

describe('buildDiffMarkdown', () => {
  test('builds markdown with deletion markers', () => {
    const changes = [
      { id: null, type: 'equal', parts: [{ type: 0, text: 'hello ' }] },
      { id: 0, type: 'change', parts: [{ type: -1, text: 'world' }] }
    ];
    const result = buildDiffMarkdown(changes);
    expect(result).toBe('hello \x00DEL0\x00world\x00/DEL\x00');
  });

  test('builds markdown with insertion markers', () => {
    const changes = [
      { id: null, type: 'equal', parts: [{ type: 0, text: 'hello ' }] },
      { id: 0, type: 'change', parts: [{ type: 1, text: 'universe' }] }
    ];
    const result = buildDiffMarkdown(changes);
    expect(result).toBe('hello \x00INS0\x00universe\x00/INS\x00');
  });

  test('builds markdown with replacement (deletion + insertion)', () => {
    const changes = [
      { id: null, type: 'equal', parts: [{ type: 0, text: 'hello ' }] },
      { id: 0, type: 'change', parts: [
        { type: -1, text: 'world' },
        { type: 1, text: 'universe' }
      ]}
    ];
    const result = buildDiffMarkdown(changes);
    expect(result).toBe('hello \x00DEL0\x00world\x00/DEL\x00\x00INS0\x00universe\x00/INS\x00');
  });

  test('handles multiple changes with sequential IDs', () => {
    const changes = [
      { id: 0, type: 'change', parts: [{ type: -1, text: 'a' }] },
      { id: null, type: 'equal', parts: [{ type: 0, text: ' middle ' }] },
      { id: 1, type: 'change', parts: [{ type: 1, text: 'b' }] }
    ];
    const result = buildDiffMarkdown(changes);
    expect(result).toContain('\x00DEL0\x00a\x00/DEL\x00');
    expect(result).toContain(' middle ');
    expect(result).toContain('\x00INS1\x00b\x00/INS\x00');
  });

  test('handles empty changes array', () => {
    const result = buildDiffMarkdown([]);
    expect(result).toBe('');
  });

  test('handles only equal parts', () => {
    const changes = [
      { id: null, type: 'equal', parts: [{ type: 0, text: 'no changes here' }] }
    ];
    const result = buildDiffMarkdown(changes);
    expect(result).toBe('no changes here');
  });
});

describe('full pipeline: markers -> placeholders -> spans', () => {
  test('converts markers through full pipeline', () => {
    const input = 'hello \x00DEL0\x00world\x00/DEL\x00\x00INS0\x00universe\x00/INS\x00';
    const placeholders = markersToPlaceholders(input);
    const spans = placeholdersToSpans(placeholders);

    expect(spans).toBe('hello <span class="diff-delete" data-change-id="0">world</span><span class="diff-insert" data-change-id="0">universe</span>');
  });

  test('handles multiline content through pipeline', () => {
    const input = '\x00DEL0\x00line one\nline two\x00/DEL\x00\x00INS0\x00new line one\nnew line two\x00/INS\x00';
    const placeholders = markersToPlaceholders(input);
    const spans = placeholdersToSpans(placeholders);

    expect(spans).toContain('line one\nline two');
    expect(spans).toContain('new line one\nnew line two');
    expect(spans).toContain('class="diff-delete"');
    expect(spans).toContain('class="diff-insert"');
  });
});
