"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRouterUI = void 0;
/**
 * AgentRouterUI: Component for visualizing agent routing, spawns, and fitness metrics.
 */
class AgentRouterUI {
    static renderRouting(model, reason) {
        return `
      <div class="agent-card routing">
        <div class="agent-header">
          <span class="icon">🎯</span>
          <span class="title">Routed to <strong>${model}</strong></span>
        </div>
        <div class="agent-body">${reason}</div>
      </div>
    `;
    }
    static renderFitness(agentId, score) {
        const status = score > 0.8 ? 'pro' : score > 0.5 ? 'stable' : 'weak';
        return `
      <div class="agent-card fitness ${status}">
        <div class="agent-header">
          <span class="icon">⚖️</span>
          <span class="title">Agent: ${agentId.slice(0, 8)}</span>
          <span class="badge">${(score * 100).toFixed(0)}% Fitness</span>
        </div>
      </div>
    `;
    }
    static renderPlan(steps) {
        return `
      <div class="plan-container">
        <div class="plan-header">📋 Execution Plan</div>
        <ul class="plan-list">
          ${steps.map(step => `<li>${step}</li>`).join('')}
        </ul>
      </div>
    `;
    }
}
exports.AgentRouterUI = AgentRouterUI;
// ✅ END OF AgentRouterUI.ts
//# sourceMappingURL=AgentRouterUI.js.map