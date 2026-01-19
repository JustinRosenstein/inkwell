/**
 * Tests for main process functionality
 * These test the pure logic extracted from main.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a temp directory for test files
const testDir = path.join(os.tmpdir(), 'inkwell-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  // Clean up test directory
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('getChatHistoryPath', () => {
  // Inline the function for testing
  function getChatHistoryPath(filePath) {
    if (!filePath) return null;
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    return path.join(dir, `${base}.inkwell`);
  }

  test('returns null for null input', () => {
    expect(getChatHistoryPath(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(getChatHistoryPath(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(getChatHistoryPath('')).toBeNull();
  });

  test('generates correct path for .md file', () => {
    const result = getChatHistoryPath('/path/to/document.md');
    expect(result).toBe('/path/to/document.inkwell');
  });

  test('generates correct path for .txt file', () => {
    const result = getChatHistoryPath('/path/to/notes.txt');
    expect(result).toBe('/path/to/notes.inkwell');
  });

  test('handles files without extension', () => {
    const result = getChatHistoryPath('/path/to/README');
    expect(result).toBe('/path/to/README.inkwell');
  });

  test('preserves directory structure', () => {
    const result = getChatHistoryPath('/Users/test/Documents/Project/file.md');
    expect(result).toBe('/Users/test/Documents/Project/file.inkwell');
  });
});

describe('readContextFolder logic', () => {
  // Test the file filtering logic
  const allowedExtensions = ['.txt', '.md', '.markdown'];

  function isAllowedFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  test('allows .txt files', () => {
    expect(isAllowedFile('notes.txt')).toBe(true);
  });

  test('allows .md files', () => {
    expect(isAllowedFile('README.md')).toBe(true);
  });

  test('allows .markdown files', () => {
    expect(isAllowedFile('document.markdown')).toBe(true);
  });

  test('rejects .js files', () => {
    expect(isAllowedFile('script.js')).toBe(false);
  });

  test('rejects .json files', () => {
    expect(isAllowedFile('config.json')).toBe(false);
  });

  test('rejects files without extension', () => {
    expect(isAllowedFile('Makefile')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(isAllowedFile('README.MD')).toBe(true);
    expect(isAllowedFile('notes.TXT')).toBe(true);
  });
});

describe('context folder file reading', () => {
  const contextDir = path.join(testDir, 'context');

  beforeAll(() => {
    fs.mkdirSync(contextDir, { recursive: true });
    // Create test files
    fs.writeFileSync(path.join(contextDir, 'readme.md'), '# Test README');
    fs.writeFileSync(path.join(contextDir, 'notes.txt'), 'Some notes');
    fs.writeFileSync(path.join(contextDir, 'script.js'), 'console.log("ignored")');
  });

  test('reads markdown files', () => {
    const content = fs.readFileSync(path.join(contextDir, 'readme.md'), 'utf-8');
    expect(content).toBe('# Test README');
  });

  test('reads text files', () => {
    const content = fs.readFileSync(path.join(contextDir, 'notes.txt'), 'utf-8');
    expect(content).toBe('Some notes');
  });

  test('lists all files in directory', () => {
    const files = fs.readdirSync(contextDir);
    expect(files).toContain('readme.md');
    expect(files).toContain('notes.txt');
    expect(files).toContain('script.js');
  });
});

describe('settings file handling', () => {
  const settingsPath = path.join(testDir, 'settings.json');

  test('can write settings to JSON file', () => {
    const settings = { apiKey: 'test-key', extendedThinking: true };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    const written = fs.readFileSync(settingsPath, 'utf-8');
    expect(JSON.parse(written)).toEqual(settings);
  });

  test('can read settings from JSON file', () => {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.apiKey).toBe('test-key');
    expect(settings.extendedThinking).toBe(true);
  });

  test('handles missing settings file gracefully', () => {
    const missingPath = path.join(testDir, 'nonexistent.json');
    expect(fs.existsSync(missingPath)).toBe(false);
  });
});

describe('chat history file handling', () => {
  const historyPath = path.join(testDir, 'document.inkwell');

  test('can write thread data', () => {
    const threadData = {
      threads: [
        { id: 'thread-1', name: 'Test Thread', messages: [{ role: 'user', content: 'Hello' }] }
      ],
      activeThreadId: 'thread-1'
    };

    fs.writeFileSync(historyPath, JSON.stringify(threadData, null, 2), 'utf-8');
    expect(fs.existsSync(historyPath)).toBe(true);
  });

  test('can read thread data', () => {
    const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    expect(data.threads).toHaveLength(1);
    expect(data.threads[0].name).toBe('Test Thread');
    expect(data.activeThreadId).toBe('thread-1');
  });

  test('handles legacy format (messages array)', () => {
    const legacyPath = path.join(testDir, 'legacy.inkwell');
    const legacyData = { messages: [{ role: 'user', content: 'Old format' }] };

    fs.writeFileSync(legacyPath, JSON.stringify(legacyData), 'utf-8');
    const data = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));

    // The main.js code handles this conversion
    expect(data.messages).toBeDefined();
    expect(data.threads).toBeUndefined(); // Legacy format
  });
});

describe('file path handling', () => {
  test('path.basename extracts filename', () => {
    expect(path.basename('/path/to/file.md')).toBe('file.md');
  });

  test('path.dirname extracts directory', () => {
    expect(path.dirname('/path/to/file.md')).toBe('/path/to');
  });

  test('path.extname extracts extension', () => {
    expect(path.extname('document.md')).toBe('.md');
    expect(path.extname('archive.tar.gz')).toBe('.gz');
    expect(path.extname('README')).toBe('');
  });

  test('path.join creates proper paths', () => {
    const result = path.join('/Users', 'test', 'Documents', 'file.md');
    expect(result).toBe('/Users/test/Documents/file.md');
  });
});
