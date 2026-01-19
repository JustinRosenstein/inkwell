const { computeWordDiff, groupDiffsIntoChanges } = require('../lib/diff');

describe('computeWordDiff', () => {
  test('returns empty array for identical strings', () => {
    const result = computeWordDiff('hello world', 'hello world');
    expect(result).toEqual([{ type: 0, text: 'hello world' }]);
  });

  test('detects word insertion', () => {
    const result = computeWordDiff('hello world', 'hello beautiful world');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 0, text: 'hello ' });
    expect(result[1]).toEqual({ type: 1, text: 'beautiful ' });
    expect(result[2]).toEqual({ type: 0, text: 'world' });
  });

  test('detects word deletion', () => {
    const result = computeWordDiff('hello beautiful world', 'hello world');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 0, text: 'hello ' });
    expect(result[1]).toEqual({ type: -1, text: 'beautiful ' });
    expect(result[2]).toEqual({ type: 0, text: 'world' });
  });

  test('detects word replacement', () => {
    const result = computeWordDiff('hello world', 'hello universe');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 0, text: 'hello ' });
    expect(result[1]).toEqual({ type: -1, text: 'world' });
    expect(result[2]).toEqual({ type: 1, text: 'universe' });
  });

  test('handles empty strings', () => {
    expect(computeWordDiff('', '')).toEqual([]);
    expect(computeWordDiff('hello', '')).toEqual([{ type: -1, text: 'hello' }]);
    expect(computeWordDiff('', 'hello')).toEqual([{ type: 1, text: 'hello' }]);
  });

  test('preserves whitespace', () => {
    const result = computeWordDiff('hello  world', 'hello  universe');
    // Should preserve the double space
    const allText = result.map(d => d.text).join('');
    expect(allText).toContain('  ');
  });

  test('handles multiline text', () => {
    const original = 'first line\nsecond line';
    const proposed = 'first line\nmodified line';
    const result = computeWordDiff(original, proposed);
    expect(result.some(d => d.type === -1 && d.text.includes('second'))).toBe(true);
    expect(result.some(d => d.type === 1 && d.text.includes('modified'))).toBe(true);
  });

  test('handles punctuation as part of words', () => {
    const result = computeWordDiff('Hello, world!', 'Hello, universe!');
    expect(result.some(d => d.type === -1 && d.text === 'world!')).toBe(true);
    expect(result.some(d => d.type === 1 && d.text === 'universe!')).toBe(true);
  });
});

describe('groupDiffsIntoChanges', () => {
  test('groups consecutive changes together', () => {
    const diffs = [
      { type: 0, text: 'hello ' },
      { type: -1, text: 'old' },
      { type: 1, text: 'new' },
      { type: 0, text: ' world' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(3);
    expect(changes[0].type).toBe('equal');
    expect(changes[1].type).toBe('change');
    expect(changes[1].parts).toHaveLength(2); // deletion + insertion grouped
    expect(changes[2].type).toBe('equal');
  });

  test('assigns incremental IDs to changes', () => {
    const diffs = [
      { type: -1, text: 'first' },
      { type: 1, text: 'one' },
      { type: 0, text: ' middle ' },
      { type: -1, text: 'second' },
      { type: 1, text: 'two' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    const changeIds = changes.filter(c => c.type === 'change').map(c => c.id);
    expect(changeIds).toEqual([0, 1]);
  });

  test('handles standalone deletions', () => {
    const diffs = [
      { type: 0, text: 'hello ' },
      { type: -1, text: 'removed' },
      { type: 0, text: ' world' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(3);
    expect(changes[1].type).toBe('change');
    expect(changes[1].parts).toHaveLength(1);
    expect(changes[1].parts[0].type).toBe(-1);
  });

  test('handles standalone insertions', () => {
    const diffs = [
      { type: 0, text: 'hello ' },
      { type: 1, text: 'new' },
      { type: 0, text: ' world' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(3);
    expect(changes[1].type).toBe('change');
    expect(changes[1].parts).toHaveLength(1);
    expect(changes[1].parts[0].type).toBe(1);
  });

  test('equal parts have null id', () => {
    const diffs = [
      { type: 0, text: 'unchanged' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBeNull();
  });

  test('handles empty input', () => {
    expect(groupDiffsIntoChanges([])).toEqual([]);
  });

  test('handles all deletions', () => {
    const diffs = [
      { type: -1, text: 'deleted' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('change');
    expect(changes[0].id).toBe(0);
  });

  test('handles all insertions', () => {
    const diffs = [
      { type: 1, text: 'inserted' }
    ];
    const changes = groupDiffsIntoChanges(diffs);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('change');
    expect(changes[0].id).toBe(0);
  });
});
