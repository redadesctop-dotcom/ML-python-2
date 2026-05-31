import * as vscode from 'vscode';
import { MemoryManager, SessionState, ChatMessage } from './MemoryManager';
import { FileSystemOps } from './FileSystemOps';
import { SSEParser } from './SSEParser';

/**
 * SidebarChatProvider implements WebviewViewProvider.
 * Registered as the view for eaiChatView in package.json.
 */
export class SidebarChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'eaiChatView';

  private view?: vscode.WebviewView;
  private memory: MemoryManager;
  private fs: FileSystemOps;
  private sse: SSEParser;
  private session: SessionState;
  private debounceTimer?: NodeJS.Timeout;
  private lastAppliedCode?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly backendUrl: string
  ) {
    this.memory = new MemoryManager(context);
    this.fs = new FileSystemOps();
    this.sse = new SSEParser();
    this.session = this.memory.loadSession();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _wvContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.joinPath(this.context.extensionUri, 'out'),
      ],
    };

    webviewView.webview.html = this.buildHtml(webviewView.webview);
    this.setupMessageHandlers(webviewView.webview);

    // Restore session after webview is ready (slight delay to ensure DOM ready)
    setTimeout(() => this.restoreSession(), 300);

    // Health ping every 8 seconds
    const healthInterval = setInterval(() => this.pingHealth(), 8000);
    this.pingHealth();

    webviewView.onDidDispose(() => clearInterval(healthInterval));
  }

  // ─── Message Dispatch ───────────────────────────────────────────────────────

  private setupMessageHandlers(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      switch (msg.type) {
        case 'sendMessage':
          this.debouncedSend(String(msg.content ?? ''));
          break;
        case 'stopStreaming':
          this.sse.abort();
          break;
        case 'clearChat':
          await this.handleClearChat();
          break;
        case 'switchModel':
          this.session.modelTier = String(msg.tier ?? '14b');
          await this.memory.saveSession(this.session);
          break;
        case 'copyCode':
          await vscode.env.clipboard.writeText(String(msg.code ?? ''));
          vscode.window.showInformationMessage('Code copied to clipboard.');
          break;
        case 'insertCode':
          await this.fs.insertAtCursor(String(msg.code ?? ''));
          break;
        case 'applyCode': {
          const code = String(msg.code ?? '');
          this.lastAppliedCode = code;
          const editor = vscode.window.activeTextEditor;
          if (editor && !editor.selection.isEmpty) {
            await this.fs.replaceSelection(code);
          } else {
            await this.fs.insertAtCursor(code);
          }
          break;
        }
        case 'createFile':
          await this.fs.createNewFile(String(msg.code ?? ''), String(msg.filename ?? ''));
          break;
        case 'injectContext':
          await this.handleInjectContext();
          break;
        case 'ready':
          // Webview signals it's mounted; restore messages
          this.restoreSession();
          break;
      }
    });
  }

  // ─── Debounced Send ─────────────────────────────────────────────────────────

  private debouncedSend(content: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.handleUserMessage(content), 300);
  }

  // ─── Chat Handling ──────────────────────────────────────────────────────────

  private async handleUserMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    // Check prompt cache first
    const cached = this.memory.cacheGet(content, this.session.modelTier);

    const userMsg: ChatMessage = {
      id: this.memory.generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    await this.memory.appendMessage(this.session, userMsg);
    this.post({ type: 'addMessage', message: userMsg });

    const agentId = this.memory.generateId();
    this.post({ type: 'addMessage', message: { id: agentId, role: 'agent', content: '', timestamp: new Date().toISOString(), streaming: true } });
    this.post({ type: 'showTyping', id: agentId });

    if (cached) {
      // Replay cache instantly character by character (fast local)
      for (const char of cached) {
        this.post({ type: 'token', id: agentId, token: char });
      }
      await this.finaliseAgentMessage(agentId, cached);
      this.post({ type: 'streamComplete', id: agentId });
      return;
    }

    // Gather workspace context if enabled
    let systemContext = '';
    if (vscode.workspace.getConfiguration('eai').get<boolean>('injectProjectContext')) {
      const ctx = await this.fs.gatherProjectContext();
      systemContext = ctx.summary;
    }

    let accumulated = '';

    await this.sse.stream(
      `${this.backendUrl}/api/chat/stream`,
      {
        message: content,
        modelTier: this.session.modelTier,
        conversationHistory: this.memory.getContextWindow(this.session),
        systemContext,
      },
      (event) => {
        if (event.type === 'token') {
          accumulated += event.token ?? '';
          this.post({ type: 'token', id: agentId, token: event.token });
        } else if (event.type === 'progress') {
          this.post({ type: 'showProgress', id: agentId, step: event.step });
        } else if (event.type === 'error') {
          this.post({ type: 'updateMessage', id: agentId, content: `❌ ${event.message}` });
        } else if (event.type === 'done') {
          // handled below
        }
      }
    );

    this.memory.cacheSet(content, this.session.modelTier, accumulated);
    await this.finaliseAgentMessage(agentId, accumulated);
    this.post({ type: 'streamComplete', id: agentId });
  }

  private async finaliseAgentMessage(id: string, content: string): Promise<void> {
    const msg: ChatMessage = {
      id,
      role: 'agent',
      content,
      timestamp: new Date().toISOString(),
    };
    await this.memory.appendMessage(this.session, msg);
    this.post({ type: 'hideProgress', id });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async handleClearChat(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Clear all eAI chat history and memory?',
      { modal: true },
      'Clear'
    );
    if (confirm !== 'Clear') return;
    await this.memory.clearSession();
    this.session = this.memory.loadSession();
    this.post({ type: 'clearAll' });
  }

  private async handleInjectContext(): Promise<void> {
    const ctx = await this.fs.gatherProjectContext();
    this.session.workspaceSummary = ctx.summary;
    await this.memory.saveSession(this.session);
    vscode.window.showInformationMessage(`eAI: Project context injected (${ctx.files.length} files).`);
    this.post({ type: 'contextInjected', summary: ctx.summary });
  }

  private restoreSession(): void {
    for (const msg of this.session.messages) {
      this.post({ type: 'addMessage', message: msg });
    }
    this.post({ type: 'modelUpdate', tier: this.session.modelTier });
  }

  private async pingHealth(): Promise<void> {
    try {
      const r = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const data = (await r.json()) as Record<string, unknown>;
      this.post({ type: 'healthUpdate', health: { status: data['status'] ?? 'unknown' } });
    } catch {
      this.post({ type: 'healthUpdate', health: { status: 'offline' } });
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.view?.webview.postMessage(msg);
  }

  // ─── Public Commands ─────────────────────────────────────────────────────────

  public async explainSelection(): Promise<void> {
    const sel = this.fs.getSelectedText();
    const lang = this.fs.getActiveLanguage();
    if (!sel) { vscode.window.showInformationMessage('Select some code first.'); return; }
    await vscode.commands.executeCommand('eaiChatView.focus');
    await this.handleUserMessage(`Explain this ${lang} code:\n\`\`\`${lang}\n${sel}\n\`\`\``);
  }

  public async refactorSelection(): Promise<void> {
    const sel = this.fs.getSelectedText();
    const lang = this.fs.getActiveLanguage();
    if (!sel) { vscode.window.showInformationMessage('Select some code first.'); return; }
    await vscode.commands.executeCommand('eaiChatView.focus');
    await this.handleUserMessage(`Refactor and improve this ${lang} code:\n\`\`\`${lang}\n${sel}\n\`\`\``);
  }

  public async clearMemory(): Promise<void> {
    await this.handleClearChat();
  }

  public async injectContext(): Promise<void> {
    await this.handleInjectContext();
  }

  // ─── HTML Generation ─────────────────────────────────────────────────────────

  private buildHtml(webview: vscode.Webview): string {
    const nonce = this.nonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'sidebar.css')
    );
    const backendUrl = this.backendUrl;

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src https: data: vscode-resource:;
             script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
             style-src 'unsafe-inline' https://cdnjs.cloudflare.com vscode-resource:;
             connect-src http://localhost:8000 http://127.0.0.1:8000 ${backendUrl};
             font-src https:;"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css"/>
  <link rel="stylesheet" href="${cssUri}"/>
  <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
<div class="shell">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="status-dot" id="statusDot"></span>
      <span class="header-title">eAI Agent</span>
    </div>
    <div class="header-right">
      <select class="model-select" id="modelSelect">
        <option value="3b">3B Fast</option>
        <option value="14b" selected>14B Core</option>
        <option value="32b">32B Deep</option>
      </select>
    </div>
  </div>

  <!-- Messages -->
  <div class="messages" id="messages"></div>

  <!-- Quick Actions -->
  <div class="quick-actions" id="quickActions">
    <button class="qa-btn" data-prompt="Build a complete [PROJECT TYPE] application with full functionality">🏗 Build</button>
    <button class="qa-btn" data-prompt="Generate [LANGUAGE] code for: ">✨ Code</button>
    <button class="qa-btn" data-prompt="Explain the following code in detail:">📖 Explain</button>
    <button class="qa-btn" data-prompt="Refactor this code for performance and readability:">🔧 Refactor</button>
    <button class="qa-btn" data-prompt="Generate comprehensive unit tests for:">✅ Tests</button>
    <button class="qa-btn" id="btnInjectCtx" data-prompt="">📁 Context</button>
  </div>

  <!-- Input -->
  <div class="input-area">
    <textarea class="chat-input" id="chatInput" rows="1"
      placeholder="Describe what you need… (Enter to send, Shift+Enter for newline)"></textarea>
    <div class="input-actions">
      <button class="btn-send" id="btnSend">Send</button>
      <button class="btn-stop hidden" id="btnStop">Stop</button>
      <button class="btn-icon" id="btnClear" title="Clear chat (Ctrl+Shift+Alt+C)">🗑</button>
    </div>
  </div>
</div>

<script nonce="${nonce}">
/* ─── Bootstrap ─────────────────────────────────────────────────── */
const vscode = acquireVsCodeApi();

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

const $ = id => document.getElementById(id);
const messages      = $('messages');
const chatInput     = $('chatInput');
const btnSend       = $('btnSend');
const btnStop       = $('btnStop');
const btnClear      = $('btnClear');
const modelSelect   = $('modelSelect');
const statusDot     = $('statusDot');
const btnInjectCtx  = $('btnInjectCtx');

let isStreaming = false;
// Per-message token buffers for efficient DOM updates
const tokenBuffers = new Map(); // id -> { el, pending }
let rafScheduled = false;

/* ─── Input auto-resize ─────────────────────────────────────────── */
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

/* ─── Buttons ───────────────────────────────────────────────────── */
btnSend.addEventListener('click', sendMessage);
btnStop.addEventListener('click', () => {
  vscode.postMessage({ type: 'stopStreaming' });
  setStreaming(false);
});
btnClear.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));
modelSelect.addEventListener('change', () =>
  vscode.postMessage({ type: 'switchModel', tier: modelSelect.value }));

btnInjectCtx.addEventListener('click', () => {
  vscode.postMessage({ type: 'injectContext' });
});

document.querySelectorAll('.qa-btn:not(#btnInjectCtx)').forEach(btn => {
  btn.addEventListener('click', e => {
    const prompt = e.currentTarget.dataset.prompt || '';
    chatInput.value = prompt;
    chatInput.focus();
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
  });
});

/* ─── Send ──────────────────────────────────────────────────────── */
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;
  vscode.postMessage({ type: 'sendMessage', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';
  setStreaming(true);
}

function setStreaming(on) {
  isStreaming = on;
  btnSend.classList.toggle('hidden', on);
  btnStop.classList.toggle('hidden', !on);
  btnSend.disabled = on;
}

/* ─── Message Renderer ──────────────────────────────────────────── */
function addMessage(msg) {
  const existing = document.getElementById('msg-' + msg.id);
  if (existing) return; // prevent duplicates on session restore

  const wrap = document.createElement('div');
  wrap.className = 'msg msg-' + msg.role;
  wrap.id = 'msg-' + msg.id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = msg.role === 'user' ? '👤' : '🤖';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = msg.role === 'user'
    ? escapeHtml(msg.content)
    : (msg.content ? renderMarkdown(msg.content) : '<span class="typing"><span></span><span></span><span></span></span>');

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = formatTime(msg.timestamp);

  body.appendChild(bubble);
  body.appendChild(meta);

  if (msg.role === 'user') {
    wrap.appendChild(body);
    wrap.appendChild(avatar);
  } else {
    wrap.appendChild(avatar);
    wrap.appendChild(body);
  }

  messages.appendChild(wrap);
  scrollToBottom();

  if (msg.role === 'agent') {
    tokenBuffers.set(msg.id, { bubble, pending: '' });
  }
}

/* ─── Token streaming via rAF batching ─────────────────────────── */
function appendToken(id, token) {
  const buf = tokenBuffers.get(id);
  if (!buf) return;
  buf.pending += token;
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(flushTokens);
  }
}

function flushTokens() {
  rafScheduled = false;
  for (const [id, buf] of tokenBuffers) {
    if (!buf.pending) continue;
    // Accumulate the full text from data attribute for correct markdown parsing
    const current = buf.bubble.dataset.raw || '';
    const updated = current + buf.pending;
    buf.bubble.dataset.raw = updated;
    buf.bubble.innerHTML = renderMarkdown(updated);
    buf.pending = '';
    highlightCodeBlocks(buf.bubble);
  }
  scrollToBottom();
}

function completeStream(id) {
  const buf = tokenBuffers.get(id);
  if (buf && buf.pending) flushTokens();
  tokenBuffers.delete(id);
  setStreaming(false);
  // Attach code action buttons
  const msgEl = document.getElementById('msg-' + id);
  if (msgEl) attachCodeActions(msgEl);
}

/* ─── Progress ───────────────────────────────────────────────────── */
function showProgress(id, step) {
  const msgEl = document.getElementById('msg-' + id);
  if (!msgEl) return;
  let prog = msgEl.querySelector('.msg-progress');
  if (!prog) {
    prog = document.createElement('div');
    prog.className = 'msg-progress';
    msgEl.querySelector('.msg-body').appendChild(prog);
  }
  prog.textContent = '⏳ ' + step;
}

function hideProgress(id) {
  const msgEl = document.getElementById('msg-' + id);
  msgEl?.querySelector('.msg-progress')?.remove();
}

/* ─── Code Actions ────────────────────────────────────────────────── */
function attachCodeActions(msgEl) {
  msgEl.querySelectorAll('pre code').forEach(block => {
    if (block.classList.contains('hljs')) return;
    hljs.highlightElement(block);
    const pre = block.parentElement;
    if (pre.querySelector('.code-actions')) return;

    const langMatch = block.className.match(/language-(\\w+)/);
    const lang = langMatch ? langMatch[1] : 'text';

    const bar = document.createElement('div');
    bar.className = 'code-actions';

    const mkBtn = (label, handler) => {
      const b = document.createElement('button');
      b.className = 'code-btn';
      b.textContent = label;
      b.addEventListener('click', handler);
      bar.appendChild(b);
    };

    mkBtn('📋 Copy', () => vscode.postMessage({ type: 'copyCode', code: block.textContent || '' }));
    mkBtn('➕ Insert', () => vscode.postMessage({ type: 'insertCode', code: block.textContent || '', language: lang }));
    mkBtn('✅ Apply', () => vscode.postMessage({ type: 'applyCode', code: block.textContent || '', language: lang }));
    mkBtn('📄 New File', () => vscode.postMessage({ type: 'createFile', code: block.textContent || '', filename: '' }));

    pre.appendChild(bar);
  });
}

function highlightCodeBlocks(container) {
  container.querySelectorAll('pre code:not(.hljs)').forEach(b => hljs.highlightElement(b));
}

/* ─── Incoming messages from extension ─────────────────────────── */
window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.type) {
    case 'addMessage':     addMessage(msg.message); break;
    case 'token':          appendToken(msg.id, msg.token); break;
    case 'showTyping':     /* typing indicator shown by empty bubble */ break;
    case 'showProgress':   showProgress(msg.id, msg.step); break;
    case 'hideProgress':   hideProgress(msg.id); break;
    case 'streamComplete': completeStream(msg.id); break;
    case 'updateMessage': {
      const el = document.getElementById('msg-' + msg.id);
      const bubble = el?.querySelector('.msg-bubble');
      if (bubble) bubble.innerHTML = renderMarkdown(msg.content || '');
      break;
    }
    case 'clearAll':
      messages.innerHTML = '';
      tokenBuffers.clear();
      setStreaming(false);
      break;
    case 'modelUpdate':
      modelSelect.value = msg.tier || '14b';
      break;
    case 'healthUpdate':
      statusDot.className = 'status-dot ' + (msg.health?.status === 'ok' ? 'online' : 'offline');
      break;
    case 'contextInjected':
      vscode.postMessage({ type: 'sendMessage',
        content: '✅ Project context injected. I now have awareness of: ' + (msg.summary || '') });
      break;
  }
});

/* ─── Utilities ─────────────────────────────────────────────────── */
function renderMarkdown(text) {
  try { return marked.parse(text || ''); } catch { return escapeHtml(text); }
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// Signal ready to extension
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  private nonce(): string {
    let t = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
    return t;
  }
}
// ✅ END OF SidebarChatProvider.ts