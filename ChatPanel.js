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
const utils_1 = require("./utils");
class ChatPanel {
    static currentPanel;
    _panel;
    _disposables = [];
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('eaiChat', 'eAI Assistant Chat', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri]
        });
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
    }
    constructor(panel, _extensionUri) {
        this._panel = panel;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this._handleChat(message.text, message.modelTier);
                    return;
                case 'runTask':
                    await this._handleTask(message.task, message.context);
                    return;
            }
        }, null, this._disposables);
    }
    sendTask(task, context) {
        this._panel.webview.postMessage({ command: 'triggerTask', task, context });
    }
    async _handleChat(text, modelTier) {
        const backendUrl = vscode.workspace.getConfiguration('eai').get('backendUrl', 'http://localhost:8000');
        try {
            const response = await fetch(`${backendUrl}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, modelTier, conversationHistory: [] })
            });
            if (!response.body)
                throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            this._panel.webview.postMessage({ command: 'receiveChunk', data });
                        }
                        catch (e) { }
                    }
                }
            }
        }
        catch (error) {
            this._panel.webview.postMessage({ command: 'error', message: error.message });
        }
    }
    async _handleTask(task, context) {
        // Implementation for build, refactor, etc.
        const backendUrl = vscode.workspace.getConfiguration('eai').get('backendUrl', 'http://localhost:8000');
        const modelTier = vscode.workspace.getConfiguration('eai').get('defaultModelTier', '14b');
        let endpoint = '/api/llm/generate';
        let body = { prompt: context, modelTier, purpose: task };
        if (task === 'build') {
            endpoint = '/build';
            body = { spec: context };
        }
        try {
            const res = await fetch(`${backendUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            this._panel.webview.postMessage({ command: 'receiveResponse', response: data.response || JSON.stringify(data, null, 2) });
        }
        catch (error) {
            this._panel.webview.postMessage({ command: 'error', message: error.message });
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }
    _getHtmlForWebview() {
        const nonce = (0, utils_1.getNonce)();
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>eAI Chat</title>
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 10px; }
                    #chat-container { display: flex; flex-direction: column; height: 90vh; }
                    #messages { flex: 1; overflow-y: auto; margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); }
                    .message { margin: 10px 0; padding: 10px; border-radius: 8px; max-width: 80%; }
                    .user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
                    .agent { align-self: flex-start; background: var(--vscode-editor-inactiveSelectionBackground); }
                    .code-block { background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 4px; position: relative; font-family: monospace; white-space: pre-wrap; }
                    .copy-btn { position: absolute; top: 5px; right: 5px; background: #333; color: white; border: none; padding: 2px 5px; cursor: pointer; font-size: 10px; }
                    #input-area { display: flex; flex-direction: column; gap: 5px; }
                    textarea { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 5px; resize: none; min-height: 50px; }
                    .actions { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 5px; }
                    button.quick-action { font-size: 11px; padding: 2px 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border: none; cursor: pointer; border-radius: 2px; }
                    .status { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 5px; }
                </style>
            </head>
            <body>
                <div id="chat-container">
                    <div id="messages"></div>
                    <div class="actions">
                        <button class="quick-action" onclick="runTask('build')">🏗️ Build</button>
                        <button class="quick-action" onclick="runTask('refactor')">🔧 Refactor</button>
                        <button class="quick-action" onclick="runTask('explain')">📖 Explain</button>
                        <button class="quick-action" onclick="runTask('test')">✅ Test</button>
                    </div>
                    <div id="input-area">
                        <textarea id="chat-input" placeholder="Ask eAI anything... (Enter to send, Shift+Enter for new line)"></textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <select id="model-tier">
                                <option value="3b">3b</option>
                                <option value="14b" selected>14b</option>
                                <option value="32b">32b</option>
                                <option value="cloud">cloud</option>
                            </select>
                            <span id="token-counter" class="status">Tokens: 0</span>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const messagesDiv = document.getElementById('messages');
                    const input = document.getElementById('chat-input');
                    const modelTier = document.getElementById('model-tier');
                    let currentAgentMessage = null;

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                        if (e.ctrlKey && e.key === 'k') {
                            messagesDiv.innerHTML = '';
                        }
                    });

                    function sendMessage() {
                        const text = input.value.trim();
                        if (!text) return;
                        
                        appendMessage('user', text);
                        input.value = '';
                        currentAgentMessage = appendMessage('agent', '');
                        
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: text,
                            modelTier: modelTier.value
                        });
                    }

                    function runTask(task) {
                        const text = input.value.trim();
                        if (task === 'build' && !text) {
                            appendMessage('agent', 'Please provide a project specification in the input box.');
                            return;
                        }
                        appendMessage('user', 'Run task: ' + task);
                        currentAgentMessage = appendMessage('agent', 'Processing task...');
                        vscode.postMessage({ command: 'runTask', task, context: text });
                    }

                    function appendMessage(role, text) {
                        const div = document.createElement('div');
                        div.className = 'message ' + role;
                        div.innerText = text;
                        messagesDiv.appendChild(div);
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        return div;
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'receiveChunk':
                                if (message.data.type === 'token') {
                                    currentAgentMessage.innerText += message.data.token;
                                } else if (message.data.type === 'progress') {
                                    currentAgentMessage.innerText = '[' + message.data.step + ']...';
                                }
                                break;
                            case 'receiveResponse':
                                currentAgentMessage.innerText = message.response;
                                break;
                            case 'triggerTask':
                                input.value = message.context;
                                runTask(message.task);
                                break;
                            case 'error':
                                appendMessage('agent', 'Error: ' + message.message);
                                break;
                        }
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    });
                </script>
            </body>
            </html>`;
    }
    dispose() {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x)
                x.dispose();
        }
    }
}
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=ChatPanel.js.map