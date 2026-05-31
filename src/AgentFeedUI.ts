/**
 * AgentFeedUI: Component for visualizing agent orchestration.
 * Renders routing, fitness, and dynamic sub-agent lifecycle events.
 */
export class AgentFeedUI {
  /** Generate HTML for a routing decision badge. */
  public static renderRouting(model: string, reason: string): string {
    return `
      <div class="agent-event routing-event">
        <span class="icon">🎯</span>
        <div class="event-details">
          <span class="event-title">Routed to <strong>${model}</strong></span>
          <span class="event-reason">${reason}</span>
        </div>
      </div>
    `;
  }

  /** Generate HTML for an agent quality/fitness score. */
  public static renderFitness(score: number, pValue: number): string {
    const statusClass = score > 0.8 ? 'success' : score > 0.5 ? 'warning' : 'danger';
    return `
      <div class="agent-event fitness-event ${statusClass}">
        <span class="icon">⚖️</span>
        <div class="event-details">
          <span class="event-title">Quality Score: <strong>${(score * 100).toFixed(1)}%</strong></span>
          <span class="event-reason">Statistical confidence p < ${pValue.toFixed(3)}</span>
        </div>
      </div>
    `;
  }

  /** Generate HTML for dynamic agent lifecycle (spawn/condemn). */
  public static renderLifecycle(spawned: number, condemned: number): string {
    return `
      <div class="agent-event lifecycle-event">
        <span class="icon">🤖</span>
        <div class="event-details">
          <span class="event-title">Agent Network Activity</span>
          <span class="event-reason">${spawned} Spawned | ${condemned} Condemned</span>
        </div>
      </div>
    `;
  }

  /** Generate HTML for the audit ledger SHA256 hash. */
  public static renderLedgerHash(hash: string): string {
    return `
      <div class="agent-event ledger-event">
        <span class="icon">🔒</span>
        <div class="event-details">
          <span class="event-title">Ledger Checkpoint</span>
          <span class="event-reason">SHA256: <code>${hash.slice(0, 12)}...</code></span>
        </div>
      </div>
    `;
  }
}
// ✅ END OF AgentFeedUI.ts
