---
version: 1
last-validated: 2026-05-29
tags: [architecture, moonshot, critical]
confidence: high
---

# Project Architecture

This extension is a Moonshot-powered coding agent inspired by Claude Code and Cline.

Core systems:
- VSCode extension host
- React/Vite webview
- ReAct orchestration loop
- approval-gated tools
- reasoning_content roundtrip support

Critical files:
- agentLoop.ts
- moonshotClient.ts
- provider.ts
- activeFolder.ts

Important:
reasoning_content must always roundtrip correctly for K2.6.
