const {
  processInlineFormatting,
  cleanHorizontalRules,
  normalizeHorizontalRules,
  escapeHtml
} = require('../lib/markdown');

describe('processInlineFormatting', () => {
  describe('bold formatting', () => {
    test('converts **text** to <strong>', () => {
      expect(processInlineFormatting('**bold**')).toBe('<strong>bold</strong>');
    });

    test('converts __text__ to <strong>', () => {
      expect(processInlineFormatting('__bold__')).toBe('<strong>bold</strong>');
    });

    test('handles multiple bold sections', () => {
      const result = processInlineFormatting('**one** and **two**');
      expect(result).toBe('<strong>one</strong> and <strong>two</strong>');
    });
  });

  describe('italic formatting', () => {
    test('converts *text* to <em>', () => {
      expect(processInlineFormatting('*italic*')).toBe('<em>italic</em>');
    });

    test('converts _text_ to <em>', () => {
      expect(processInlineFormatting('_italic_')).toBe('<em>italic</em>');
    });

    test('does not convert ** as italic', () => {
      // **bold** should stay as bold, not become *<em>bold</em>*
      const result = processInlineFormatting('**bold**');
      expect(result).toBe('<strong>bold</strong>');
      expect(result).not.toContain('<em>');
    });
  });

  describe('inline code', () => {
    test('converts `code` to <code>', () => {
      expect(processInlineFormatting('`code`')).toBe('<code>code</code>');
    });

    test('handles multiple code sections', () => {
      const result = processInlineFormatting('use `foo` and `bar`');
      expect(result).toBe('use <code>foo</code> and <code>bar</code>');
    });
  });

  describe('strikethrough', () => {
    test('converts ~~text~~ to <s>', () => {
      expect(processInlineFormatting('~~struck~~')).toBe('<s>struck</s>');
    });
  });

  describe('combined formatting', () => {
    test('handles bold and italic together', () => {
      const result = processInlineFormatting('**bold** and *italic*');
      expect(result).toBe('<strong>bold</strong> and <em>italic</em>');
    });

    test('handles all formatting types', () => {
      const result = processInlineFormatting('**bold** *italic* `code` ~~struck~~');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>code</code>');
      expect(result).toContain('<s>struck</s>');
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      expect(processInlineFormatting('')).toBe('');
    });

    test('handles string with no formatting', () => {
      expect(processInlineFormatting('plain text')).toBe('plain text');
    });

    test('handles unclosed markers', () => {
      // Unclosed markers should be left as-is
      expect(processInlineFormatting('**unclosed')).toBe('**unclosed');
      expect(processInlineFormatting('*unclosed')).toBe('*unclosed');
    });
  });
});

describe('cleanHorizontalRules', () => {
  test('removes leading horizontal rules', () => {
    expect(cleanHorizontalRules('---\nContent')).toBe('Content');
    expect(cleanHorizontalRules('***\nContent')).toBe('Content');
    expect(cleanHorizontalRules('___\nContent')).toBe('Content');
  });

  test('removes trailing horizontal rules', () => {
    expect(cleanHorizontalRules('Content\n---')).toBe('Content');
    expect(cleanHorizontalRules('Content\n***')).toBe('Content');
    expect(cleanHorizontalRules('Content\n___')).toBe('Content');
  });

  test('removes multiple leading rules', () => {
    expect(cleanHorizontalRules('---\n---\nContent')).toBe('Content');
  });

  test('removes multiple trailing rules', () => {
    expect(cleanHorizontalRules('Content\n---\n---')).toBe('Content');
  });

  test('preserves middle horizontal rules', () => {
    const input = 'Before\n---\nAfter';
    expect(cleanHorizontalRules(input)).toBe(input);
  });

  test('handles content with no horizontal rules', () => {
    expect(cleanHorizontalRules('Just text')).toBe('Just text');
  });

  test('handles empty string', () => {
    expect(cleanHorizontalRules('')).toBe('');
  });
});

describe('normalizeHorizontalRules', () => {
  test('converts --- to ***', () => {
    expect(normalizeHorizontalRules('Before\n---\nAfter')).toBe('Before\n***\nAfter');
  });

  test('converts ___ to ***', () => {
    expect(normalizeHorizontalRules('Before\n___\nAfter')).toBe('Before\n***\nAfter');
  });

  test('removes leading ---', () => {
    expect(normalizeHorizontalRules('---\nContent')).toBe('Content');
  });

  test('removes trailing ---', () => {
    expect(normalizeHorizontalRules('Content\n---')).toBe('Content');
  });

  test('handles multiple normalizations', () => {
    const input = 'A\n---\nB\n___\nC';
    const result = normalizeHorizontalRules(input);
    expect(result).toBe('A\n***\nB\n***\nC');
  });
});

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes less than', () => {
    expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;');
  });

  test('escapes greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("'quoted'")).toBe('&#39;quoted&#39;');
  });

  test('escapes multiple special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>'))
      .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('handles string with no special characters', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  test('handles unicode characters', () => {
    expect(escapeHtml('Hello 世界')).toBe('Hello 世界');
  });
});
