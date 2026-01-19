import { Editor, Mark, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DiffMatchPatch from 'diff-match-patch';

// Extension to preserve selection highlight when editor loses focus
const SelectionPreserver = Extension.create({
  name: 'selectionPreserver',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('selectionPreserver');

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return { from: 0, to: 0, hasFocus: true };
          },
          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(pluginKey);
            if (meta?.type === 'blur') {
              // Save selection on blur
              const { from, to } = oldState.selection;
              return { from, to, hasFocus: false };
            }
            if (meta?.type === 'focus') {
              return { from: 0, to: 0, hasFocus: true };
            }
            // Update selection if focused
            if (value.hasFocus) {
              const { from, to } = newState.selection;
              return { from, to, hasFocus: true };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = pluginKey.getState(state);
            if (!pluginState || pluginState.hasFocus) {
              return DecorationSet.empty;
            }

            const { from, to } = pluginState;
            if (from === to) return DecorationSet.empty;

            try {
              const decoration = Decoration.inline(from, to, {
                class: 'selection-marker',
              });
              return DecorationSet.create(state.doc, [decoration]);
            } catch (e) {
              return DecorationSet.empty;
            }
          },
        },
        view(view) {
          let isFocused = true;

          const dispatchFocus = () => {
            if (!isFocused) {
              isFocused = true;
              view.dispatch(view.state.tr.setMeta(pluginKey, { type: 'focus' }));
            }
          };

          const dispatchBlur = (e) => {
            // Only dispatch blur if we're not clicking back into the editor
            // Use setTimeout to let the new focus target be determined
            setTimeout(() => {
              if (!view.dom.contains(document.activeElement) && document.activeElement !== view.dom) {
                if (isFocused) {
                  isFocused = false;
                  view.dispatch(view.state.tr.setMeta(pluginKey, { type: 'blur' }));
                }
              }
            }, 0);
          };

          // Listen on the DOM element directly
          view.dom.addEventListener('focus', dispatchFocus, true);
          view.dom.addEventListener('blur', dispatchBlur, true);

          return {
            destroy() {
              view.dom.removeEventListener('focus', dispatchFocus, true);
              view.dom.removeEventListener('blur', dispatchBlur, true);
            },
          };
        },
      }),
    ];
  },
});

// Custom marks for diff highlighting
const DiffInsert = Mark.create({
  name: 'diffInsert',

  addAttributes() {
    return {
      changeId: {
        default: null,
        parseHTML: element => element.getAttribute('data-change-id'),
        renderHTML: attributes => {
          if (!attributes.changeId) return {};
          return { 'data-change-id': attributes.changeId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.diff-insert' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'diff-insert' }, HTMLAttributes), 0];
  },
});

const DiffDelete = Mark.create({
  name: 'diffDelete',

  addAttributes() {
    return {
      changeId: {
        default: null,
        parseHTML: element => element.getAttribute('data-change-id'),
        renderHTML: attributes => {
          if (!attributes.changeId) return {};
          return { 'data-change-id': attributes.changeId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.diff-delete' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'diff-delete' }, HTMLAttributes), 0];
  },
});

// App State
const state = {
  editor: null,
  currentFilePath: null,
  isModified: false,
  apiKey: '',
  extendedThinking: false,
  contextFolderPath: '',
  contextFiles: [], // Array of { name, content }
  contextTruncated: false,
  chatMessages: [],
  // Thread support
  threads: [],  // Array of { id, name, messages }
  activeThreadId: null,
  // Clean document content (used to restore editor when switching to thread with no diff)
  cleanDocumentMarkdown: '',
  // Diff state (per-thread, but stored here for active thread)
  originalContent: '',
  originalHtml: '',
  originalFullContent: '',
  proposedContent: '',
  proposedHtml: '',
  hasPendingDiff: false,
  selectedText: '',
  selectionStart: 0,
  selectionEnd: 0,
  isSelectionEdit: false,
  diffChanges: [],
  scrollPosition: 0,
  scrollUpdateTimeout: null,
  autosaveTimeout: null,
};

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  hr: '***',
});

turndownService.addRule('horizontalRule', {
  filter: 'hr',
  replacement: function () {
    return '\n\n***\n\n';
  }
});

turndownService.addRule('taskListItem', {
  filter: function (node) {
    return node.nodeName === 'LI' && node.parentNode && node.parentNode.getAttribute('data-type') === 'taskList';
  },
  replacement: function (content, node) {
    const checkbox = node.querySelector('input[type="checkbox"]');
    const checked = checkbox && checkbox.checked ? 'x' : ' ';
    return `- [${checked}] ${content.trim()}\n`;
  }
});

marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderer = new marked.Renderer();
renderer.hr = function() {
  return '<hr>';
};
marked.use({ renderer });

// Initialize the editor
function initEditor() {
  state.editor = new Editor({
    element: document.querySelector('#editor'),
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        horizontalRule: {
          HTMLAttributes: {
            class: 'hr-divider',
          },
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Typography,
      DiffInsert,
      DiffDelete,
      SelectionPreserver,
    ],
    content: '<p></p>',
    onUpdate: ({ editor }) => {
      if (!state.hasPendingDiff) {
        setModified(true);
        triggerAutosave();
      } else {
        // Reposition floating buttons when content changes during diff mode
        updateButtonPositions();
      }
    },
    onSelectionUpdate: ({ editor }) => {
      updateToolbarState();
      const { from, to } = editor.state.selection;
      if (from !== to) {
        state.selectedText = editor.state.doc.textBetween(from, to, '\n');
        state.selectionStart = from;
        state.selectionEnd = to;
      } else {
        state.selectedText = '';
        state.selectionStart = 0;
        state.selectionEnd = 0;
      }
    },
  });

  setupToolbar();
}

function setupToolbar() {
  document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      executeToolbarAction(action);
    });
  });
}

function executeToolbarAction(action) {
  const editor = state.editor;
  if (!editor) return;

  switch (action) {
    case 'bold':
      editor.chain().focus().toggleBold().run();
      break;
    case 'italic':
      editor.chain().focus().toggleItalic().run();
      break;
    case 'strike':
      editor.chain().focus().toggleStrike().run();
      break;
    case 'heading1':
      editor.chain().focus().toggleHeading({ level: 1 }).run();
      break;
    case 'heading2':
      editor.chain().focus().toggleHeading({ level: 2 }).run();
      break;
    case 'heading3':
      editor.chain().focus().toggleHeading({ level: 3 }).run();
      break;
    case 'bulletList':
      editor.chain().focus().toggleBulletList().run();
      break;
    case 'orderedList':
      editor.chain().focus().toggleOrderedList().run();
      break;
    case 'taskList':
      editor.chain().focus().toggleTaskList().run();
      break;
    case 'blockquote':
      editor.chain().focus().toggleBlockquote().run();
      break;
    case 'code':
      editor.chain().focus().toggleCode().run();
      break;
    case 'codeBlock':
      editor.chain().focus().toggleCodeBlock().run();
      break;
    case 'indent':
      indentList();
      break;
    case 'outdent':
      outdentList();
      break;
  }

  updateToolbarState();
}

function indentList() {
  const editor = state.editor;
  if (!editor) return;

  if (editor.can().sinkListItem('listItem')) {
    editor.chain().focus().sinkListItem('listItem').run();
  } else if (editor.can().sinkListItem('taskItem')) {
    editor.chain().focus().sinkListItem('taskItem').run();
  }
}

function outdentList() {
  const editor = state.editor;
  if (!editor) return;

  if (editor.can().liftListItem('listItem')) {
    editor.chain().focus().liftListItem('listItem').run();
  } else if (editor.can().liftListItem('taskItem')) {
    editor.chain().focus().liftListItem('taskItem').run();
  }
}

function updateToolbarState() {
  const editor = state.editor;
  if (!editor) return;

  document.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    let isActive = false;

    switch (action) {
      case 'bold':
        isActive = editor.isActive('bold');
        break;
      case 'italic':
        isActive = editor.isActive('italic');
        break;
      case 'strike':
        isActive = editor.isActive('strike');
        break;
      case 'heading1':
        isActive = editor.isActive('heading', { level: 1 });
        break;
      case 'heading2':
        isActive = editor.isActive('heading', { level: 2 });
        break;
      case 'heading3':
        isActive = editor.isActive('heading', { level: 3 });
        break;
      case 'bulletList':
        isActive = editor.isActive('bulletList');
        break;
      case 'orderedList':
        isActive = editor.isActive('orderedList');
        break;
      case 'taskList':
        isActive = editor.isActive('taskList');
        break;
      case 'blockquote':
        isActive = editor.isActive('blockquote');
        break;
      case 'code':
        isActive = editor.isActive('code');
        break;
      case 'codeBlock':
        isActive = editor.isActive('codeBlock');
        break;
    }

    btn.classList.toggle('active', isActive);
  });
}

function setModified(modified) {
  state.isModified = modified;
  document.getElementById('modified-indicator').classList.toggle('hidden', !modified);
}

// Autosave with debounce - saves 1 second after last edit
function triggerAutosave() {
  if (!state.currentFilePath) return; // Only autosave if we have a file path

  clearTimeout(state.autosaveTimeout);
  state.autosaveTimeout = setTimeout(async () => {
    if (state.isModified && state.currentFilePath) {
      const content = getMarkdownContent();
      const result = await window.electronAPI.saveFile({
        content,
        filePath: state.currentFilePath,
      });
      if (result.success) {
        setModified(false);
      }
    }
  }, 1000);
}

function updateFileName(filePath) {
  const fileName = filePath ? filePath.split('/').pop() : 'Untitled';
  document.getElementById('file-name').textContent = fileName;
  state.currentFilePath = filePath;
}

function getMarkdownContent() {
  const html = state.editor.getHTML();
  let markdown = turndownService.turndown(html);
  markdown = markdown.replace(/^(\s*(\*\*\*|---|___)\s*\n)+/, '');
  markdown = markdown.replace(/(\n\s*(\*\*\*|---|___)\s*)+$/, '');
  return markdown;
}

function setContentFromMarkdown(markdown, storeAsClean = true) {
  let cleanMarkdown = markdown
    .replace(/^(\s*---\s*\n)+/, '')
    .replace(/(\n\s*---\s*)+$/, '')
    .replace(/^---$/gm, '***')
    .replace(/^___$/gm, '***');

  // Store clean markdown for restoring editor when switching threads
  if (storeAsClean) {
    state.cleanDocumentMarkdown = cleanMarkdown;
  }

  const html = marked.parse(cleanMarkdown);
  state.editor.commands.setContent(html);
}

async function newDocument() {
  state.editor.commands.setContent('<p></p>');
  state.currentFilePath = null;
  state.cleanDocumentMarkdown = '';
  updateFileName(null);
  setModified(false);
  clearDiff();
  // Reset threads for new document
  state.threads = [];
  state.activeThreadId = null;
  clearChat(true);
  updateThreadUI();
}

async function saveDocument() {
  const content = getMarkdownContent();
  const result = await window.electronAPI.saveFile({
    content,
    filePath: state.currentFilePath,
  });

  if (result.success) {
    state.currentFilePath = result.filePath;
    updateFileName(result.filePath);
    setModified(false);
    // Remember this file for next startup
    window.electronAPI.saveLastFile(result.filePath);
  }
}

async function saveDocumentAs() {
  const content = getMarkdownContent();
  const result = await window.electronAPI.saveFileAs({ content });

  if (result.success) {
    state.currentFilePath = result.filePath;
    updateFileName(result.filePath);
    setModified(false);
    // Remember this file for next startup
    window.electronAPI.saveLastFile(result.filePath);
  }
}

async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  state.apiKey = settings.apiKey || '';
  state.extendedThinking = settings.extendedThinking || false;
  state.contextFolderPath = settings.contextFolderPath || '';
  document.getElementById('api-key').value = state.apiKey;
  document.getElementById('extended-thinking').checked = state.extendedThinking;
  document.getElementById('context-folder').value = state.contextFolderPath;

  // Load context files if folder is set
  if (state.contextFolderPath) {
    await loadContextFiles();
  }
}

async function loadContextFiles() {
  const statusEl = document.getElementById('context-folder-status');
  if (!state.contextFolderPath) {
    state.contextFiles = [];
    state.contextTruncated = false;
    if (statusEl) statusEl.textContent = '';
    return;
  }

  const result = await window.electronAPI.readContextFolder(state.contextFolderPath);
  if (result.success) {
    state.contextFiles = result.files;
    state.contextTruncated = result.truncated;
    const sizeKB = Math.round(result.totalSize / 1024);
    let status = `${result.files.length} file${result.files.length !== 1 ? 's' : ''} loaded (${sizeKB}KB)`;
    if (result.truncated) {
      status += ` - ${result.message}`;
    }
    if (statusEl) statusEl.textContent = status;
  } else {
    state.contextFiles = [];
    state.contextTruncated = false;
    if (statusEl) statusEl.textContent = `Error: ${result.error}`;
  }
}

async function saveSettings() {
  const apiKey = document.getElementById('api-key').value.trim();
  const extendedThinking = document.getElementById('extended-thinking').checked;
  const contextFolderPath = document.getElementById('context-folder').value;
  state.apiKey = apiKey;
  state.extendedThinking = extendedThinking;
  state.contextFolderPath = contextFolderPath;
  await window.electronAPI.saveSettings({ apiKey, extendedThinking, contextFolderPath });

  // Reload context files if path changed
  await loadContextFiles();
  closeSettingsModal();
}

async function selectContextFolder() {
  const result = await window.electronAPI.selectContextFolder();
  if (result.success) {
    document.getElementById('context-folder').value = result.folderPath;
    state.contextFolderPath = result.folderPath;
    await loadContextFiles();
  }
}

function clearContextFolder() {
  document.getElementById('context-folder').value = '';
  state.contextFolderPath = '';
  state.contextFiles = [];
  state.contextTruncated = false;
  document.getElementById('context-folder-status').textContent = '';
}

function openSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
  document.getElementById('api-key').value = state.apiKey;
  document.getElementById('extended-thinking').checked = state.extendedThinking;
  document.getElementById('context-folder').value = state.contextFolderPath;
  // Update status display
  loadContextFiles();
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function addChatMessage(role, content, skipSave = false) {
  // Ensure a thread exists before adding message
  if (!getActiveThread() && !skipSave) {
    const newThread = createThread();
    state.threads.push(newThread);
    state.activeThreadId = newThread.id;
  }

  // Check if this is the first user message in this thread
  // (before we add the new message or save)
  const thread = getActiveThread();
  const threadHadNoMessages = !thread || thread.messages.length === 0;
  const isFirstUserMessage = role === 'user' && state.chatMessages.length === 0 && threadHadNoMessages;

  state.chatMessages.push({ role, content });

  // Auto-save thread data when we have a file path
  if (!skipSave && state.currentFilePath) {
    saveChatData();

    // Generate smart name on first user message in thread
    if (isFirstUserMessage && thread) {
      const threadId = thread.id;
      generateThreadName(content).then(name => {
        if (name) {
          // Find thread by ID in case array changed
          const targetThread = state.threads.find(t => t.id === threadId);
          if (targetThread) {
            targetThread.name = name;
            updateThreadUI();
            saveChatData();
          }
        }
      });
    }
  }

  const messagesContainer = document.getElementById('chat-messages');
  const welcomeMessage = messagesContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `thread-message ${role}`;

  let formattedContent = escapeHtml(content);
  if (role === 'assistant') {
    formattedContent = formattedContent
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  messageDiv.innerHTML = `<div class="message-content"><p>${formattedContent}</p></div>`;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addTypingIndicator() {
  const messagesContainer = document.getElementById('chat-messages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'thread-message assistant';
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById('typing-indicator');
  if (typing) typing.remove();
}

function addChangesSummaryCard(changeCount, description = null, streaming = false) {
  const messagesContainer = document.getElementById('chat-messages');
  const welcomeMessage = messagesContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  const card = document.createElement('div');
  card.className = 'changes-summary-card';
  card.id = 'changes-summary-card';

  const countText = streaming ? '...' : `${changeCount} change${changeCount !== 1 ? 's' : ''} suggested`;

  let html = `
    <div class="changes-summary-header">
      <span class="changes-summary-icon">✎</span>
      <span class="changes-summary-count">${countText}</span>
    </div>
    <div class="changes-summary-description">${description ? escapeHtml(description) : ''}</div>
  `;

  if (!streaming) {
    html += `
      <div class="changes-summary-actions">
        <button class="changes-summary-btn accept" onclick="acceptAllChanges()">Accept all</button>
        <button class="changes-summary-btn reject" onclick="rejectAllChanges()">Reject all</button>
      </div>
    `;
  }

  card.innerHTML = html;
  messagesContainer.appendChild(card);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Only store in chat messages when not streaming (final version)
  if (!streaming) {
    state.chatMessages.push({
      role: 'changes-summary',
      content: JSON.stringify({ changeCount, description })
    });
  }
}

function updateStreamingCard(description) {
  const card = document.getElementById('changes-summary-card');
  if (!card) return;

  const descEl = card.querySelector('.changes-summary-description');
  if (descEl) {
    descEl.textContent = description;
  }

  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function finalizeStreamingCard(changeCount, description) {
  const card = document.getElementById('changes-summary-card');
  if (!card) return;

  // Update count
  const countEl = card.querySelector('.changes-summary-count');
  if (countEl) {
    countEl.textContent = `${changeCount} change${changeCount !== 1 ? 's' : ''} suggested`;
  }

  // Update description
  const descEl = card.querySelector('.changes-summary-description');
  if (descEl) {
    descEl.textContent = description || '';
  }

  // Add action buttons
  const actionsHtml = `
    <div class="changes-summary-actions">
      <button class="changes-summary-btn accept" onclick="acceptAllChanges()">Accept all</button>
      <button class="changes-summary-btn reject" onclick="rejectAllChanges()">Reject all</button>
    </div>
  `;
  card.insertAdjacentHTML('beforeend', actionsHtml);

  // Store in chat messages for persistence
  state.chatMessages.push({
    role: 'changes-summary',
    content: JSON.stringify({ changeCount, description })
  });
}

function removeChangesSummaryCard() {
  const card = document.getElementById('changes-summary-card');
  if (card) card.remove();

  // Remove from state
  state.chatMessages = state.chatMessages.filter(m => m.role !== 'changes-summary');
}

function clearChat(skipSave = false) {
  state.chatMessages = [];
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.innerHTML = `
    <div class="welcome-message">
      <p>Hi! I can help you edit your document. Try asking me to:</p>
      <ul>
        <li>"Punch up this paragraph"</li>
        <li>"Make this feel more inevitable"</li>
        <li>"Find the buried lede"</li>
        <li>"CEV"</li>
        <li>"Roast my prose"</li>
      </ul>
      <p class="hint">Select text first, or I'll work on the whole document.</p>
    </div>
  `;
  // Save empty thread history
  if (!skipSave && state.currentFilePath) {
    window.electronAPI.saveChatHistory(state.currentFilePath, []);
  }
}

async function loadChatHistory(filePath) {
  if (!filePath) {
    state.threads = [];
    state.activeThreadId = null;
    clearChat(true);
    updateThreadUI();
    return;
  }

  const data = await window.electronAPI.getChatHistory(filePath);
  console.log('loadChatHistory: loaded data:', data.threads?.length, 'threads');
  const threadsWithDiffs = (data.threads || []).filter(t => t.diffState);
  console.log('  threads with diffs:', threadsWithDiffs.length, threadsWithDiffs.map(t => t.id));
  state.threads = data.threads || [];
  state.activeThreadId = data.activeThreadId;
  console.log('  activeThreadId:', state.activeThreadId);

  // If no threads exist, create a default one
  if (state.threads.length === 0) {
    const defaultThread = createThread();
    state.threads.push(defaultThread);
    state.activeThreadId = defaultThread.id;
  }

  // Make sure activeThreadId is valid
  if (!state.threads.find(t => t.id === state.activeThreadId)) {
    state.activeThreadId = state.threads[0].id;
  }

  // Load the active thread's messages
  loadActiveThread();
  updateThreadUI();

  // Restore diff state if the active thread has one
  restoreDiffFromThread();
}

function createThread(name = null) {
  const id = `thread-${Date.now()}`;
  const threadNum = state.threads.length + 1;
  return {
    id,
    name: name || `Thread ${threadNum}`,
    messages: [],
    // Diff state for this thread
    diffState: null  // { originalContent, originalHtml, originalFullContent, proposedContent, proposedHtml, diffChanges, isSelectionEdit, selectionStart, selectionEnd }
  };
}

function getActiveThread() {
  return state.threads.find(t => t.id === state.activeThreadId);
}

function loadActiveThread() {
  const thread = getActiveThread();
  state.chatMessages = [];
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.innerHTML = '';

  if (thread && thread.messages.length > 0) {
    for (const msg of thread.messages) {
      if (msg.role === 'changes-summary') {
        // Restore the changes summary card
        try {
          const data = JSON.parse(msg.content);
          addChangesSummaryCard(data.changeCount, data.description);
        } catch (e) {
          console.error('Failed to parse changes-summary:', e);
        }
      } else {
        addChatMessage(msg.role, msg.content, true);
      }
    }
  } else {
    // Show welcome message for empty thread
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <p>Hi! I can help you edit your document. Try asking me to:</p>
        <ul>
          <li>"Punch up this paragraph"</li>
          <li>"Make this feel more inevitable"</li>
          <li>"Find the buried lede"</li>
          <li>"CEV"</li>
          <li>"Roast my prose"</li>
        </ul>
        <p class="hint">Select text first, or I'll work on the whole document.</p>
      </div>
    `;
  }
}

function saveCurrentDiffToThread() {
  const thread = getActiveThread();
  console.log('saveCurrentDiffToThread:', thread?.id, 'hasPendingDiff:', state.hasPendingDiff);
  if (!thread) return;

  if (state.hasPendingDiff) {
    console.log('  saving diffState with', state.diffChanges.length, 'changes');
    thread.diffState = {
      originalContent: state.originalContent,
      originalHtml: state.originalHtml,
      originalFullContent: state.originalFullContent,
      proposedContent: state.proposedContent,
      proposedHtml: state.proposedHtml,
      diffChanges: [...state.diffChanges],
      isSelectionEdit: state.isSelectionEdit,
      selectionStart: state.selectionStart,
      selectionEnd: state.selectionEnd
    };
  } else {
    thread.diffState = null;
  }
}

function restoreDiffFromThread() {
  const thread = getActiveThread();
  console.log('restoreDiffFromThread:', thread?.id, 'has diffState:', !!thread?.diffState);
  if (!thread) return;

  // First clear any existing diff UI (but don't touch chat messages - they're already loaded)
  state.hasPendingDiff = false;
  state.originalContent = '';
  state.originalHtml = '';
  state.originalFullContent = '';
  state.proposedContent = '';
  state.proposedHtml = '';
  state.isSelectionEdit = false;
  state.diffChanges = [];
  document.getElementById('diff-action-bar').classList.add('hidden');
  const container = document.getElementById('diff-buttons-container');
  if (container) container.innerHTML = '';

  if (thread.diffState) {
    console.log('  restoring diffState with', thread.diffState.diffChanges?.length, 'changes');
    // Restore diff state
    state.originalContent = thread.diffState.originalContent;
    state.originalHtml = thread.diffState.originalHtml;
    state.originalFullContent = thread.diffState.originalFullContent;
    state.proposedContent = thread.diffState.proposedContent;
    state.proposedHtml = thread.diffState.proposedHtml;
    state.diffChanges = [...thread.diffState.diffChanges];
    state.isSelectionEdit = thread.diffState.isSelectionEdit;
    state.selectionStart = thread.diffState.selectionStart;
    state.selectionEnd = thread.diffState.selectionEnd;
    state.hasPendingDiff = true;

    // Re-render the diff
    renderDiffInEditor();
  } else {
    // No diff for this thread - restore clean document
    if (state.cleanDocumentMarkdown) {
      setContentFromMarkdown(state.cleanDocumentMarkdown, false);
    }
  }
}

function switchToThread(threadId) {
  if (state.activeThreadId === threadId) return;

  console.log('switchToThread:', threadId);
  console.log('  current hasPendingDiff:', state.hasPendingDiff);

  // Save current thread's diff state before switching
  saveCurrentDiffToThread();

  const oldThread = getActiveThread();
  console.log('  saved diffState to old thread:', oldThread?.diffState ? 'yes' : 'no');

  state.activeThreadId = threadId;
  loadActiveThread();
  updateThreadUI();

  const newThread = getActiveThread();
  console.log('  new thread has diffState:', newThread?.diffState ? 'yes' : 'no');

  // Restore new thread's diff state
  restoreDiffFromThread();

  console.log('  after restore, hasPendingDiff:', state.hasPendingDiff);

  saveChatData();
}

function createNewThread() {
  // Save current thread's diff state before creating new
  saveCurrentDiffToThread();

  const newThread = createThread();
  state.threads.push(newThread);
  state.activeThreadId = newThread.id;
  loadActiveThread();
  updateThreadUI();

  // Clear diff for new thread (it has no diff yet)
  clearDiff();

  saveChatData();
}

function saveChatData() {
  if (!state.currentFilePath) return;

  // Sync current messages to active thread
  const thread = getActiveThread();
  if (thread) {
    thread.messages = [...state.chatMessages];
  }

  const threadsWithDiffs = state.threads.filter(t => t.diffState);
  console.log('saveChatData: saving', state.threads.length, 'threads,', threadsWithDiffs.length, 'with diffs');
  if (threadsWithDiffs.length > 0) {
    console.log('  threads with diffs:', threadsWithDiffs.map(t => t.id));
  }

  window.electronAPI.saveChatHistory(state.currentFilePath, {
    threads: state.threads,
    activeThreadId: state.activeThreadId
  });
}

function updateThreadUI() {
  const thread = getActiveThread();
  const threadNameEl = document.getElementById('thread-name');
  if (threadNameEl) {
    threadNameEl.textContent = thread ? thread.name : 'Thread 1';
  }
  updateThreadMenu();
}

function updateThreadMenu() {
  const menu = document.getElementById('thread-menu');
  if (!menu) return;

  // Note: We do NOT call saveCurrentDiffToThread here because this function
  // is called during loadChatHistory before restoreDiffFromThread runs.
  // The diff state should already be on the thread from either:
  // - Being saved when the diff was created (showDiff)
  // - Being saved when switching away from this thread (switchToThread)

  menu.innerHTML = state.threads.map(thread => {
    const isActive = thread.id === state.activeThreadId;
    const msgCount = thread.messages.length;
    const hasDiff = thread.diffState !== null;
    return `
      <button class="thread-menu-item ${isActive ? 'active' : ''}" data-thread-id="${thread.id}">
        <span class="thread-menu-item-name">${escapeHtml(thread.name)}</span>
        <span class="thread-menu-item-meta">
          ${hasDiff ? '<span class="thread-diff-indicator" title="Has pending changes">●</span>' : ''}
          <span class="thread-menu-item-count">${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
        </span>
      </button>
    `;
  }).join('');

  // Add click handlers
  menu.querySelectorAll('.thread-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      switchToThread(item.dataset.threadId);
      closeThreadMenu();
    });
  });
}

function toggleThreadMenu() {
  const selector = document.getElementById('thread-selector');
  const menu = document.getElementById('thread-menu');
  const isOpen = !menu.classList.contains('hidden');

  if (isOpen) {
    closeThreadMenu();
  } else {
    selector.classList.add('open');
    menu.classList.remove('hidden');
    updateThreadMenu();
  }
}

function closeThreadMenu() {
  const selector = document.getElementById('thread-selector');
  const menu = document.getElementById('thread-menu');
  selector.classList.remove('open');
  menu.classList.add('hidden');
}

// Generate a smart name for a thread based on first message
async function generateThreadName(userMessage) {
  if (!state.apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        messages: [
          { role: 'user', content: `Generate a very short (2-4 word) title for a thread thread that starts with this message. Return ONLY the title, no quotes or punctuation:\n\n"${userMessage}"` }
        ]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const name = data.content[0].text.trim();
      return name.length > 30 ? name.slice(0, 30) + '...' : name;
    }
  } catch (e) {
    console.error('Failed to generate thread name:', e);
  }
  return null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendToClaudeAPI(userMessage) {
  if (!state.apiKey) {
    addChatMessage('assistant', 'Please set your Claude API key in Settings (Cmd+,)');
    return null;
  }

  const textToEdit = state.selectedText || getMarkdownContent();
  const isSelection = !!state.selectedText;

  state.originalFullContent = getMarkdownContent();
  state.originalHtml = state.editor.getHTML();

  // Build project context section if files are loaded
  let projectContextSection = '';
  if (state.contextFiles.length > 0) {
    const contextParts = state.contextFiles.map(f => `=== ${f.name} ===\n${f.content}`);
    projectContextSection = `

PROJECT CONTEXT:
The following files are part of the user's project and provide important context for their writing:

${contextParts.join('\n\n')}

END PROJECT CONTEXT
`;
    if (state.contextTruncated) {
      projectContextSection += '\n(Note: Some context files were omitted due to size limits.)\n';
    }
  }

  const systemPrompt = `You are an AI writing assistant integrated into a markdown editor called Inkwell. Your job is to help users improve their writing.

When the user asks you to edit text, respond with JSON in this exact format:
{"summary": "brief description of changes", "text": "the edited text here"}

Rules for edits:
1. Make the requested changes to the provided text
2. Preserve the markdown formatting exactly as provided
3. Keep the same overall structure unless asked to change it
4. Do NOT add horizontal rules (---) or any dividers unless specifically asked
5. The "summary" field MUST come first and should be a short phrase describing what you changed (e.g., "Tightened prose and fixed comma splice")

If the user asks a question (not an edit request), respond with plain text (not JSON) - just answer briefly and helpfully.

Special commands:
- "CEV" or "coherent extrapolated volition": Rewrite the text to be what the author would have written if they had more time, skill, and clarity. Preserve their voice and intent, but execute it better.

${isSelection
    ? `IMPORTANT: The user has SELECTED a specific portion of their document. When they say "this", "it", or similar pronouns, they mean the selected text below. Edit ONLY this selection and return only the edited selection.`
    : `The user is editing their ENTIRE document. No text is currently selected.`}${projectContextSection}`;

  const userPrompt = `Here is the text to edit:

${textToEdit}

User request: ${userMessage}`;

  try {
    // Build request body
    const requestBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: state.extendedThinking ? 16000 : 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      // Enable web search tool
      tools: [
        { type: 'web_search_20250305', name: 'web_search' }
      ],
      stream: !state.extendedThinking, // Can't stream with extended thinking
    };

    // Add extended thinking if enabled
    if (state.extendedThinking) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: 10000
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    let rawContent = '';

    if (state.extendedThinking) {
      // Non-streaming path for extended thinking
      const data = await response.json();
      for (const block of data.content) {
        if (block.type === 'text') {
          rawContent += block.text;
        }
      }
    } else {
      // Streaming path
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamingSummary = '';
      let inSummary = false;
      let summaryComplete = false;
      let cardShown = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              // Handle content_block_delta events
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                const text = event.delta.text;
                rawContent += text;

                // Try to extract and stream the summary
                if (rawContent.startsWith('{') && !summaryComplete) {
                  // Look for summary field
                  const summaryMatch = rawContent.match(/"summary"\s*:\s*"([^"]*)/);
                  if (summaryMatch) {
                    inSummary = true;
                    streamingSummary = summaryMatch[1];

                    // Show card on first summary content
                    if (!cardShown && streamingSummary.length > 0) {
                      removeTypingIndicator();
                      addChangesSummaryCard(0, streamingSummary, true);
                      cardShown = true;
                    } else if (cardShown) {
                      updateStreamingCard(streamingSummary);
                    }

                    // Check if summary is complete (closing quote followed by comma or text field)
                    if (rawContent.match(/"summary"\s*:\s*"[^"]*"\s*,/)) {
                      summaryComplete = true;
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore parse errors for malformed events
            }
          }
        }
      }
    }

    rawContent = rawContent.trim();

    // Try to parse as JSON (structured edit response)
    let content = rawContent;
    let summary = null;

    if (rawContent.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed.text) {
          content = parsed.text;
          summary = parsed.summary || null;
        }
      } catch (e) {
        // Not valid JSON, use raw content
      }
    }

    content = content.replace(/^(\s*---\s*\n)+/, '');
    content = content.replace(/(\n\s*---\s*)+$/, '');

    return {
      content,
      summary,
      isSelection,
      originalText: textToEdit,
      wasStreaming: !state.extendedThinking,
    };
  } catch (error) {
    console.error('Claude API error:', error);
    addChatMessage('assistant', `Error: ${error.message}`);
    return null;
  }
}

async function handleThreadSubmit() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!message) return;

  if (state.hasPendingDiff) {
    rejectChanges();
  }

  input.value = '';
  input.style.height = 'auto';
  updateSendButton();

  addChatMessage('user', message);
  addTypingIndicator();

  const result = await sendToClaudeAPI(message);
  removeTypingIndicator();

  if (result) {
    const originalLen = result.originalText.length;
    const newLen = result.content.length;
    const lenRatio = Math.min(originalLen, newLen) / Math.max(originalLen, newLen);

    const conversationalStarts = /^(I |Sure|Yes|No|Sorry|Unfortunately|Thanks|Thank you|Of course|Certainly|Here's|That's|This is|The |It |You |To |For |In |As |My |Your |We |They |He |She |If |When |While |Although |However|But |And |Or |Because|Since|After|Before|During|With |Without|About|Like |Unlike)/i;
    const isLikelyEdit = (lenRatio > 0.1 || originalLen < 200) && !conversationalStarts.test(result.content);

    if (isLikelyEdit && result.content !== result.originalText) {
      const changeCount = showDiff(result.originalText, result.content, result.isSelection);

      // If streaming was used, card is already shown - just finalize it
      // Otherwise, create the card from scratch
      const existingCard = document.getElementById('changes-summary-card');
      if (result.wasStreaming && existingCard) {
        finalizeStreamingCard(changeCount, result.summary);
      } else {
        // Remove any partial streaming card if it exists
        if (existingCard) existingCard.remove();
        addChangesSummaryCard(changeCount, result.summary);
      }
      saveChatData(); // Save again to persist the changes-summary card
    } else {
      // Not an edit - remove any streaming card that might have been shown
      const existingCard = document.getElementById('changes-summary-card');
      if (existingCard) existingCard.remove();
      addChatMessage('assistant', result.content);
    }
  }
}

// Word-level diff on plain text
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

function showDiff(originalText, proposedText, isSelection) {
  const editorElement = document.querySelector('#editor');
  state.scrollPosition = editorElement.scrollTop;

  state.hasPendingDiff = true;
  state.originalContent = originalText;
  state.proposedContent = proposedText;
  state.isSelectionEdit = isSelection;

  // Convert proposed markdown to HTML for WYSIWYG display
  state.proposedHtml = marked.parse(proposedText);

  const diffs = computeWordDiff(originalText, proposedText);
  const changes = groupDiffsIntoChanges(diffs);
  state.diffChanges = changes;

  const changeCount = changes.filter(c => c.type === 'change').length;
  updateDiffCounter(changeCount);

  // Build the diff HTML with proper formatting using our custom marks
  const diffHtml = buildRichDiffHtml(changes);

  let finalHtml;
  if (isSelection && state.originalFullContent) {
    // For selection edits, we need to embed the diff within the full document
    // Find where the selection was in the original markdown and replace it with the diff
    const fullMarkdown = state.originalFullContent;
    const selectionIndex = fullMarkdown.indexOf(originalText);

    if (selectionIndex !== -1) {
      const beforeSelection = fullMarkdown.substring(0, selectionIndex);
      const afterSelection = fullMarkdown.substring(selectionIndex + originalText.length);

      // Convert before/after to HTML, then combine with diff HTML
      const beforeHtml = beforeSelection ? marked.parse(beforeSelection) : '';
      const afterHtml = afterSelection ? marked.parse(afterSelection) : '';

      // We need to be smarter here - the diff might be in the middle of a paragraph
      // For now, just concatenate (this works if selection is on paragraph boundaries)
      finalHtml = beforeHtml + diffHtml + afterHtml;
    } else {
      finalHtml = diffHtml;
    }
  } else {
    finalHtml = diffHtml;
  }

  state.editor.commands.setContent(finalHtml);

  // Restore scroll position and add inline buttons
  requestAnimationFrame(() => {
    editorElement.scrollTop = state.scrollPosition;
    // Add inline accept/reject buttons after each change group
    addInlineButtons();
  });

  document.getElementById('diff-action-bar').classList.remove('hidden');
  // Keep editor editable for Google Docs-style experience
  state.editor.setEditable(true);

  // Save diff state to current thread and persist
  saveCurrentDiffToThread();
  saveChatData();

  return changeCount;
}

// Re-render diff from existing state (used when switching threads)
function renderDiffInEditor() {
  if (!state.hasPendingDiff || !state.diffChanges.length) return;

  const editorElement = document.querySelector('#editor');

  const changes = state.diffChanges;
  const changeCount = changes.filter(c => c.type === 'change').length;
  updateDiffCounter(changeCount);

  const diffHtml = buildRichDiffHtml(changes);

  let finalHtml;
  if (state.isSelectionEdit && state.originalFullContent) {
    const fullMarkdown = state.originalFullContent;
    const selectionIndex = fullMarkdown.indexOf(state.originalContent);

    if (selectionIndex !== -1) {
      const beforeSelection = fullMarkdown.substring(0, selectionIndex);
      const afterSelection = fullMarkdown.substring(selectionIndex + state.originalContent.length);
      const beforeHtml = beforeSelection ? marked.parse(beforeSelection) : '';
      const afterHtml = afterSelection ? marked.parse(afterSelection) : '';
      finalHtml = beforeHtml + diffHtml + afterHtml;
    } else {
      finalHtml = diffHtml;
    }
  } else {
    finalHtml = diffHtml;
  }

  state.editor.commands.setContent(finalHtml);

  requestAnimationFrame(() => {
    addInlineButtons();
  });

  document.getElementById('diff-action-bar').classList.remove('hidden');
  state.editor.setEditable(true);
}

function buildRichDiffHtml(changes) {
  // Build combined text with diff spans, then convert to HTML
  let diffMarkdown = '';

  for (const change of changes) {
    if (change.type === 'equal') {
      // Equal text - add as-is (will be parsed as markdown later)
      diffMarkdown += change.parts[0].text;
    } else {
      const changeId = change.id;
      for (const part of change.parts) {
        if (part.type === -1) {
          // Deletion - wrap in our custom mark
          diffMarkdown += `\x00DEL${changeId}\x00${part.text}\x00/DEL\x00`;
        } else if (part.type === 1) {
          // Insertion - wrap in our custom mark
          diffMarkdown += `\x00INS${changeId}\x00${part.text}\x00/INS\x00`;
        }
      }
    }
  }

  // Convert markdown to HTML while preserving diff markers
  const html = parseMarkdownWithDiffMarkers(diffMarkdown);

  return html;
}

function parseMarkdownWithDiffMarkers(text) {
  // Parse text that has \x00DEL{id}\x00...\x00/DEL\x00 and \x00INS{id}\x00...\x00/INS\x00 markers
  // Strategy: Convert markers to HTML-safe placeholders, parse markdown, then convert back to spans

  // Step 1: Convert diff markers to HTML-safe placeholder spans BEFORE markdown parsing
  // These placeholder spans will survive markdown parsing
  let processed = text;
  processed = processed.replace(/\x00DEL(\d+)\x00([\s\S]*?)\x00\/DEL\x00/g,
    '<diffdelete data-id="$1">$2</diffdelete>');
  processed = processed.replace(/\x00INS(\d+)\x00([\s\S]*?)\x00\/INS\x00/g,
    '<diffinsert data-id="$1">$2</diffinsert>');

  // Step 2: Use marked to parse the markdown (it will preserve our custom tags)
  let html = marked.parse(processed);

  // Step 3: Convert our placeholder tags to proper diff spans
  html = html.replace(/<diffdelete data-id="(\d+)">([\s\S]*?)<\/diffdelete>/g,
    '<span class="diff-delete" data-change-id="$1">$2</span>');
  html = html.replace(/<diffinsert data-id="(\d+)">([\s\S]*?)<\/diffinsert>/g,
    '<span class="diff-insert" data-change-id="$1">$2</span>');

  return html;
}

// processInlineFormatting removed - now using marked library for all markdown parsing

function addInlineButtons() {
  const editorEl = document.querySelector('#editor .ProseMirror');
  const container = document.getElementById('diff-buttons-container');
  if (!editorEl || !container) return;

  // Clear existing buttons
  container.innerHTML = '';

  // Find all change groups and create floating buttons
  const processedChangeIds = new Set();
  const editorRect = document.querySelector('#editor').getBoundingClientRect();
  const containerRect = document.querySelector('.editor-container').getBoundingClientRect();

  // Get all diff spans
  const allSpans = editorEl.querySelectorAll('.diff-insert, .diff-delete');

  allSpans.forEach(span => {
    const changeId = span.getAttribute('data-change-id');
    if (!changeId || processedChangeIds.has(changeId)) return;

    // Find all spans for this change and get the last one
    const changeSpans = editorEl.querySelectorAll(`[data-change-id="${changeId}"]`);
    const lastSpan = changeSpans[changeSpans.length - 1];

    // Get position of the last span
    const spanRect = lastSpan.getBoundingClientRect();

    // Create floating button group
    const btnGroup = document.createElement('div');
    btnGroup.className = 'floating-diff-btn';
    btnGroup.setAttribute('data-change-id', changeId);

    // Position relative to editor container
    btnGroup.style.left = `${spanRect.right - containerRect.left + 4}px`;
    btnGroup.style.top = `${spanRect.top - containerRect.top}px`;

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'diff-inline-btn accept';
    acceptBtn.innerHTML = '&#10003;';
    acceptBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      acceptSingleChange(parseInt(changeId, 10));
    };

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'diff-inline-btn reject';
    rejectBtn.innerHTML = '&#10005;';
    rejectBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      rejectSingleChange(parseInt(changeId, 10));
    };

    btnGroup.appendChild(acceptBtn);
    btnGroup.appendChild(rejectBtn);
    container.appendChild(btnGroup);

    processedChangeIds.add(changeId);
  });
}

// Update floating button positions on scroll or content change
function setupScrollListener() {
  const editorEl = document.querySelector('#editor');
  if (editorEl) {
    editorEl.addEventListener('scroll', () => {
      if (state.hasPendingDiff) {
        updateButtonPositions();
      }
    });
  }
}

// Debounced button position update
function updateButtonPositions() {
  clearTimeout(state.scrollUpdateTimeout);
  state.scrollUpdateTimeout = setTimeout(() => {
    addInlineButtons();
  }, 50);
}

function setupDiffButtonListener() {
  // No longer needed - buttons are outside ProseMirror now with direct onclick handlers
}

function updateDiffCounter(count) {
  const label = document.querySelector('.diff-label');
  if (label) {
    label.textContent = `${count} change${count !== 1 ? 's' : ''} suggested`;
  }
}

function acceptSingleChange(changeId) {
  const change = state.diffChanges.find(c => c.id === changeId);
  if (!change || change.resolved) return;

  change.resolved = true;
  change.accepted = true;

  const editorEl = document.querySelector('#editor .ProseMirror');
  if (!editorEl) return;

  // Remove the controls first
  editorEl.querySelectorAll(`.diff-inline-controls[data-change-id="${changeId}"]`).forEach(el => {
    el.remove();
  });

  // Remove all deletions for this change
  editorEl.querySelectorAll(`.diff-delete[data-change-id="${changeId}"]`).forEach(el => {
    el.remove();
  });

  // Remove styling from insertions (unwrap the span, keep content)
  editorEl.querySelectorAll(`.diff-insert[data-change-id="${changeId}"]`).forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  });

  // Sync DOM changes back to TipTap
  syncDomToEditor();
  checkAllChangesResolved();
}

function rejectSingleChange(changeId) {
  const change = state.diffChanges.find(c => c.id === changeId);
  if (!change || change.resolved) return;

  change.resolved = true;
  change.rejected = true;

  const editorEl = document.querySelector('#editor .ProseMirror');
  if (!editorEl) return;

  // Remove the controls first
  editorEl.querySelectorAll(`.diff-inline-controls[data-change-id="${changeId}"]`).forEach(el => {
    el.remove();
  });

  // Remove all insertions for this change
  editorEl.querySelectorAll(`.diff-insert[data-change-id="${changeId}"]`).forEach(el => {
    el.remove();
  });

  // Remove styling from deletions (unwrap the span, keep content)
  editorEl.querySelectorAll(`.diff-delete[data-change-id="${changeId}"]`).forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  });

  // Sync DOM changes back to TipTap
  syncDomToEditor();
  checkAllChangesResolved();
}

function syncDomToEditor() {
  // Get the current DOM content and set it back to the editor
  // This syncs manual DOM changes back to ProseMirror's state
  const editorEl = document.querySelector('#editor .ProseMirror');
  const editorElement = document.querySelector('#editor');
  if (editorEl && state.editor) {
    const scrollPos = editorElement.scrollTop;
    const html = editorEl.innerHTML;
    // Temporarily disable the update handler to avoid infinite loop
    const hadPendingDiff = state.hasPendingDiff;
    state.editor.commands.setContent(html, false);
    state.hasPendingDiff = hadPendingDiff;

    // Re-add buttons after content sync if there are still pending changes
    const unresolvedChanges = state.diffChanges.filter(c => c.type === 'change' && !c.resolved);
    if (unresolvedChanges.length > 0) {
      requestAnimationFrame(() => {
        editorElement.scrollTop = scrollPos;
        addInlineButtons();
      });
    } else {
      requestAnimationFrame(() => {
        editorElement.scrollTop = scrollPos;
      });
    }
  }
}

function checkAllChangesResolved() {
  const unresolvedChanges = state.diffChanges.filter(c =>
    c.type === 'change' && !c.resolved
  );

  updateDiffCounter(unresolvedChanges.length);

  if (unresolvedChanges.length === 0) {
    finalizeChanges();
  }
}

function finalizeChanges() {
  const editorElement = document.querySelector('#editor');
  const scrollPos = editorElement.scrollTop;

  // Get the current editor HTML and clean it
  const editorEl = document.querySelector('#editor .ProseMirror');
  if (editorEl) {
    // The content should already be clean since we removed diff elements
    const html = editorEl.innerHTML;
    state.editor.setEditable(true);
    state.editor.commands.setContent(html);
  }

  clearDiff();
  setModified(true);
  triggerAutosave();
  addChatMessage('assistant', 'Changes applied!');

  requestAnimationFrame(() => {
    editorElement.scrollTop = scrollPos;
  });
}

function acceptChanges() {
  if (!state.hasPendingDiff) return;

  const editorElement = document.querySelector('#editor');
  const scrollPos = editorElement.scrollTop;

  state.editor.setEditable(true);

  if (state.isSelectionEdit) {
    const fullContent = state.originalFullContent;
    const idx = fullContent.indexOf(state.originalContent);
    if (idx !== -1) {
      const beforeSelection = fullContent.substring(0, idx);
      const afterSelection = fullContent.substring(idx + state.originalContent.length);
      const newContent = beforeSelection + state.proposedContent + afterSelection;
      setContentFromMarkdown(newContent);
    } else {
      setContentFromMarkdown(state.proposedContent);
    }
  } else {
    setContentFromMarkdown(state.proposedContent);
  }

  clearDiff();
  // Clear the thread's stored diff state since changes were accepted
  const thread = getActiveThread();
  if (thread) thread.diffState = null;

  setModified(true);
  triggerAutosave();
  addChatMessage('assistant', 'All changes accepted!');

  requestAnimationFrame(() => {
    editorElement.scrollTop = scrollPos;
  });
}

function rejectChanges() {
  if (!state.hasPendingDiff) return;

  const editorElement = document.querySelector('#editor');
  const scrollPos = editorElement.scrollTop;

  state.editor.setEditable(true);

  // Restore clean document content (don't update cleanDocumentMarkdown since we're restoring)
  if (state.cleanDocumentMarkdown) {
    setContentFromMarkdown(state.cleanDocumentMarkdown, false);
  } else if (state.isSelectionEdit) {
    setContentFromMarkdown(state.originalFullContent, false);
  } else {
    setContentFromMarkdown(state.originalContent, false);
  }

  clearDiff();
  // Clear the thread's stored diff state since changes were rejected
  const thread = getActiveThread();
  if (thread) thread.diffState = null;

  addChatMessage('assistant', 'Changes rejected. The original text has been restored.');

  requestAnimationFrame(() => {
    editorElement.scrollTop = scrollPos;
  });
}

function clearDiff() {
  state.hasPendingDiff = false;
  state.originalContent = '';
  state.originalHtml = '';
  state.originalFullContent = '';
  state.proposedContent = '';
  state.proposedHtml = '';
  state.isSelectionEdit = false;
  state.diffChanges = [];
  document.getElementById('diff-action-bar').classList.add('hidden');
  // Clear floating buttons
  const container = document.getElementById('diff-buttons-container');
  if (container) container.innerHTML = '';
  // Remove the changes summary card
  removeChangesSummaryCard();
}

function setupResizeHandle() {
  const handle = document.getElementById('resize-handle');
  const sidebar = document.getElementById('sidebar');
  let isResizing = false;
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = startX - e.clientX;
    const newWidth = Math.min(600, Math.max(280, startWidth + delta));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function setupEventListeners() {
  const threadInput = document.getElementById('chat-input');
  threadInput.addEventListener('input', () => {
    threadInput.style.height = 'auto';
    threadInput.style.height = Math.min(threadInput.scrollHeight, 120) + 'px';
    updateSendButton();
  });

  threadInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleThreadSubmit();
    }
  });

  document.getElementById('send-btn').addEventListener('click', handleThreadSubmit);
  // Clear thread button removed from UI

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  document.getElementById('accept-changes').addEventListener('click', acceptChanges);
  document.getElementById('reject-changes').addEventListener('click', rejectChanges);

  document.getElementById('close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('select-context-folder').addEventListener('click', selectContextFolder);
  document.getElementById('clear-context-folder').addEventListener('click', clearContextFolder);
  document.querySelector('.modal-backdrop').addEventListener('click', closeSettingsModal);

  // Thread UI
  document.getElementById('thread-selector').addEventListener('click', toggleThreadMenu);
  document.getElementById('new-thread-btn').addEventListener('click', createNewThread);

  // Close thread menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('thread-menu');
    const selector = document.getElementById('thread-selector');
    const newBtn = document.getElementById('new-thread-btn');
    if (!menu.contains(e.target) && !selector.contains(e.target) && !newBtn.contains(e.target)) {
      closeThreadMenu();
    }
  });

  window.electronAPI.onMenuNew(() => newDocument());
  window.electronAPI.onMenuSave(() => saveDocument());
  window.electronAPI.onMenuSaveAs(() => saveDocumentAs());
  window.electronAPI.onMenuSettings(() => openSettingsModal());
  window.electronAPI.onFileOpened(async ({ filePath, content }) => {
    state.currentFilePath = filePath;
    setContentFromMarkdown(content);
    updateFileName(filePath);
    setModified(false);
    clearDiff();
    // Load thread history for this document
    await loadChatHistory(filePath);
    // Remember this file for next startup
    window.electronAPI.saveLastFile(filePath);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !state.hasPendingDiff) {
      const editor = state.editor;
      if (editor && (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList'))) {
        e.preventDefault();
        if (e.shiftKey) {
          outdentList();
        } else {
          indentList();
        }
        return;
      }
    }

    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          executeToolbarAction('bold');
          break;
        case 'i':
          e.preventDefault();
          executeToolbarAction('italic');
          break;
        case 'Enter':
          if (state.hasPendingDiff) {
            e.preventDefault();
            acceptChanges();
          }
          break;
      }
    }

    if (e.key === 'Escape' && state.hasPendingDiff) {
      e.preventDefault();
      rejectChanges();
    }
  });
}

function updateSendButton() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = !input.value.trim();
}

async function init() {
  initEditor();
  setupEventListeners();
  setupScrollListener();
  setupResizeHandle();
  await loadSettings();

  // Try to restore last opened file
  const lastFile = await window.electronAPI.getLastFile();
  if (lastFile) {
    state.currentFilePath = lastFile.filePath;
    updateFileName(lastFile.filePath);
    setContentFromMarkdown(lastFile.content);
    setModified(false);
    // Load thread history for this document
    await loadChatHistory(lastFile.filePath);
  } else {
    // No file - initialize with empty thread state
    state.threads = [];
    state.activeThreadId = null;
    updateThreadUI();
  }

  if (!state.apiKey) {
    setTimeout(() => {
      addChatMessage('assistant', 'Welcome to Inkwell! To use AI editing, please add your Claude API key in Settings (Cmd+,)', true);
    }, 500);
  }
}

init();

// Expose functions for onclick handlers in dynamically created HTML
window.acceptAllChanges = acceptChanges;
window.rejectAllChanges = rejectChanges;
