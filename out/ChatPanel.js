"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
class ChatPanel {
    constructor(context, backendUrl = 'http://localhost:8000') {
        this.messageHistory = [];
        this.currentModelTier = '14b';
        this.isStreaming = false;
        this.abortController = null;
        this.context = context;
        this.backendUrl = backendUrl;
        this.panel = vscode.window.createWebviewPanel('eaiChat', 'eAI Agent Chat', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        });
        this.panel.webview.html = this.getHtmlContent();
        this.setupMessageHandlers();
        this.updateHealthStatus();
        this.loadInitialGreeting();
    }
    setupMessageHandlers() {
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    await this.handleUserMessage(message.content);
                    break;
                case 'stopStreaming':
                    this.stopStreaming();
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'switchModel':
                    this.currentModelTier = message.tier;
                    this.panel.webview.postMessage({
                        type: 'modelSwitched',
                        tier: message.tier
                    });
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(message.code);
                    vscode.window.showInformationMessage('Code copied to clipboard!');
                    break;
                case 'insertCode':
                    await this.insertCodeToEditor(message.code, message.language);
                    break;
            }
        });
    }
    async handleUserMessage(content) {
        if (this.isStreaming) {
            return;
        }
        const userMessage = {
            id: this.generateMessageId(),
            role: 'user',
            content,
            timestamp: new Date()
        };
        this.messageHistory.push(userMessage);
        this.addMessageToUI(userMessage);
        const agentMessage = {
            id: this.generateMessageId(),
            role: 'agent',
            content: '',
            timestamp: new Date(),
            streaming: true,
            progress: []
        };
        this.messageHistory.push(agentMessage);
        this.addMessageToUI(agentMessage);
        this.showTypingIndicator(agentMessage.id);
        await this.streamResponseFromBackend(content, agentMessage);
    }
    async streamResponseFromBackend(userMessage, agentMessage) {
        this.isStreaming = true;
        this.abortController = new AbortController();
        try {
            this.showProgress(agentMessage.id, 'Connecting to backend...');
            // ✅ FIX 1: Added backticks for template literal
            const response = await fetch(`${this.backendUrl}/api/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    modelTier: this.currentModelTier,
                    conversationHistory: this.getConversationContext()
                }),
                signal: this.abortController.signal
            });
            if (!response.ok) {
                // ✅ FIX 2: Added backticks for template literal
                throw new Error(`Backend error: ${response.statusText}`);
            }
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body from backend');
            }
            this.showProgress(agentMessage.id, 'Receiving response...');
            const decoder = new TextDecoder();
            let tokenCount = 0;
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer) {
                        agentMessage.content += buffer;
                    }
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                // Process complete lines
                const lines = buffer.split('\n');
                // ✅ FIX 3: Added nullish coalescing operator
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'progress') {
                                this.showProgress(agentMessage.id, data.step);
                            }
                            else if (data.type === 'token') {
                                agentMessage.content += data.token;
                                tokenCount++;
                                this.updateMessageInUI(agentMessage);
                                this.panel.webview.postMessage({
                                    type: 'tokenCount',
                                    id: agentMessage.id,
                                    count: tokenCount
                                });
                            }
                            else if (data.type === 'error') {
                                throw new Error(data.message);
                            }
                        }
                        catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
            agentMessage.streaming = false;
            agentMessage.tokens = tokenCount;
            this.updateMessageInUI(agentMessage);
            this.panel.webview.postMessage({
                type: 'streamComplete',
                id: agentMessage.id,
                tokens: tokenCount
            });
        }
        catch (error) {
            if (error.name !== 'AbortError') {
                agentMessage.content = `❌ Error: ${error.message}`;
                agentMessage.streaming = false;
                this.updateMessageInUI(agentMessage);
                this.panel.webview.postMessage({
                    type: 'error',
                    id: agentMessage.id,
                    message: error.message
                });
            }
        }
        finally {
            this.isStreaming = false;
            this.abortController = null;
            this.hideProgress(agentMessage.id);
        }
    }
    showProgress(messageId, step) {
        this.panel.webview.postMessage({
            type: 'showProgress',
            id: messageId,
            step
        });
    }
    hideProgress(messageId) {
        this.panel.webview.postMessage({
            type: 'hideProgress',
            id: messageId
        });
    }
    showTypingIndicator(messageId) {
        this.panel.webview.postMessage({
            type: 'showTyping',
            id: messageId
        });
    }
    addMessageToUI(message) {
        this.panel.webview.postMessage({
            type: 'addMessage',
            message: {
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp.toISOString(),
                streaming: message.streaming
            }
        });
    }
    updateMessageInUI(message) {
        this.panel.webview.postMessage({
            type: 'updateMessage',
            message: {
                id: message.id,
                content: message.content
            }
        });
    }
    getConversationContext() {
        return this.messageHistory
            .filter(m => !m.streaming)
            .map(m => ({
            role: m.role,
            content: m.content
        }))
            .slice(-6); // Last 3 exchanges
    }
    stopStreaming() {
        if (this.abortController) {
            this.abortController.abort();
            this.isStreaming = false;
        }
    }
    clearChat() {
        this.messageHistory = [];
        this.panel.webview.postMessage({
            type: 'clearAll'
        });
        this.loadInitialGreeting();
    }
    async insertCodeToEditor(code, language) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, code);
        });
        vscode.window.showInformationMessage('Code inserted into editor');
    }
    async updateHealthStatus() {
        try {
            const response = await fetch(`${this.backendUrl}/health`);
            const health = await response.json();
            this.panel.webview.postMessage({
                type: 'healthUpdate',
                health: {
                    // ✅ FIX 4: Added nullish coalescing operators
                    status: health.status ?? 'offline',
                    ollama: health.ollama === true,
                    vram: health.vram ?? 0,
                    ram: health.ram ?? 0
                }
            });
        }
        catch {
            this.panel.webview.postMessage({
                type: 'healthUpdate',
                health: {
                    status: 'offline',
                    ollama: false,
                    vram: 0,
                    ram: 0
                }
            });
        }
        // Update health status every 5 seconds
        setTimeout(() => this.updateHealthStatus(), 5000);
    }
    loadInitialGreeting() {
        const greeting = {
            id: this.generateMessageId(),
            role: 'agent',
            content: `👋 Welcome to eAI Agent Chat!

I'm ready to help you with:
- Build projects - Generate complete applications
- Write code - Generate functions, components, or entire modules
- Explain code - Understand complex code segments
- Refactor code - Improve code quality and performance
- Run tasks - Execute agent-based tasks

Quick tips:
- Use \/build\ for project generation
- Use \/code\ for code generation
- Type naturally or use commands
- Shift+Enter for new lines
- Ctrl+K to clear chat

Model: ${this.currentModelTier} | Status: Check the status indicator above`,
            timestamp: new Date()
        };
        this.messageHistory.push(greeting);
        this.addMessageToUI(greeting);
    }
    generateMessageId() {
        // ✅ FIX 5: Added backticks for template literal
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    show() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }
    getHtmlContent() {
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; connect-src http://localhost:8000 http://127.0.0.1:8000;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js" nonce="${nonce}"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" nonce="${nonce}"></script>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      color-scheme: dark;
      --bg-primary: #1e1e1e; --bg-secondary: #252526; --bg-tertiary: #2d2d30;
      --text-primary: #e0e0e0; --text-secondary: #888888;
      --accent: #0e639c; --accent-hover: #1177bb;
      --user-bg: #0e639c; --agent-bg: #2d2d30; --border: #3e3e42;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary); color: var(--text-primary);
      height: 100vh; display: flex; flex-direction: column; overflow: hidden;
    }
    .container { display: flex; flex-direction: column; height: 100%; }
    .header {
      padding: 16px; background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
    }
    .header-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
    .status-indicator {
      width: 8px; height: 8px; border-radius: 50%;
      background: #d97706; animation: pulse 2s infinite;    }
[5/29/2026 9:07 AM] 𝑟𝑒𝑑𝑎 𝑗𝑎𝑠𝑖𝑚 𖠷: .status-indicator.online { background: #10b981; animation: none; }
    .status-indicator.offline { background: #ef4444; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .header-stats { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); }
    .stat { display: flex; align-items: center; gap: 4px; }
    .messages-container {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .messages-container::-webkit-scrollbar { width: 8px; }
    .messages-container::-webkit-scrollbar-track { background: var(--bg-secondary); }
    .messages-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .messages-container::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }
    .message { display: flex; gap: 8px; animation: slideIn 0.3s ease-out; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .message.user { justify-content: flex-end; }
    .message-avatar {
      width: 24px; height: 24px; border-radius: 4px;
      background: var(--accent); display: flex; align-items: center;
      justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;
    }
    .message.user .message-avatar { background: var(--accent); }
    .message.agent .message-avatar { background: var(--bg-tertiary); }
    .message-content-wrapper { display: flex; flex-direction: column; gap: 4px; max-width: 70%; }
    .message.user .message-content-wrapper { align-items: flex-end; }
    .message-bubble {
      padding: 12px 14px; border-radius: 8px;
      word-wrap: break-word; line-height: 1.4; font-size: 13px;
    }
    .message.user .message-bubble { background: var(--user-bg); color: white; }
    .message.agent .message-bubble { background: var(--agent-bg); color: var(--text-primary); }
    .message-time { font-size: 11px; color: var(--text-secondary); padding: 0 4px; }
    .message-bubble h1, .message-bubble h2, .message-bubble h3 { margin-top: 10px; margin-bottom: 6px; font-weight: 600; }
    .message-bubble h1 { font-size: 16px; }
    .message-bubble h2 { font-size: 15px; }
    .message-bubble h3 { font-size: 14px; }
    .message-bubble p { margin: 6px 0; }
    .message-bubble ul, .message-bubble ol { margin: 6px 0 6px 20px; }
    .message-bubble li { margin: 4px 0; }
    .message-bubble code:not(pre code) {
      background: rgba(0, 0, 0, 0.3); padding: 2px 6px;
      border-radius: 3px; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px;
    }
    .message-bubble pre {
      background: rgba(0, 0, 0, 0.4); padding: 12px;
      border-radius: 6px; overflow-x: auto; margin: 8px 0; position: relative;
    }
    .message-bubble pre code {
      font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; line-height: 1.4;    }
    .code-block-actions { display: flex; gap: 6px; margin-top: 8px; opacity: 0; transition: opacity 0.2s; }
    .message.agent .message-bubble:hover .code-block-actions { opacity: 1; }
    .code-btn {
      padding: 4px 8px; background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2); color: var(--text-primary);
      border-radius: 4px; cursor: pointer; font-size: 11px; transition: background 0.2s;
    }
    .code-btn:hover { background: rgba(255, 255, 255, 0.2); }
    .typing-indicator { display: flex; gap: 4px; padding: 8px 12px; }
    .typing-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-secondary); animation: typing 1.4s infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing {
      0%, 60%, 100% { opacity: 0.5; transform: translateY(0); }
[5/29/2026 9:07 AM] 𝑟𝑒𝑑𝑎 𝑗𝑎𝑠𝑖𝑚 𖠷: 30% { opacity: 1; transform: translateY(-6px); }
    }
    .progress-bar { background: rgba(255, 255, 255, 0.1); height: 2px; border-radius: 1px; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; background: var(--accent); animation: progress 2s ease-in-out infinite; }
    @keyframes progress { 0% { width: 10%; } 50% { width: 70%; } 100% { width: 90%; } }
    .progress-text { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
    .input-area {
      padding: 12px 16px; background: var(--bg-secondary);
      border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px;
    }
    .quick-actions { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; }
    .quick-actions::-webkit-scrollbar { height: 4px; }
    .quick-actions::-webkit-scrollbar-thumb { background: var(--border); }
    .action-btn {
      padding: 6px 12px; background: var(--bg-tertiary);
      border: 1px solid var(--border); color: var(--text-primary);
      border-radius: 6px; cursor: pointer; font-size: 12px;
      white-space: nowrap; transition: all 0.2s; flex-shrink: 0;
    }
    .action-btn:hover { background: var(--accent); border-color: var(--accent); }
    .input-row { display: flex; gap: 8px; }
    .input-box {
      flex: 1; background: var(--bg-tertiary); border: 1px solid var(--border);
      color: var(--text-primary); border-radius: 6px; padding: 10px 12px;
      font-family: inherit; font-size: 13px; resize: vertical;
      min-height: 36px; max-height: 120px; transition: border-color 0.2s;
    }
    .input-box:focus {
      outline: none; border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(14, 99, 156, 0.1);
    }
    .input-box::placeholder { color: var(--text-secondary); }    .send-btn {
      padding: 10px 16px; background: var(--accent); border: none;
      color: white; border-radius: 6px; cursor: pointer;
      font-weight: 500; font-size: 13px; transition: background 0.2s;
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .send-btn:hover:not(:disabled) { background: var(--accent-hover); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; background: var(--bg-secondary);
      border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary);
    }
    .token-count { display: flex; gap: 12px; }
    .footer-btn {
      background: none; border: none; color: var(--text-secondary);
      cursor: pointer; font-size: 11px; padding: 4px 8px;
      border-radius: 4px; transition: color 0.2s, background 0.2s;
    }
    .footer-btn:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.1); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">
        <span class="status-indicator online" id="statusIndicator"></span>
        <span>eAI Agent Chat</span>
      </div>
      <div class="header-stats">
        <div class="stat"><span>Model:</span><span id="modelDisplay">14b</span></div>
      </div>
    </div>
    <div class="messages-container" id="messagesContainer"></div>
    <div class="input-area">
      <div class="quick-actions">
        <button class="action-btn" data-action="build">🏗 Build Project</button>
        <button class="action-btn" data-action="code">✨ Generate Code</button>
        <button class="action-btn" data-action="explain">📖 Explain Code</button>
        <button class="action-btn" data-action="refactor">🔧 Refactor</button>
        <button class="action-btn" data-action="test">✅ Run Tests</button>
      </div>
      <div class="input-row">
        <textarea class="input-box" id="chatInput" placeholder="Describe what you want to build..." rows="1"></textarea>
[5/29/2026 9:07 AM] 𝑟𝑒𝑑𝑎 𝑗𝑎𝑠𝑖𝑚 𖠷: <button class="send-btn" id="sendBtn"><span>Send</span></button>
      </div>
    </div>
    <div class="footer">
      <div class="token-count"><span id="tokenDisplay">Tokens: 0</span></div>
      <div class="token-count">        <button class="footer-btn" id="clearBtn">Clear Chat</button>
        <button class="footer-btn" id="settingsBtn">⚙️ Settings</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const messagesContainer = document.getElementById('messagesContainer');
    const clearBtn = document.getElementById('clearBtn');
    const modelDisplay = document.getElementById('modelDisplay');
    const statusIndicator = document.getElementById('statusIndicator');
    const tokenDisplay = document.getElementById('tokenDisplay');

    let currentModel = '14b';
    let totalTokens = 0;
    let isStreaming = false;

    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.addEventListener('keydown', (e) => {
      // ✅ FIX 6: Added logical OR operator
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        clearChat();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearChat);

    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.getAttribute('data-action');
        const prompts = {
          build: 'Build a complete [DESCRIBE YOUR PROJECT] application with full functionality',
          code: 'Generate code for [DESCRIBE THE FUNCTIONALITY]',
          explain: 'Paste your code here and I will explain it in detail',
          refactor: 'Refactor this code for better performance and readability: [PASTE CODE]',          test: 'Generate unit tests for this function: [PASTE CODE]'
        };
        // ✅ FIX 7: Added nullish coalescing operator
        chatInput.value = prompts[action] ?? '';
        chatInput.focus();
      });
    });

    function sendMessage() {
      const message = chatInput.value.trim();
      // ✅ FIX 8: Added logical OR operator
      if (!message || isStreaming) return;

      chatInput.value = '';
      chatInput.style.height = 'auto';
      sendBtn.disabled = true;
      isStreaming = true;

      vscode.postMessage({ type: 'sendMessage', content: message });
    }

    function clearChat() {
      const confirmed = confirm('Clear all messages?');
      if (confirmed) { vscode.postMessage({ type: 'clearChat' }); }
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'addMessage': addMessageToUI(message.message); break;
        case 'updateMessage': updateMessageInUI(message.message); break;
        case 'showProgress': showProgress(message.id, message.step); break;
        case 'hideProgress': hideProgress(message.id); break;
        case 'showTyping': showTypingIndicator(message.id); break;
        case 'streamComplete': completeStream(message.id, message.tokens); break;
        case 'error': handleError(message.message); break;
        case 'tokenCount': updateTokenCount(message.count); break;
        case 'clearAll': messagesContainer.innerHTML = ''; totalTokens = 0; updateTokenDisplay(); break;
        case 'modelSwitched': currentModel = message.tier; modelDisplay.textContent = message.tier; break;
        case 'healthUpdate': updateHealthStatus(message.health); break;
      }
    });
[5/29/2026 9:07 AM] 𝑟𝑒𝑑𝑎 𝑗𝑎𝑠𝑖𝑚 𖠷: function addMessageToUI(msg) {
      const messageEl = document.createElement('div');
      messageEl.className = 'message ' + msg.role;
      messageEl.id = 'message-' + msg.id;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';      avatar.textContent = msg.role === 'user' ? '👤' : '🤖';

      const wrapper = document.createElement('div');
      wrapper.className = 'message-content-wrapper';

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.innerHTML = msg.role === 'user' ? escapeHtml(msg.content) : marked.parse(msg.content);

      const time = document.createElement('div');
      time.className = 'message-time';
      time.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      wrapper.appendChild(bubble);
      wrapper.appendChild(time);

      if (msg.role === 'user') {
        messageEl.appendChild(wrapper);
        messageEl.appendChild(avatar);
      } else {
        messageEl.appendChild(avatar);
        messageEl.appendChild(wrapper);
      }

      messagesContainer.appendChild(messageEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      document.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
        const pre = block.parentElement;
        // ✅ FIX 9: Fixed regex escaping and added nullish coalescing
        const lang = block.className.match(/language-(\\w+)/)?.[1] ?? 'text';
        
        if (!pre.querySelector('.code-block-actions')) {
          const actions = document.createElement('div');
          actions.className = 'code-block-actions';
          
          const copyBtn = document.createElement('button');
          copyBtn.className = 'code-btn';
          copyBtn.textContent = '📋 Copy';
          copyBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'copyCode', code: block.textContent });
          });

          const insertBtn = document.createElement('button');
          insertBtn.className = 'code-btn';
          insertBtn.textContent = '➕ Insert';
          insertBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'insertCode', code: block.textContent, language: lang });
          });
          actions.appendChild(copyBtn);
          actions.appendChild(insertBtn);
          pre.appendChild(actions);
        }
      });
    }

    function updateMessageInUI(msg) {
      const el = document.getElementById('message-' + msg.id);
      if (el) {
        const bubble = el.querySelector('.message-bubble');
        if (bubble) {
          bubble.innerHTML = marked.parse(msg.content);
          document.querySelectorAll('pre code').forEach(block => {
            if (!block.classList.contains('hljs')) { hljs.highlightElement(block); }
          });
        }
      }
    }

    function showTypingIndicator(msgId) {
      const el = document.getElementById('message-' + msgId);
      if (el) {
        const bubble = el.querySelector('.message-bubble');
        if (bubble) {
          bubble.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        }
      }
    }

    function showProgress(msgId, step) {
      const el = document.getElementById('message-' + msgId);
      if (el) {
        let progress = el.querySelector('.progress-text');
        if (!progress) {
          progress = document.createElement('div');
          progress.className = 'progress-text';
          el.querySelector('.message-bubble').appendChild(progress);
        }
        progress.textContent = '⏳ ' + step;
      }
    }

    function hideProgress(msgId) {
      const el = document.getElementById('message-' + msgId);
      if (el) {
        const progress = el.querySelector('.progress-text');
        if (progress) { progress.remove(); }
      }    }
[5/29/2026 9:07 AM] 𝑟𝑒𝑑𝑎 𝑗𝑎𝑠𝑖𝑚 𖠷: function completeStream(msgId, tokens) {
      isStreaming = false;
      sendBtn.disabled = false;
      if (tokens) { totalTokens += tokens; updateTokenDisplay(); }
    }

    function updateTokenCount(count) { tokenDisplay.textContent = 'Tokens: ' + count; }
    function updateTokenDisplay() { tokenDisplay.textContent = 'Tokens: ' + totalTokens; }
    function handleError(message) { isStreaming = false; sendBtn.disabled = false; }

    function updateHealthStatus(health) {
      const indicator = document.getElementById('statusIndicator');
      if (health.status === 'ok' && health.ollama) {
        indicator.className = 'status-indicator online';
      } else if (health.status === 'degraded') {
        indicator.className = 'status-indicator';
      } else {
        indicator.className = 'status-indicator offline';
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=ChatPanel.js.map