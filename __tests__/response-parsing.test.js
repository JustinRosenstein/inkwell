/**
 * Tests for Claude API response parsing
 * These test the JSON response parsing logic from renderer.js
 */

// Simulate the parsing logic from renderer.js
function parseClaudeResponse(rawContent) {
  rawContent = rawContent.trim();

  let content = null;
  let summary = null;
  let reply = null;

  try {
    const parsed = JSON.parse(rawContent);
    content = parsed.text || null;
    summary = parsed.summary || null;
    reply = parsed.reply || null;
  } catch (e) {
    // Fallback: try to find JSON embedded in response
    const jsonMatch = rawContent.match(/\{[\s\S]*"(?:reply|summary|text)"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        content = parsed.text || null;
        summary = parsed.summary || null;
        reply = parsed.reply || null;
      } catch (e2) {
        // Still not valid JSON, treat entire response as a reply
        reply = rawContent;
      }
    } else {
      // No JSON found, treat entire response as a reply
      reply = rawContent;
    }
  }

  return { content, summary, reply };
}

describe('parseClaudeResponse', () => {
  describe('valid JSON responses', () => {
    test('parses edit-only response', () => {
      const response = '{"summary": "Fixed typo", "text": "Hello world", "reply": null}';
      const result = parseClaudeResponse(response);

      expect(result.summary).toBe('Fixed typo');
      expect(result.content).toBe('Hello world');
      expect(result.reply).toBeNull();
    });

    test('parses reply-only response', () => {
      const response = '{"reply": "That looks good!", "summary": null, "text": null}';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('That looks good!');
      expect(result.summary).toBeNull();
      expect(result.content).toBeNull();
    });

    test('parses combined reply and edit response', () => {
      const response = '{"reply": "I see the file you mentioned.", "summary": "Added paragraph", "text": "Updated content here"}';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('I see the file you mentioned.');
      expect(result.summary).toBe('Added paragraph');
      expect(result.content).toBe('Updated content here');
    });

    test('handles missing optional fields', () => {
      const response = '{"text": "Just the text"}';
      const result = parseClaudeResponse(response);

      expect(result.content).toBe('Just the text');
      expect(result.summary).toBeNull();
      expect(result.reply).toBeNull();
    });

    test('handles empty strings as values', () => {
      const response = '{"reply": "", "summary": "", "text": "Content"}';
      const result = parseClaudeResponse(response);

      // Empty strings are falsy, so they become null with || null
      expect(result.reply).toBeNull();
      expect(result.summary).toBeNull();
      expect(result.content).toBe('Content');
    });
  });

  describe('JSON embedded in text', () => {
    test('extracts JSON from conversational prefix', () => {
      const response = 'Yes, I can see the file. {"summary": "Added reference", "text": "New content", "reply": null}';
      const result = parseClaudeResponse(response);

      expect(result.summary).toBe('Added reference');
      expect(result.content).toBe('New content');
    });

    test('extracts JSON from text with newlines before', () => {
      const response = 'Here is the edit:\n\n{"summary": "Improved flow", "text": "Better text"}';
      const result = parseClaudeResponse(response);

      expect(result.summary).toBe('Improved flow');
      expect(result.content).toBe('Better text');
    });

    test('handles JSON with text after', () => {
      const response = '{"summary": "Edit", "text": "Content"} Hope that helps!';
      const result = parseClaudeResponse(response);

      // The regex should match the JSON part
      expect(result.summary).toBe('Edit');
      expect(result.content).toBe('Content');
    });
  });

  describe('invalid JSON fallback', () => {
    test('treats plain text as reply', () => {
      const response = 'This is just a plain text response without any JSON.';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('This is just a plain text response without any JSON.');
      expect(result.content).toBeNull();
      expect(result.summary).toBeNull();
    });

    test('handles malformed JSON gracefully', () => {
      const response = '{"summary": "broken';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('{"summary": "broken');
      expect(result.content).toBeNull();
    });

    test('handles empty response', () => {
      const response = '';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('');
    });

    test('handles whitespace-only response', () => {
      const response = '   \n\t  ';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('');
    });
  });

  describe('edge cases', () => {
    test('handles JSON with newlines in text field', () => {
      const response = '{"summary": "Added paragraphs", "text": "First paragraph.\\n\\nSecond paragraph."}';
      const result = parseClaudeResponse(response);

      expect(result.content).toBe('First paragraph.\n\nSecond paragraph.');
    });

    test('handles JSON with special characters in text', () => {
      const response = '{"summary": "Fixed quotes", "text": "He said \\"hello\\" to me."}';
      const result = parseClaudeResponse(response);

      expect(result.content).toBe('He said "hello" to me.');
    });

    test('handles JSON with markdown in text field', () => {
      const response = '{"summary": "Added formatting", "text": "# Heading\\n\\n**Bold** and *italic*"}';
      const result = parseClaudeResponse(response);

      expect(result.content).toContain('# Heading');
      expect(result.content).toContain('**Bold**');
    });

    test('handles deeply nested-looking but valid JSON', () => {
      const response = '{"reply": "The text contains {curly braces}", "summary": null, "text": null}';
      const result = parseClaudeResponse(response);

      expect(result.reply).toBe('The text contains {curly braces}');
    });
  });

  describe('response classification', () => {
    test('edit response has content but no reply', () => {
      const response = '{"summary": "CEV rewrite", "text": "Improved version", "reply": null}';
      const result = parseClaudeResponse(response);

      const isEdit = result.content !== null;
      const isReplyOnly = result.reply !== null && result.content === null;

      expect(isEdit).toBe(true);
      expect(isReplyOnly).toBe(false);
    });

    test('question response has reply but no content', () => {
      const response = '{"reply": "Yes, that file contains meeting notes.", "summary": null, "text": null}';
      const result = parseClaudeResponse(response);

      const isEdit = result.content !== null;
      const isReplyOnly = result.reply !== null && result.content === null;

      expect(isEdit).toBe(false);
      expect(isReplyOnly).toBe(true);
    });

    test('combined response has both reply and content', () => {
      const response = '{"reply": "I found the context you mentioned.", "summary": "Added reference", "text": "New paragraph added"}';
      const result = parseClaudeResponse(response);

      const hasReply = result.reply !== null;
      const hasEdit = result.content !== null;

      expect(hasReply).toBe(true);
      expect(hasEdit).toBe(true);
    });
  });
});

describe('legacy response format compatibility', () => {
  test('handles old format with summary and text only', () => {
    // Old format didn't have reply field
    const response = '{"summary": "Old style", "text": "Content"}';
    const result = parseClaudeResponse(response);

    expect(result.summary).toBe('Old style');
    expect(result.content).toBe('Content');
    expect(result.reply).toBeNull();
  });
});
