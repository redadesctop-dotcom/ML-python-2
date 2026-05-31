import * as vscode from 'vscode';
import { WorkspaceIndexer } from './WorkspaceIndexer';
import { DiffManager } from './DiffManager';
import { SSEClient } from './SSEClient';

// Simple logger interface
const logger = {
  debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data || ''),
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || '')
};

/**
 * SidebarChatProvider: Production-grade VS Code Sidebar.
 * Integrates with LangGraph orchestration, real-time agent updates, and workspace indexing.
 */
export class SidebarChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'eaiMainView';
  private view?: vscode.WebviewView;
  private indexer = new WorkspaceIndexer();
  private diffs = new DiffManager();
  private sse = new SSEClient();
  private agentActivations: Map<string, number> = new Map();
  private planSteps: string[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

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
    this.setupMessageHandlers(webviewView.webview);
    this.startHealthPolling();
  }

  private setupMessageHandlers(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case 'sendPrompt':
            if (!msg.content || typeof msg.content !== 'string') {
              webview.postMessage({ type: 'error', message: 'Invalid prompt format' });
              return;
            }
            await this.handleChat(msg.content, msg.tier || '14b', msg.sessionId);
            break;

          case 'applyChanges':
            if (!msg.content) {
              webview.postMessage({ type: 'error', message: 'No changes to apply' });
              return;
            }
            try {
              const files = this.diffs.parseAgentOutput(msg.content);
              await this.diffs.applyChanges(files);
              webview.postMessage({ type: 'changesApplied', count: files.length });
            } catch (applyErr) {
              webview.postMessage({ 
                type: 'error', 
                message: `Failed to apply changes: ${applyErr instanceof Error ? applyErr.message : String(applyErr)}` 
              });
            }
            break;

          case 'undoChange':
            try {
              await this.diffs.undoLast();
              webview.postMessage({ type: 'changeUndone' });
            } catch (undoErr) {
              webview.postMessage({ 
                type: 'error', 
                message: `Failed to undo: ${undoErr instanceof Error ? undoErr.message : String(undoErr)}` 
              });
            }
            break;

          case 'abort':
            this.sse.abort();
            webview.postMessage({ type: 'streamAborted' });
            break;

          default:
            logger.warn(`Unknown message type: ${msg.type}`);
        }
      } catch (err) {
        logger.error(`Error handling message: ${err}`);
        webview.postMessage({ 
          type: 'error', 
          message: `Message handling error: ${err instanceof Error ? err.message : String(err)}` 
        });
      }
    });
  }

  private async handleChat(prompt: string, tier: string = '14b', sessionId?: string): Promise<void> {
    if (!prompt || !prompt.trim()) {
      this.post({ type: 'error', message: 'Prompt cannot be empty' });
      return;
    }

    const config = vscode.workspace.getConfiguration('eai');
    const backend = config.get<string>('backendUrl') || 'http://localhost:8081';
    
    try {
      // 1. Get Context
      const context = await this.indexer.getFullContext();
      this.post({ type: 'contextUsed', path: context.activeFile?.path });

      // 2. Reset agent tracking
      this.agentActivations.clear();
      this.planSteps = [];
      this.post({ type: 'agentsReset' });

      // 3. Start Streaming
      this.post({ type: 'startStream' });
      
      const url = sessionId ? `${backend}/api/chat/stream/${sessionId}` : `${backend}/api/chat/stream`;
      
      await this.sse.stream(
        url,
        {
          message: prompt,
          modelTier: tier,
          systemContext: context.contextString || '',
          session_id: sessionId
        },
        (ev) => {
          try {
            this.handleStreamEvent(ev);
          } catch (eventErr) {
            logger.error(`Error handling stream event: ${eventErr}`);
            this.post({ type: 'error', message: `Stream processing error: ${String(eventErr)}` });
          }
        }
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // Provide specific error messages based on error type
      let userMessage = 'Chat failed: ';
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch')) {
        userMessage += 'Cannot connect to backend. Is the server running?';
      } else if (errorMsg.includes('timeout')) {
        userMessage += 'Request timed out. Please try again.';
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        userMessage += 'Authentication failed. Check your API key.';
      } else {
        userMessage += errorMsg;
      }
      
      this.post({ type: 'error', message: userMessage });
      logger.error(`Chat error: ${errorMsg}`);
    } finally {
      this.post({ type: 'streamEnd' });
    }
  }

  private handleStreamEvent(ev: any): void {
    try {
      // Parse SSE format: "data: {...}\n\n"
      if (typeof ev === 'string') {
        try {
          ev = JSON.parse(ev);
        } catch {
          // Raw text token - skip if not valid
          if (ev.trim()) {
            this.post({ type: 'streamEvent', data: { type: 'token', token: ev } });
          }
          return;
        }
      }

      if (!ev || typeof ev !== 'object') return;

      // Validate event has required type field
      if (!ev.type) {
        logger.warn('Stream event missing type field:', ev);
        return;
      }

      // Route by event type
      switch (ev.type) {
        case 'token':
        case 'thought_line':
        case 'terminal_line':
        case 'file_diff':
        case 'math_proof':
        case 'test_result':
        case 'critic_review':
        case 'stats':
          this.post({ type: 'streamEvent', data: ev });
          break;

        case 'metadata':
          this.handleMetadataEvent(ev);
          break;

        case 'agent_activation':
          const agentName = ev.metadata?.agent_name || ev.agent || 'unknown';
          const currentCount = (this.agentActivations.get(agentName) || 0) + 1;
          this.agentActivations.set(agentName, currentCount);
          this.post({
            type: 'agentActive',
            agent: agentName,
            count: currentCount
          });
          break;

        case 'tool_call':
          const toolType = ev.metadata?.tool_call?.tool_type || ev.tool || 'unknown';
          this.post({
            type: 'toolExecution',
            tool: toolType,
            details: ev.metadata?.tool_call || ev
          });
          break;

        case 'done':
          this.post({ type: 'streamEnd' });
          break;

        case 'error':
          this.post({ 
            type: 'error', 
            message: ev.message || 'Unknown error occurred during stream' 
          });
          break;

        default:
          // Log unexpected event types but don't break
          if (ev.type !== 'unknown') {
            logger.debug(`Unhandled stream event type: ${ev.type}`);
          }
          this.post({ type: 'streamEvent', data: ev });
      }
    } catch (err) {
      logger.error('Error handling stream event:', err);
      this.post({ 
        type: 'error', 
        message: `Stream event processing error: ${err instanceof Error ? err.message : String(err)}` 
      });
    }
  }

  private handleMetadataEvent(ev: any): void {
    const message = ev.message || '';
    const metadata = ev.metadata || {};

    if (message.startsWith('agent:')) {
      // Agent state update
      const agentName = message.replace('agent:', '');
      this.post({
        type: 'agentState',
        agent: agentName,
        metadata: metadata
      });
    } else if (message === 'plan:generated') {
      // Plan generated
      const plan = metadata.plan || {};
      this.planSteps = plan.steps || [];
      this.post({
        type: 'planGenerated',
        plan: {
          steps: plan.steps || [],
          files: plan.files || [],
          tools: plan.tools || [],
          estimatedTokens: plan.estimated_tokens || 0,
          notes: plan.notes || ''
        }
      });
    } else if (message === 'critique:result') {
      // Critique feedback
      this.post({
        type: 'critiqueResult',
        passesGate: metadata.passes_gate,
        score: metadata.score,
        issues: metadata.issues || []
      });
    } else {
      // Generic metadata
      this.post({
        type: 'metadata',
        message: message,
        data: metadata
      });
    }
  }

  private startHealthPolling(): void {
    setInterval(async () => {
      const config = vscode.workspace.getConfiguration('eai');
      const backend = config.get<string>('backendUrl') || 'http://localhost:8000';
      try {
        const response = await fetch(`${backend}/health`);
        const data = await response.json();
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
  <link rel="stylesheet" href="\${cssUri}">
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
      <div class="controls">
        <button id="clear-btn" class="btn-icon" title="Clear All Chat">🗑️</button>
        <button id="export-btn" class="btn-icon" title="Export Logs">📥</button>
      </div>
      <div class="messages" id="chat-messages"></div>
      
      <!-- Transparency Pipeline Components Container -->
      <div id="transparency-pipeline" class="pipeline-container"></div>
      <div class="input-area">
        <textarea id="chat-input" placeholder="Ask eAI to plan, code, and execute... (Ctrl+Enter to send)"></textarea>
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
      <div id="execution-plan" class="empty-state">No active plan. Send a message to start.</div>
    </div>

    <div class="tab-content" id="tab-agents">
      <div id="agent-feed">
        <div class="agent-item">
          <span class="agent-icon">[C]</span>
          <span class="agent-name">Coordinator</span>
          <span class="agent-count">0</span>
        </div>
        <div class="agent-item">
          <span class="agent-icon">[P]</span>
          <span class="agent-name">Planner</span>
          <span class="agent-count">0</span>
        </div>
        <div class="agent-item">
          <span class="agent-icon">[D]</span>
          <span class="agent-name">Developer</span>
          <span class="agent-count">0</span>
        </div>
        <div class="agent-item">
          <span class="agent-icon">[Cr]</span>
          <span class="agent-name">Critic</span>
          <span class="agent-count">0</span>
        </div>
        <div class="agent-item">
          <span class="agent-icon">[T]</span>
          <span class="agent-name">Tool Router</span>
          <span class="agent-count">0</span>
        </div>
        <div class="agent-item">
          <span class="agent-icon">[M]</span>
          <span class="agent-name">Memory</span>
          <span class="agent-count">0</span>
        </div>
      </div>
    </div>

    <div class="tab-content" id="tab-terminal">
      <div id="terminal-stream" class="terminal-view"></div>
    </div>

    <div class="status-bar">
      <span id="health-status" class="status-offline">Offline</span>
      <span id="vram-stat">VRAM: --%</span>
      <span id="context-badge">Context: -</span>
    </div>
  </div>

  <script nonce="\${nonce}">
    const vscode = acquireVsCodeApi();
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const messages = document.getElementById('chat-messages');
    const agentFeed = document.getElementById('agent-feed');
    const healthStatus = document.getElementById('health-status');
    const vramStat = document.getElementById('vram-stat');
    const planDiv = document.getElementById('execution-plan');
    const clearBtn = document.getElementById('clear-btn');
    const exportBtn = document.getElementById('export-btn');
    const pipeline = document.getElementById('transparency-pipeline');

    let activeBlocks = {};
    let currentSessionId = null;
    let isStreaming = false;

    // Helper: Show error message to user
    function showErrorNotification(title, message) {
      const div = document.createElement('div');
      div.className = 'msg error';
      div.innerHTML = '<strong>' + title + ':</strong> ' + message;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    // Helper: Create collapsible block
    function getOrCreateBlock(id, title, icon) {
      if (activeBlocks[id]) return activeBlocks[id];
      
      const block = document.createElement('div');
      block.className = 'collapsible-block active';
      block.innerHTML = '<div class="collapsible-header" onclick="this.parentElement.classList.toggle(\'active\')"><strong>' + icon + ' ' + title + '</strong></div><div class="collapsible-content" id="block-' + id + '"></div>';
      pipeline.appendChild(block);
      
      activeBlocks[id] = block.querySelector('#block-' + id);
      return activeBlocks[id];
    }

    // UI Controls
    clearBtn.addEventListener('click', () => {
      if (isStreaming) {
        showErrorNotification('Cannot Clear', 'Wait for current operation to complete');
        return;
      }
      messages.innerHTML = '';
      pipeline.innerHTML = '';
      activeBlocks = {};
    });

    exportBtn.addEventListener('click', () => {
      try {
        const log = document.body.innerText;
        const blob = new Blob([log], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'eai-log-' + new Date().toISOString().slice(0,10) + '.txt';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showErrorNotification('Export Failed', err.message || 'Could not export logs');
      }
    });

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        const tabContent = document.getElementById('tab-' + tabName);
        if (tabContent) {
          tabContent.classList.add('active');
        }
      });
    });

    // Chat Send
    sendBtn.addEventListener('click', async () => {
      const content = chatInput.value.trim();
      if (!content) {
        showErrorNotification('Empty Prompt', 'Please enter a message');
        return;
      }

      if (isStreaming) {
        showErrorNotification('Already Running', 'Wait for current operation to complete');
        return;
      }
      
      isStreaming = true;
      sendBtn.disabled = true;
      chatInput.disabled = true;
      
      try {
        vscode.postMessage({
          type: 'sendPrompt',
          content: content,
          tier: document.getElementById('tier-select').value,
          sessionId: currentSessionId
        });
        chatInput.value = '';
      } catch (err) {
        showErrorNotification('Send Failed', err.message || 'Could not send message');
        isStreaming = false;
        sendBtn.disabled = false;
        chatInput.disabled = false;
      }
    });

    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Message Handler
    window.addEventListener('message', e => {
      const msg = e.data;
      try {
        switch (msg.type) {
          case 'streamEvent':
            if (msg.data) handleStreamEvent(msg.data);
            break;
          case 'agentState':
            updateAgentState(msg.agent, msg.metadata);
            break;
          case 'agentActive':
            updateAgentCount(msg.agent, msg.count);
            break;
          case 'planGenerated':
            updatePlan(msg.plan);
            break;
          case 'critiqueResult':
            showCritique(msg);
            break;
          case 'toolExecution':
            addToolLog(msg.tool, msg.details);
            break;
          case 'health':
            updateHealth(msg.data);
            break;
          case 'error':
            showErrorNotification('Error', msg.message || 'An error occurred');
            break;
          case 'streamEnd':
            finalizeStream();
            isStreaming = false;
            sendBtn.disabled = false;
            chatInput.disabled = false;
            break;
          case 'streamAborted':
            const div = document.createElement('div');
            div.className = 'msg system';
            div.innerText = '⏹️ Stream aborted by user';
            messages.appendChild(div);
            isStreaming = false;
            sendBtn.disabled = false;
            chatInput.disabled = false;
            break;
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    });

    function handleStreamEvent(ev) {
      if (!ev || !ev.type) return;

      try {
        switch (ev.type) {
          case 'thought_line':
            const thoughtBlock = getOrCreateBlock('thought', 'THOUGHT PROCESS', '💭');
            const line = document.createElement('div');
            line.className = 'thought-line';
            line.innerText = '[' + (ev.agent || 'Agent') + '] ' + (ev.text || '');
            thoughtBlock.appendChild(line);
            thoughtBlock.parentElement.scrollTop = thoughtBlock.parentElement.scrollHeight;
            break;

          case 'terminal_line':
            const termBlock = getOrCreateBlock('terminal', 'TERMINAL OUTPUT', '💻');
            const termLine = document.createElement('div');
            termLine.className = 'terminal-line';
            termLine.innerText = ev.data || ev.text || '';
            termBlock.appendChild(termLine);
            const termTab = document.getElementById('terminal-stream');
            if (termTab) {
              termTab.appendChild(termLine.cloneNode(true));
              termTab.scrollTop = termTab.scrollHeight;
            }
            break;

          case 'math_proof':
            const mathBlock = getOrCreateBlock('math', 'MATH PROOF', '🔢');
            mathBlock.innerHTML = '<div class="math-proof" style="animation: fadeIn 0.4s ease-out">' +
              '<div><strong>Proven:</strong> ' + (ev.proven ? '✅ Yes' : '❌ No') + '</div>' +
              '<div><strong>Complexity:</strong> Time ' + (ev.complexity?.time || 'O(?)') + ' | Space ' + (ev.complexity?.space || 'O(?)') + '</div>' +
              '<strong>Verification Steps:</strong><ul style="margin-top:4px; padding-left:16px">' +
              (ev.proof_steps || []).map(s => '<li style="margin-bottom:2px">' + (s || '') + '</li>').join('') +
              '</ul></div>';
            break;

          case 'test_result':
            const testBlock = getOrCreateBlock('test', 'ISOLATED TEST RESULTS', '🧪');
            const statusColor = ev.passed ? '#4ec9b0' : '#f48771';
            testBlock.innerHTML = '<div class="test-results" style="animation: fadeIn 0.4s ease-out; border-left: 3px solid ' + statusColor + '; padding-left: 10px;">' +
              '<div style="font-weight:600; color:' + statusColor + '; margin-bottom:4px">' + (ev.passed ? '✅ ALL TESTS PASSED' : '❌ TESTS FAILED') + '</div>' +
              '<div style="font-size:11px; opacity:0.8">Environment: ' + (ev.environment || 'Isolated venv') + '</div>' +
              '<div style="display:flex; gap:15px; margin-top:8px">' +
              '<span>Coverage: <strong>' + (ev.coverage || 0) + '%</strong></span>' +
              '<span>Time: <strong>' + (ev.time || 0) + 's</strong></span>' +
              '</div></div>';
            break;

          case 'critic_review':
            const criticBlock = getOrCreateBlock('critic', 'CRITIC REVIEW', '🎯');
            const verdictColor = ev.verdict === 'APPROVED' ? '#4ec9b0' : (ev.verdict === 'REJECTED' ? '#f48771' : '#cca700');
            const issuesHtml = (ev.issues && ev.issues.length) ? 
              '<div style="margin-bottom:4px"><strong>Issues:</strong> <ul style="margin:4px 0; padding-left:16px">' + 
              ev.issues.map(i => '<li>' + (i || '') + '</li>').join('') + 
              '</ul></div>' : 
              '<div>✅ No critical issues found</div>';
            const suggestionsHtml = (ev.suggestions && ev.suggestions.length) ? 
              '<div style="margin-top:8px; font-style:italic; opacity:0.9">💡 ' + ev.suggestions[0] + '</div>' : '';
            criticBlock.innerHTML = '<div class="critic-review" style="animation: fadeIn 0.4s ease-out">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">' +
              '<span style="font-size:14px; font-weight:bold">Score: ' + (ev.score || 0) + '/100</span>' +
              '<span style="padding:2px 8px; border-radius:10px; background:' + verdictColor + '; color:white; font-size:10px">' + (ev.verdict || 'PENDING') + '</span>' +
              '</div>' + issuesHtml + suggestionsHtml + '</div>';
            break;

          case 'file_diff':
            const diffCard = document.createElement('div');
            diffCard.className = 'diff-card';
            diffCard.style.animation = 'fadeIn 0.5s ease-out';
            diffCard.innerHTML = '<div class="diff-header"><span>📄 ' + (ev.path || 'file.txt') + '</span>' +
              '<span style="font-size:10px; opacity:0.7">Patch: ' + (ev.patch_id || 'unknown') + '</span></div>' +
              '<div class="diff-content" style="background:#1e1e1e; color:#d4d4d4; white-space:pre;">' + (ev.diff || '') + '</div>' +
              '<div class="diff-actions">' +
              '<button class="diff-btn accept" onclick="applyPatch(\'' + (ev.patch_id || '') + '\', \'' + (ev.path || '') + '\', \'accept\', this)" style="background:#4ec9b0; color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer">✅ Accept</button>' +
              '<button class="diff-btn" onclick="applyPatch(\'' + (ev.patch_id || '') + '\', \'' + (ev.path || '') + '\', \'reject\', this)" style="background:#f48771; color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer">❌ Reject</button>' +
              '</div></div>';
            pipeline.appendChild(diffCard);
            break;

          case 'token':
            let answerDiv = document.getElementById('final-answer');
            if (!answerDiv) {
              answerDiv = document.createElement('div');
              answerDiv.id = 'final-answer';
              answerDiv.className = 'msg agent';
              answerDiv.style.padding = '12px';
              answerDiv.style.lineHeight = '1.5';
              messages.appendChild(answerDiv);
            }
            answerDiv.innerText += (ev.token || '');
            messages.scrollTop = messages.scrollHeight;
            break;

          case 'stats':
            updateStatsBar(ev);
            break;
        }
      } catch (err) {
        console.error('Error rendering stream event:', err, ev);
      }
    }

            <div class="diff-content" style="background:#1e1e1e; color:#d4d4d4; white-space:pre;">\${ev.diff}</div>
            <div class="diff-actions">
              <button class="btn-small accept" style="background:var(--vscode-button-background); color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer" onclick="applyPatch('\${ev.patch_id}', '\${ev.path}', 'accept', this)">✅ Accept</button>
              <button class="btn-small" style="background:var(--vscode-button-secondaryBackground); color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer" onclick="applyPatch('\${ev.patch_id}', '\${ev.path}', 'reject', this)">❌ Reject</button>
            </div>
          \`;
          pipeline.appendChild(diffCard);
          break;

        case 'token':
          let answerDiv = document.getElementById('final-answer');
          if (!answerDiv) {
            answerDiv = document.createElement('div');
            answerDiv.id = 'final-answer';
            answerDiv.className = 'msg agent';
            answerDiv.style.padding = '12px';
            answerDiv.style.lineHeight = '1.5';
            pipeline.appendChild(answerDiv);
          }
          answerDiv.innerText += ev.token;
          break;

        case 'stats':
          updateStatsBar(ev);
          break;
      }
      
      // Auto-scroll logic
      if (ev.type === 'token' || ev.type === 'thought_line') {
        window.scrollTo(0, document.body.scrollHeight);
      }
    }

    function updateAgentState(agent, metadata) {
      const items = agentFeed.querySelectorAll('.agent-item');
      for (const item of items) {
        const name = item.querySelector('.agent-name')?.innerText;
        if (name && name.toLowerCase() === (agent || '').toLowerCase()) {
          item.classList.add('active');
          setTimeout(() => item.classList.remove('active'), 500);
          break;
        }
      }
    }

    function updateAgentCount(agent, count) {
      const items = agentFeed.querySelectorAll('.agent-item');
      for (const item of items) {
        const name = item.querySelector('.agent-name')?.innerText;
        if (name && name.toLowerCase() === (agent || '').toLowerCase()) {
          const countElement = item.querySelector('.agent-count');
          if (countElement) {
            countElement.innerText = count || 0;
          }
          break;
        }
      }
    }

    function updatePlan(plan) {
      if (!plan) return;
      
      if (planDiv && planDiv.classList.contains('empty-state')) {
        planDiv.classList.remove('empty-state');
        planDiv.innerHTML = '';
      }

      let html = '<div class="plan-container"><h3>Execution Plan</h3>';
      
      if (plan.steps && plan.steps.length > 0) {
        html += '<ol>';
        plan.steps.forEach((step) => {
          html += '<li>' + (typeof step === 'string' ? step : (step.action || JSON.stringify(step))) + '</li>';
        });
        html += '</ol>';
      }

      if (plan.tools && plan.tools.length > 0) {
        html += '<p><strong>Tools:</strong> ' + plan.tools.join(', ') + '</p>';
      }

      if (plan.estimatedTokens) {
        html += '<p><strong>Estimated Tokens:</strong> ' + plan.estimatedTokens + '</p>';
      }

      html += '</div>';
      if (planDiv) {
        planDiv.innerHTML = html;
      }
    }

    function showCritique(msg) {
      const div = document.createElement('div');
      div.className = 'msg system critique';
      let html = '<strong>Critic Feedback</strong><br>';
      html += 'Score: ' + ((msg.score || 0) / 100).toFixed(2) + ' | ';
      html += 'Passes: ' + (msg.passesGate ? 'Yes ✅' : 'No ❌');
      if (msg.issues && msg.issues.length) {
        html += '<br>Issues: ' + msg.issues.join('; ');
      }
      div.innerHTML = html;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function addToolLog(tool, details) {
      const div = document.createElement('div');
      div.className = 'msg system tool-log';
      div.innerHTML = '<strong>Tool:</strong> ' + (tool || 'unknown') + (details ? ' - ' + JSON.stringify(details).substring(0, 100) : '');
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function updateHealth(data) {
      if (!data) return;
      
      const isOnline = data.status === 'ok' || data.status === 'online';
      if (healthStatus) {
        healthStatus.className = isOnline ? 'status-online' : 'status-offline';
        healthStatus.innerText = isOnline ? '✓ Online' : '✗ Offline';
      }
      if (data.vram && vramStat) {
        vramStat.innerText = 'VRAM: ' + (data.vram || '--') + '%';
      }
    }

    function finalizeStream() {
      const div = document.createElement('div');
      div.className = 'msg system done';
      div.innerText = '✅ Stream complete';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    async function applyPatch(patchId, filePath, action, btn) {
      if (!btn || !btn.parentElement) return;
      
      const actionsDiv = btn.parentElement;
      const originalHTML = actionsDiv.innerHTML;
      actionsDiv.innerHTML = '<span style="font-size:11px; opacity:0.8; animation: blink 1s infinite">⏳ Processing patch...</span>';
      
      try {
        const response = await fetch('http://localhost:8081/api/chat/apply-patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patchId: patchId,
            filePath: filePath,
            action: action,
            sessionId: currentSessionId
          })
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const result = await response.json();
        if (result.status === 'success' || result.success) {
          actionsDiv.innerHTML = '<span style="color:#4ec9b0; font-weight:bold; font-size:11px">✅ ' + 
            (action === 'accept' ? 'Patch Applied' : 'Patch Rejected') + '</span>';
        } else {
          throw new Error(result.message || 'Unknown error');
        }
      } catch (err) {
        console.error('Patch error:', err);
        actionsDiv.innerHTML = '<span style="color:#f48771; font-size:11px">❌ Error: ' + 
          (err.message || 'Failed to apply patch') + '</span>';
        setTimeout(() => { 
          actionsDiv.innerHTML = originalHTML; 
        }, 3000);
      }
    }

    function updateStatsBar(ev) {
      if (ev.agents_run !== undefined && ev.agents_total !== undefined) {
        const stat = 'Agents: ' + ev.agents_run + '/' + ev.agents_total;
        console.log('Stats:', stat);
      }
    }
  </script>
</body>
</html>`;
  }
}
// ✅ END OF SidebarChatProvider.ts
