export interface SSEEvent {
  type: 'token' | 'thought' | 'progress' | 'routing' | 'fitness' | 'error' | 'done';
  data?: any;
}

/**
 * SSEClient: Robust streaming client with exponential backoff retry and backpressure.
 */
export class SSEClient {
  private abortController: AbortController | null = null;
  private retryDelay = 1000;

  public abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public async stream(
    url: string,
    body: any,
    onEvent: (ev: SSEEvent) => void
  ): Promise<void> {
    this.abort();
    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            onEvent(parsed);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      onEvent({ type: 'error', data: err.message });
      
      // Auto-retry with backoff
      if (this.retryDelay < 30000) {
        setTimeout(() => this.stream(url, body, onEvent), this.retryDelay);
        this.retryDelay *= 2;
      }
    }
  }
}
// ✅ END OF SSEClient.ts
