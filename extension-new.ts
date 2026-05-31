import * as vscode from 'vscode';
import { SidebarChatProvider } from './SidebarChatProvider';

let provider: SidebarChatProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('eai');
  const backendUrl = config.get<string>('backendUrl') ?? 'http://localhost:8000';

  // Instantiate the sidebar provider
  provider = new SidebarChatProvider(context, backendUrl);

  // Register as WebviewViewProvider — matches the view id in package.json
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarChatProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ─── Commands ────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.openChat', async () => {
      await vscode.commands.executeCommand('eaiChatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.clearMemory', async () => {
      await provider?.clearMemory();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.injectContext', async () => {
      await provider?.injectContext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.explainSelection', async () => {
      await provider?.explainSelection();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.refactorSelection', async () => {
      await provider?.refactorSelection();
    })
  );

  // ─── Config change watcher ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('eai.backendUrl')) {
        vscode.window.showInformationMessage(
          'eAI: Backend URL changed. Reload the window to apply.',
          'Reload'
        ).then(choice => {
          if (choice === 'Reload') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up; VS Code disposes registered subscriptions automatically
}
// ✅ END OF extension.ts