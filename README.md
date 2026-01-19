# Inkwell

A minimal WYSIWYG markdown editor with AI-powered editing and word-level diff approval.

## Features

- **WYSIWYG Markdown Editing**: Write in markdown with live formatting - syntax is hidden, showing only the formatted text (like Typora)
- **AI-Powered Editing**: Chat with Claude to improve your writing
  - "Make this more concise"
  - "Fix the grammar"
  - "Make it more formal"
  - "Simplify this paragraph"
- **Word-Level Diff**: When Claude suggests changes, see exactly what's being modified
  - Deletions shown in red with strikethrough
  - Insertions shown in green
  - Changes displayed inline, interleaved
- **Per-Change Accept/Reject**: Review each change individually with inline controls, or accept/reject all at once
- **Selection Support**: Select text to edit just that portion, or edit the entire document
- **Nested Lists**: Full support for indented bullet points with Tab/Shift+Tab
- **Local Files**: Open and save `.md` files from your computer

## Getting Started

### Prerequisites

- Node.js 16+
- npm

### Installation

```bash
# Install dependencies
npm install

# Run the app
npm start

# Run in development mode (with DevTools)
npm run dev
```

### Configuration

1. Get a Claude API key from [Anthropic Console](https://console.anthropic.com/)
2. Open Settings (Cmd+, on Mac, Ctrl+, on Windows/Linux)
3. Paste your API key and save

Your API key is stored locally and never shared.

## Usage

### Writing

Simply start typing. The editor supports:
- **Bold** (Cmd+B)
- *Italic* (Cmd+I)
- ~~Strikethrough~~
- Headings (H1, H2, H3)
- Bullet lists (with nesting via Tab)
- Numbered lists (with nesting via Tab)
- Task lists
- Block quotes
- Code blocks
- Inline code

### List Indentation

- **Tab**: Indent list item (make it a sub-item)
- **Shift+Tab**: Outdent list item (move it back up a level)
- You can also use the indent/outdent buttons in the toolbar

### AI Editing

1. Type a request in the Claude sidebar chat
2. To edit a selection, first highlight the text you want to change
3. Press Enter or click Send
4. Review the word-level diff in the editor:
   - Use the inline checkmark/X buttons to accept/reject individual changes
   - Or use "Accept All" / "Reject All" buttons in the action bar
5. Keyboard shortcuts: **Cmd+Enter** to accept all, **Escape** to reject all

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Bold | Cmd+B | Ctrl+B |
| Italic | Cmd+I | Ctrl+I |
| Save | Cmd+S | Ctrl+S |
| Save As | Cmd+Shift+S | Ctrl+Shift+S |
| Open | Cmd+O | Ctrl+O |
| New | Cmd+N | Ctrl+N |
| Settings | Cmd+, | Ctrl+, |
| Indent List | Tab | Tab |
| Outdent List | Shift+Tab | Shift+Tab |
| Accept All Changes | Cmd+Enter | Ctrl+Enter |
| Reject All Changes | Escape | Escape |

## Tech Stack

- **Electron** - Cross-platform desktop app
- **TipTap** - WYSIWYG editor built on ProseMirror
- **Claude API** - AI-powered editing (claude-sonnet-4-20250514)
- **diff-match-patch** - Word-level diffing
- **Turndown** - HTML to Markdown conversion
- **Marked** - Markdown to HTML parsing
- **esbuild** - Fast JavaScript bundling

## Project Structure

```
inkwell/
├── main.js          # Electron main process
├── preload.js       # Electron preload script
├── renderer.js      # Frontend application code
├── index.html       # Main HTML file
├── styles.css       # Application styles
├── dist/            # Bundled JavaScript (generated)
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## Development

```bash
# Watch mode - auto-rebuild on changes
npm run watch

# In another terminal, run the app
npm start
```

## License

MIT
