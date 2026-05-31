# eAI Agent Chat — VS Code Extension v2.0

An evolutionary AI agent system integrated directly into your VS Code sidebar.
Talks to your local Ollama backend and falls back to cloud providers.

---

## What's New in v2.0

- **Sidebar panel** instead of floating window — fully integrated into the VS Code activity bar
- **Persistent memory** — chat history, model tier, and workspace context survive reloads
- **Robust streaming** — SSE parser with automatic retry (exponential backoff), abort support, and rAF-batched token rendering
- **File system integration** — insert, apply, replace, and create files directly from code blocks
- **Debounced input** — 300 ms debounce prevents accidental double-sends
- **Response cache** — identical prompts return instantly from a 5-minute in-memory cache
- **Project context injection** — reads `package.json`, `tsconfig.json`, active file, etc.
- **Keyboard shortcuts** — `Ctrl+Shift+E` to open chat, context menu on selection for Explain/Refactor

---

## Requirements

- VS Code 1.85+
- Node.js 18+
- eAI backend running at `http://localhost:8000` (or configured URL)
- `@vscode/vsce` for packaging

---

## Build & Install

```powershell
# 1. Install dependencies
npm install

# 2. Compile TypeScript
npm run compile

# 3. Package the extension
npm run package
# → produces eai-agent-chat-2.0.0.vsix

# 4. Install into VS Code
code --install-extension eai-agent-chat-2.0.0.vsix

# 5. Reload VS Code window
# Ctrl+Shift+P → "Developer: Reload Window"
```

---

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for **eAI**:

| Setting | Default | Description |
|---|---|---|
| `eai.backendUrl` | `http://localhost:8000` | eAI backend URL |
| `eai.defaultModelTier` | `14b` | Starting model: `3b`, `14b`, `32b` |
| `eai.maxContextMessages` | `10` | Sliding context window size |
| `eai.streamingEnabled` | `true` | Enable SSE streaming |
| `eai.injectProjectContext` | `true` | Auto-inject workspace files |

---

## Commands

| Command | Shortcut | Description |
|---|---|---|
| eAI: Open Chat | `Ctrl+Shift+E` | Focus the sidebar panel |
| eAI: Clear Memory & History | `Ctrl+Shift+Alt+C` | Wipe all persisted chat |
| eAI: Inject Project Context | — | Scan workspace and update context |
| eAI: Explain Selected Code | Right-click menu | Explain highlighted code |
| eAI: Refactor Selected Code | Right-click menu | Refactor highlighted code |

---

## Code Block Actions

Every agent code block shows four buttons on hover:

- **📋 Copy** — copy to clipboard
- **➕ Insert** — insert at cursor position
- **✅ Apply** — replace selection or insert; shows diff preview for existing files
- **📄 New File** — create a new workspace file with this content

---

## Architecture

```
src/
  extension.ts          # Activation, command registration
  SidebarChatProvider.ts # WebviewViewProvider (replaces ChatPanel)
  MemoryManager.ts       # Persistent state + prompt cache
  SSEParser.ts           # Streaming SSE consumer with retry
  FileSystemOps.ts       # File read/write/apply/diff
media/
  sidebar.css            # VS Code themed styles
  robot.svg              # Activity bar icon
```

---

## Verification Checklist

- [ ] Activity bar shows eAI robot icon — clicking opens sidebar
- [ ] Chat persists after `Developer: Reload Window`
- [ ] Streaming tokens appear character by character; Stop button cancels
- [ ] Right-clicking selected code shows Explain / Refactor menu items
- [ ] Code block Apply button opens diff preview before writing

---

## Known Limitations & Next Steps

- `robot.svg` must be placed manually in `media/` (32×32 px monochrome SVG)
- Cloud fallback (Groq/OpenAI/Gemini) is handled by the backend; the extension is purely a frontend
- Inline ghost-text suggestions require the `inlineCompletionItemProvider` API — planned for v2.1
- `.eaiignore` support reads the file but does not apply glob filtering yet (v2.1)
- Local usage stats dashboard planned for v2.2

// ✅ END OF README.md