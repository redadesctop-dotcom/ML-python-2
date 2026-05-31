/**
 * AgentRouterUI: Component for visualizing agent routing, spawns, and fitness metrics.
 */
export class AgentRouterUI {
  public static renderRouting(model: string, reason: string): string {
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

  public static renderFitness(agentId: string, score: number): string {
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

  public static renderPlan(steps: string[]): string {
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
// ✅ END OF AgentRouterUI.ts
