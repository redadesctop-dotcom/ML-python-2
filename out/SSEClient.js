"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEClient = void 0;
/**
 * SSEClient: Robust streaming client with exponential backoff retry and backpressure.
 */
class SSEClient {
    constructor() {
        this.abortController = null;
        this.retryDelay = 1000;
    }
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
    async stream(url, body, onEvent) {
        this.abort();
        this.abortController = new AbortController();
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: this.abortController.signal
            });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const reader = response.body?.getReader();
            if (!reader)
                return;
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: '))
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        onEvent(parsed);
                    }
                    catch { /* skip malformed */ }
                }
            }
        }
        catch (err) {
            if (err.name === 'AbortError')
                return;
            onEvent({ type: 'error', data: err.message });
            // Auto-retry with backoff
            if (this.retryDelay < 30000) {
                setTimeout(() => this.stream(url, body, onEvent), this.retryDelay);
                this.retryDelay *= 2;
            }
        }
    }
}
exports.SSEClient = SSEClient;
// ✅ END OF SSEClient.ts
//# sourceMappingURL=SSEClient.js.map