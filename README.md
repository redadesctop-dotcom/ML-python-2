# eAI Assistant VS Code Extension

Intelligent Agentic Development Assistant integrated with the eAI Evolutionary AI backend.

## Features

- **Conversational Chat**: Interact with autonomous AI agents in a dedicated chat panel.
- **Real-time Streaming**: SSE-based token-by-token response display.
- **Agent Dashboard**: Monitor system health, VRAM, and agent evolutionary metrics in the sidebar.
- **Context-Aware**: Right-click to refactor or explain selected code snippets.
- **Project Building**: Direct integration with the eAI project orchestrator.

## Installation

1. Ensure the eAI backend is running at `http://localhost:8000`.
2. Install the extension VSIX:
   ```bash
   code --install-extension eAI.vsix
   ```

## Configuration

Add to your `settings.json`:
```json
{
  "eai.backendUrl": "http://localhost:8000",
  "eai.defaultModelTier": "14b",
  "eai.enableStreaming": true
}
```

## Development

1. `npm install`
2. `npm run compile`
3. Press `F5` in VS Code to launch the Extension Development Host.

## Commands

- `eAI: Open Chat` - Opens the main chat interface.
- `eAI: Switch Model Tier` - Changes the active LLM tier.
- `eAI: View Audit Log` - Opens the SHA256 audit ledger.
