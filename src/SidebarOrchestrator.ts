import * as vscode from 'vscode';
import { WorkspaceIndexer } from './WorkspaceIndexer';
import { DiffManager } from './DiffManager';
import { SSEClient } from './SSEClient';
import { AgentFeedUI } from './AgentFeedUI';

/**
 * SidebarOrchestrator: The primary IDE interface.
 * Deeply fuses Backend + Ollama + Agents + Workspace.
 */
export class SidebarOrchestrator implements vscode.WebviewViewProvider {
  public static readonly viewType = 'eaiMainView';
  private view?: vscode.WebviewView;
  private indexer: WorkspaceIndexer;
  private diffs = new DiffManager();
  private sse = new SSEClient();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.indexer = new WorkspaceIndexer(this.context.globalState);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    this.setupHandlers(webviewView.webview);
    this.startHealthPolling();
  }

  private setupHandlers(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'sendPrompt':
          await this.handleChat(msg.content, msg.tier);
          break;
        case 'applyChanges':
          const files = this.diffs.parseAgentOutput(msg.content);
          await this.diffs.applyChanges(files);
          break;
        case 'abort':
          this.sse.abort();
          break;
        case 'openDiff':
          await this.diffs.previewDiff(msg.path, msg.content);
          break;
      }
    });
  }

  private async handleChat(prompt: string, tier: string): Promise<void> {
    const backend = vscode.workspace.getConfiguration('eai').get<string>('backendUrl');
    const context = await this.indexer.getContextString();

    this.post({ type: 'addMessage', role: 'user', content: prompt });
    this.post({ type: 'startStream' });

    await this.sse.stream(`${backend}/api/chat/stream`, {
      message: prompt,
      modelTier: tier,
      systemContext: context
    }, (ev) => {
      this.post({ type: 'streamEvent', event: ev });
    });
  }

  private startHealthPolling(): void {
    setInterval(async () => {
      const backend = vscode.workspace.getConfiguration('eai').get<string>('backendUrl');
      try {
        const r = await fetch(`${backend}/health`);
        const data = await r.json();
        this.post({ type: 'health', data });
      } catch {
        this.post({ type: 'health', data: { status: 'offline' } });
      }
    }, 5000);
  }

  private post(msg: any): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'native-sidebar.css'));
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
  <div class="orchestrator-shell">
    <div class="tabs">
      <button class="tab-btn active" data-tab="chat">Chat</button>
      <button class="tab-btn" data-tab="plan">Plan</button>
      <button class="tab-btn" data-tab="agents">Agents</button>
      <button class="tab-btn" data-tab="terminal">Terminal</button>
    </div>

    <div class="tab-content active" id="tab-chat">
      <div class="messages" id="chat-messages"></div>
      <div class="input-area">
        <textarea id="chat-input" placeholder="Ask eAI to plan and build... (Ctrl+Enter to send)"></textarea>
        <div class="input-actions">
          <select id="tier-select">
            <option value="3b">3B Fast</option>
            <option value="14b" selected>14B Core</option>
            <option value="32b">32B Deep</option>
          </select>
          <button id="send-btn">Send</button>
        </div>
      </div>
    </div>

    <div class="tab-content" id="tab-plan">
      <div id="execution-plan" class="empty-state">No active plan.</div>
    </div>

    <div class="tab-content" id="tab-agents">
      <div id="agent-feed"></div>
    </div>

    <div class="tab-content" id="tab-terminal">
      <div id="terminal-stream" class="terminal-view"></div>
    </div>

    <div class="status-bar">
      <span id="health-status" class="status-offline">Offline</span>
      <span id="vram-stat">VRAM: --%</span>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const messages = document.getElementById('chat-messages');
    const agentFeed = document.getElementById('agent-feed');
    const healthStatus = document.getElementById('health-status');
    const vramStat = document.getElementById('vram-stat');

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // Chat
    sendBtn.addEventListener('click', () => {
      const content = chatInput.value.trim();
      if (!content) return;
      vscode.postMessage({ type: 'sendPrompt', content, tier: document.getElementById('tier-select').value });
      chatInput.value = '';
    });

    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        sendBtn.click();
      }
    });

    window.addEventListener('message', e => {
      const msg = e.data;
      switch (msg.type) {
        case 'addMessage':
          const div = document.createElement('div');
          div.className = 'msg ' + msg.role;
          div.innerText = msg.content;
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
          break;
        case 'streamEvent':
          handleStreamEvent(msg.event);
          break;
        case 'health':
          updateHealth(msg.data);
          break;
      }
    });

    function handleStreamEvent(ev) {
      if (ev.type === 'token') {
        const lastMsg = messages.lastElementChild;
        if (lastMsg && lastMsg.classList.contains('agent')) {
          lastMsg.innerText += ev.data;
        } else {
          const div = document.createElement('div');
          div.className = 'msg agent';
          div.innerText = ev.data;
          messages.appendChild(div);
        }
        messages.scrollTop = messages.scrollHeight;
      } else if (ev.type === 'thought') {
        const planEl = document.getElementById('execution-plan');
        if (planEl) {
          if (planEl.classList.contains('empty-state')) {
            planEl.classList.remove('empty-state');
            planEl.innerText = '';
          }
          planEl.innerText += '\n' + ev.thought;
        }
      } else if (ev.type === 'routing') {
        agentFeed.innerHTML += `<div class="event">🎯 Routed to ${ev.data.model} (${ev.data.reason})</div>`;
      }
    }

    function updateHealth(data) {
      healthStatus.className = data.status === 'ok' ? 'status-online' : 'status-offline';
      healthStatus.innerText = data.status === 'ok' ? 'Online' : 'Offline';
      if (data.vram) vramStat.innerText = `VRAM: ${data.vram}%`;
    }
  </script>
</body>
</html>`;
  }
}
// ✅ END OF SidebarOrchestrator.ts
