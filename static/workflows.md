---
version: 1
last-validated: 2026-05-29
tags: [workflow]
confidence: high
---

# Workflows

## Development
1. Make small, testable changes
2. Run typecheck before committing
3. Keep webview and host message types in sync

## Release
1. Update CHANGELOG
2. Bump version in package.json
3. Run smoke tests
4. Publish with `npx @vscode/vsce publish --no-dependencies --skip-license`
