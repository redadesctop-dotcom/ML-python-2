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
exports.MemoryManager = void 0;
const vscode = __importStar(require("vscode"));
const STATE_KEY = 'eai.session';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
class MemoryManager {
    constructor(context) {
        this.promptCache = new Map();
        this.context = context;
        this.maxMessages =
            vscode.workspace.getConfiguration('eai').get('maxContextMessages') ?? 10;
    }
    /** Load session from global state; returns defaults if none exists. */
    loadSession() {
        const saved = this.context.globalState.get(STATE_KEY);
        if (saved)
            return saved;
        return {
            messages: [],
            modelTier: vscode.workspace.getConfiguration('eai').get('defaultModelTier') ?? '14b',
            workspaceSummary: '',
            lastActivity: new Date().toISOString(),
        };
    }
    /** Persist session to global state. */
    async saveSession(state) {
        // Keep only sliding window to avoid unbounded growth
        state.messages = state.messages.slice(-this.maxMessages * 2);
        state.lastActivity = new Date().toISOString();
        await this.context.globalState.update(STATE_KEY, state);
    }
    /** Append a message and persist. */
    async appendMessage(state, message) {
        state.messages.push(message);
        await this.saveSession(state);
    }
    /** Clear all persisted memory. */
    async clearSession() {
        await this.context.globalState.update(STATE_KEY, undefined);
        this.promptCache.clear();
    }
    /** Return last N messages for context injection into API call. */
    getContextWindow(state, n) {
        const limit = n ?? this.maxMessages;
        return state.messages
            .filter(m => m.content.trim().length > 0)
            .slice(-limit)
            .map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content }));
    }
    /** Simple prompt-response cache with TTL. */
    cacheGet(prompt, modelTier) {
        const key = `${modelTier}::${prompt}`;
        const entry = this.promptCache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.promptCache.delete(key);
            return null;
        }
        return entry.response;
    }
    cacheSet(prompt, modelTier, response) {
        const key = `${modelTier}::${prompt}`;
        this.promptCache.set(key, { response, expiresAt: Date.now() + CACHE_TTL_MS });
        // Evict oldest entries if cache grows too large
        if (this.promptCache.size > 50) {
            const firstKey = this.promptCache.keys().next().value;
            if (firstKey)
                this.promptCache.delete(firstKey);
        }
    }
    generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}
exports.MemoryManager = MemoryManager;
// ✅ END OF MemoryManager.ts
//# sourceMappingURL=MemoryManager.js.map