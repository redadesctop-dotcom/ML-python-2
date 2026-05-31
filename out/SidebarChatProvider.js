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
exports.SidebarChatProvider = void 0;
const vscode = __importStar(require("vscode"));
const WorkspaceIndexer_1 = require("./WorkspaceIndexer");
const DiffManager_1 = require("./DiffManager");
const SSEClient_1 = require("./SSEClient");
/**
 * SidebarChatProvider: The central orchestrator for the Pro Sidebar.
 * Manages Chat, Plan, Files, Terminal, and Agent Activity.
 */
class SidebarChatProvider {
    constructor(context) {
        this.context = context;
        this.indexer = new WorkspaceIndexer_1.WorkspaceIndexer();
        this.diffs = new DiffManager_1.DiffManager();
        this.sse = new SSEClient_1.SSEClient();
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        this.setupMessageHandlers(webviewView.webview);
    }
    setupMessageHandlers(webview) {
        webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'sendPrompt':
                    await this.handleChat(msg.content);
                    break;
                case 'applyChanges':
                    await this.diffs.applyAll();
                    webview.postMessage({ type: 'changesApplied' });
                    break;
                case 'undoChange':
                    await this.diffs.undoLast();
                    break;
                case 'abort':
                    this.sse.abort();
                    break;
            }
        });
    }
    async handleChat(prompt) {
        const config = vscode.workspace.getConfiguration('eai');
        const backend = config.get('backendUrl') || 'http://localhost:8000';
        // 1. Get Context
        const context = await this.indexer.getFullContext();
        this.post({ type: 'contextUsed', path: context.activeFile?.path });
        // 2. Start Streaming
        await this.sse.stream(`${backend}/api/chat/stream`, {
            message: prompt,
            context: context
        }, (ev) => {
            this.post({ type: 'streamEvent', data: ev });
            // If event contains file changes, notify DiffManager
            if (ev.type === 'token' && ev.data.includes('--- FILE:')) {
                // Logic to extract and propose changes would go here
            }
        });
    }
    post(msg) {
        this.view?.webview.postMessage(msg);
    }
    getHtml(webview) {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'pro-sidebar.css'));
        const nonce = Math.random().toString(36).slice(2);
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>eAI Orchestrator</title>
</head>
<body>
  <div class="sidebar-container">
    <div class="tabs-header">
      <button class="tab-btn active" data-tab="chat">Chat</button>
      <button class="tab-btn" data-tab="plan">Plan</button>
      <button class="tab-btn" data-tab="files">Files</button>
      <button class="tab-btn" data-tab="agents">Agents</button>
    </div>

    <div class="tab-content active" id="tab-chat">
      <div class="chat-messages" id="chat-messages"></div>
      <div class="input-container">
        <textarea id="chat-input" placeholder="Ask eAI... (Ctrl+Enter)"></textarea>
      </div>
    </div>

    <div class="tab-content" id="tab-plan">
      <div id="plan-view"></div>
    </div>

    <div class="tab-content" id="tab-files">
      <div id="files-view"></div>
      <button id="apply-btn" style="display:none">Apply Changes (Ctrl+Shift+A)</button>
    </div>

    <div class="tab-content" id="tab-agents">
      <div id="agent-activity"></div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');

    // Tab Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      };
    });

    // Input Handling
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const content = input.value.trim();
        if (content) {
          vscode.postMessage({ type: 'sendPrompt', content });
          appendMessage('user', content);
          input.value = '';
        }
      }
    };

    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerText = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'streamEvent') {
        const ev = msg.data;
        if (ev.type === 'token') {
          let last = messages.lastElementChild;
          if (!last || !last.classList.contains('agent')) {
            last = appendMessage('agent', '');
          }
          last.innerText += (ev.token || ev.data || ev);
        } else if (ev.type === 'thought') {
          document.getElementById('plan-view').innerText += '\\n' + ev.data;
        }
      }
    });
  </script>
</body>
</html>`;
    }
}
exports.SidebarChatProvider = SidebarChatProvider;
SidebarChatProvider.viewType = 'eaiMainView';
// ✅ END OF SidebarChatProvider.ts
//# sourceMappingURL=SidebarChatProvider.js.map