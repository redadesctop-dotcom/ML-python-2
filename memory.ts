import * as vscode from 'vscode';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  tokens?: number;
}

export interface SessionState {
  messages: ChatMessage[];
  modelTier: string;
  workspaceSummary: string;
  lastActivity: string;
}

const STATE_KEY = 'eai.session';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  response: string;
  expiresAt: number;
}

export class MemoryManager {
  private context: vscode.ExtensionContext;
  private promptCache = new Map<string, CacheEntry>();
  private maxMessages: number;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.maxMessages =
      vscode.workspace.getConfiguration('eai').get<number>('maxContextMessages') ?? 10;
  }

  /** Load session from global state; returns defaults if none exists. */
  loadSession(): SessionState {
    const saved = this.context.globalState.get<SessionState>(STATE_KEY);
    if (saved) return saved;
    return {
      messages: [],
      modelTier: vscode.workspace.getConfiguration('eai').get<string>('defaultModelTier') ?? '14b',
      workspaceSummary: '',
      lastActivity: new Date().toISOString(),
    };
  }

  /** Persist session to global state. */
  async saveSession(state: SessionState): Promise<void> {
    // Keep only sliding window to avoid unbounded growth
    state.messages = state.messages.slice(-this.maxMessages * 2);
    state.lastActivity = new Date().toISOString();
    await this.context.globalState.update(STATE_KEY, state);
  }

  /** Append a message and persist. */
  async appendMessage(state: SessionState, message: ChatMessage): Promise<void> {
    state.messages.push(message);
    await this.saveSession(state);
  }

  /** Clear all persisted memory. */
  async clearSession(): Promise<void> {
    await this.context.globalState.update(STATE_KEY, undefined);
    this.promptCache.clear();
  }

  /** Return last N messages for context injection into API call. */
  getContextWindow(state: SessionState, n?: number): Array<{ role: string; content: string }> {
    const limit = n ?? this.maxMessages;
    return state.messages
      .filter(m => m.content.trim().length > 0)
      .slice(-limit)
      .map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content }));
  }

  /** Simple prompt-response cache with TTL. */
  cacheGet(prompt: string, modelTier: string): string | null {
    const key = `${modelTier}::${prompt}`;
    const entry = this.promptCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.promptCache.delete(key);
      return null;
    }
    return entry.response;
  }

  cacheSet(prompt: string, modelTier: string, response: string): void {
    const key = `${modelTier}::${prompt}`;
    this.promptCache.set(key, { response, expiresAt: Date.now() + CACHE_TTL_MS });
    // Evict oldest entries if cache grows too large
    if (this.promptCache.size > 50) {
      const firstKey = this.promptCache.keys().next().value;
      if (firstKey) this.promptCache.delete(firstKey);
    }
  }

  generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
// ✅ END OF MemoryManager.ts