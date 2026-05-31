# eAI VS Code Extension

## Installation

1. Open the `vscode-extension` folder in VS Code.
2. Run `npm install`.
3. Run `npm run compile`.
4. Run `npm run package` or use `build-extension.ps1`.
5. Install `eAI.vsix` from the command palette using `Extensions: Install from VSIX...`.

## Configuration

- The extension communicates with the backend at `http://localhost:8000`.
- Use `.eaiignore` or `.rooignore` in your workspace root to protect file access.
- The extension uses `.venv_new` automatically when launching terminal commands.

## Commands

- `eAI: Build Project`
- `eAI: Generate Code`
- `eAI: Run Agent Task`
- `eAI: View Audit Log`
- `eAI: Switch Model Tier`
- `eAI: Refactor Selection`
- `eAI: Explain Code`
- `eAI: Open Chat` (NEW - Conversational Chat Interface)

## 🚀 Using the eAI Chat Interface

The new **eAI Chat** provides a Claude Desktop-like conversational interface for seamless interaction with eAI agents.

### Opening the Chat Panel

**Option 1: Command Palette**
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type `eAI: Open Chat`
3. Press Enter

**Option 2: Keyboard Shortcut**
- Once installed, you can bind the `eai.openChat` command to a custom key binding in VS Code settings.

### Chat Interface Overview

```
┌─────────────────────────────────────────────────────────┐
│ 🟢 eAI Agent Chat          Model: 14b                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Agent: Welcome to eAI! What would you like to build?  │
│                                                          │
│  You: Generate a React login component                  │
│                                                          │
│  Agent: I'll help you create a React login component... │
│         [streaming response]                            │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ 🏗️ Build  ✨ Code  📖 Explain  🔧 Refactor  ✅ Tests   │
├─────────────────────────────────────────────────────────┤
│ [Type your request here...]                      [Send] │
├─────────────────────────────────────────────────────────┤
│ Tokens: 1,247     |     Clear Chat     ⚙️ Settings     │
└─────────────────────────────────────────────────────────┘
```

### Features

#### Message Types
- **User Messages**: Right-aligned, blue background
- **Agent Responses**: Left-aligned, dark background with markdown rendering
- **Timestamps**: Each message shows when it was sent

#### Streaming Responses
- Responses stream in real-time, token by token
- Progress indicators show what the agent is doing ("Analyzing...", "Generating...", etc.)
- Stop button (when streaming) to cancel long-running responses

#### Code Block Features
- **Syntax Highlighting**: Code blocks are automatically highlighted
- **Copy Button**: Quick copy code to clipboard (📋 Copy)
- **Insert Button**: Directly insert code into the active editor (➕ Insert)

#### Quick Action Buttons
Click to populate the input with suggested prompts:

| Button | Purpose | Example |
|--------|---------|---------|
| 🏗️ Build | Generate entire projects | "Build a [DESCRIBE] application" |
| ✨ Code | Generate specific functions | "Generate code for [DESCRIBE]" |
| 📖 Explain | Understand code | "Explain this code: [PASTE CODE]" |
| 🔧 Refactor | Improve code quality | "Refactor for performance: [PASTE]" |
| ✅ Tests | Generate test cases | "Generate tests for: [PASTE]" |

#### Model Tier Selector
Switch between available models in the status area:
- `3b` - Fast, lightweight responses
- `14b` - Balanced performance and quality (default)
- `32b` - High-quality, detailed responses
- `cloud` - Premium cloud-based model (if available)

#### Health Status
The header shows real-time backend status:
- 🟢 **Online**: Backend is running and responsive
- 🟡 **Degraded**: Backend running but with issues
- 🔴 **Offline**: Backend unreachable

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Ctrl+K` (Windows/Linux) | Clear chat |
| `Cmd+K` (Mac) | Clear chat |

### Usage Examples

#### Example 1: Build a Project
```
User: Build a complete React e-commerce product page with filtering, 
      sorting, and add-to-cart functionality

Agent: I'll create a full-featured e-commerce product page...
[Shows:
 - Project structure
 - React components
 - Hooks for state management
 - Styling
 - Instructions]
```

#### Example 2: Explain Code
```
User: Explain this code:
```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

Agent: This function calculates Fibonacci numbers using recursion...
[Shows detailed explanation with complexity analysis]
```

#### Example 3: Refactor for Performance
```
User: Refactor this for better performance:
[Paste inefficient code]

Agent: Here's an optimized version...
[Shows refactored code with explanation of improvements]
```

#### Example 4: Generate Tests
```
User: Generate unit tests for this React component:
[Paste component code]

Agent: Here are comprehensive tests using Jest and React Testing Library...
[Shows complete test suite]
```

### Agent Routing

The chat automatically routes your request to the best agent:

- **ARCHITECT**: Project generation and system design
- **FORGE**: Code generation and implementation
- **SCHOLAR**: Code explanation and analysis
- **REFACTOR**: Code optimization and improvement
- **VALIDATOR**: Test generation and validation
- **COORDINATOR**: General assistance and orchestration

### Conversation Context

The chat maintains conversation context:
- Remembers the last 3 exchanges
- Uses context to provide relevant responses
- Displays token count for each response
- Shows cumulative token usage

### Settings & Customization

Click the **⚙️ Settings** button to:
- Change model tier preferences
- Toggle streaming on/off
- Adjust response verbosity
- Clear chat history

### Tips & Best Practices

1. **Be Specific**: Detailed requests get better responses
2. **Provide Context**: Paste relevant code for analysis
3. **Use Quick Actions**: Start with a template, then customize
4. **Monitor Tokens**: Keep an eye on token usage for long sessions
5. **Copy & Insert**: Use the code insertion feature to save time
6. **Clear Regularly**: Start fresh conversations for better focus

### Troubleshooting

**Chat Panel Won't Open**
- Ensure backend is running: `cd backend && python main.py`
- Check that `http://localhost:8000` is accessible
- Verify VS Code version is 1.80.0 or higher

**No Response from Agent**
- Check backend health status indicator
- Ensure Ollama is running if using local models
- Try switching model tier
- Check browser console for errors (F12)

**Code Insertion Not Working**
- Verify you have an active editor window
- Check that you're not in a read-only file
- Try copying code manually instead

**Streaming Too Slow**
- Check network latency
- Try a smaller model tier (3b)
- Reduce conversation history
- Restart the backend if it's unresponsive

## Verification

- Extension loads without errors
- All commands execute and stream output
- Chat panel opens with modern UI
- Streaming responses work in real-time
- Sidebar shows live agent data when backend is running
- Inline actions trigger the correct backend endpoints
- Status bar updates in real time
- `.vsix` installs cleanly

## Development

### Building the Extension
```bash
cd vscode-extension
npm install
npm run compile
npm run package
```

### Local Testing
1. Open the extension folder in VS Code
2. Press `F5` to launch the debug window
3. Test commands in the debug window

### Backend Integration
The extension expects the backend to provide:
- `/health` - Backend health status
- `/api/chat/stream` - Streaming chat endpoint
- `/api/llm/generate` - Code generation endpoint
- `/build` - Project building endpoint

## Architecture

```
vscode-extension/
├── src/
│   ├── extension.ts        # Main extension entry
│   └── ChatPanel.ts        # Chat interface (NEW)
├── package.json
└── tsconfig.json

backend/
├── routers/
│   ├── mesh_api.py         # 3D mesh endpoints
│   └── chat_api.py         # Chat streaming (NEW)
├── main.py                 # FastAPI app
└── core/
    └── eai/                # eAI agent system
```
