/**
 * SSEParser — robust Server-Sent Events consumer.
 * Handles malformed chunks, retries, and abort signals.
 */

export interface SSEEvent {
  type: 'token' | 'progress' | 'error' | 'done';
  token?: string;
  step?: string;
  message?: string;
}

export type SSECallback = (event: SSEEvent) => void;

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

export class SSEParser {
  private abortController: AbortController | null = null;

  /** Cancel any in-flight request. */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Stream from `url` and call `onEvent` for each SSE event.
   * Retries up to MAX_RETRIES times with exponential backoff.
   */
  async stream(
    url: string,
    body: Record<string, unknown>,
    onEvent: SSECallback
  ): Promise<void> {
    this.abort(); // cancel any previous stream
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        await this._doStream(url, body, signal, onEvent);
        return; // success — exit
      } catch (err: unknown) {
        if (signal.aborted) return; // intentional cancel
        const isRetryable =
          err instanceof TypeError || // network failure / fetch failed
          (err instanceof Error && err.message.includes('fetch'));

        if (isRetryable && attempt < MAX_RETRIES) {
          attempt++;
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          onEvent({ type: 'progress', step: `Connection failed — retrying (${attempt}/${MAX_RETRIES})…` });
          await sleep(delay);
          continue;
        }

        const msg = err instanceof Error ? err.message : String(err);
        onEvent({ type: 'error', message: msg });
        return;
      }
    }
  }

  private async _doStream(
    url: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
    onEvent: SSECallback
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from backend');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (split on \n\n or \n)
        const lines = buffer.split('\n');
        // Keep incomplete last line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const raw = trimmed.slice(5).trim();
          if (raw === '[DONE]') {
            onEvent({ type: 'done' });
            return;
          }

          const parsed = safeParseJSON(raw);
          if (!parsed) continue;

          const type = String(parsed.type ?? '');
          if (type === 'token') {
            onEvent({ type: 'token', token: String(parsed.token ?? '') });
          } else if (type === 'progress') {
            onEvent({ type: 'progress', step: String(parsed.step ?? '') });
          } else if (type === 'error') {
            onEvent({ type: 'error', message: String(parsed.message ?? 'Unknown error') });
          }
        }
      }
    } finally {
      // Always release the reader lock
      try { reader.cancel(); } catch (_) { /* ignore */ }
    }

    onEvent({ type: 'done' });
  }
}

function safeParseJSON(raw: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
  } catch (_) { /* ignore */ }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// ✅ END OF SSEParser.ts