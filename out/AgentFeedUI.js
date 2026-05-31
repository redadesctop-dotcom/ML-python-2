"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFeedUI = void 0;
/**
 * AgentFeedUI: Component for visualizing agent orchestration.
 * Renders routing, fitness, and dynamic sub-agent lifecycle events.
 */
class AgentFeedUI {
    /** Generate HTML for a routing decision badge. */
    static renderRouting(model, reason) {
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
    static renderFitness(score, pValue) {
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
    static renderLifecycle(spawned, condemned) {
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
    static renderLedgerHash(hash) {
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
exports.AgentFeedUI = AgentFeedUI;
// ✅ END OF AgentFeedUI.ts
//# sourceMappingURL=AgentFeedUI.js.map