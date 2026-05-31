import * as vscode from 'vscode';
import { SidebarChatProvider } from './SidebarChatProvider';

/**
 * eAI Pro Extension Entry Point.
 * Activation, command registration, and terminal bridging.
 */
export function activate(context: vscode.ExtensionContext) {
  // 1. Initialize Sidebar
  const provider = new SidebarChatProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarChatProvider.viewType, provider)
  );

  // 2. Command Registration
  context.subscriptions.push(
    vscode.commands.registerCommand('eai.focusSidebar', () => {
      vscode.commands.executeCommand('eaiMainView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.applyAllDiffs', () => {
      vscode.window.showInformationMessage('Applying all eAI changes...');
      // Sidebar provider handles this via message
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.undoLastChange', () => {
      // Logic for undoing the last change
    })
  );

  // 3. Terminal Integration Bridge
  let agentTerminal: vscode.Terminal | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('eai.toggleTerminal', () => {
      if (!agentTerminal) {
        agentTerminal = vscode.window.createTerminal('eAI Agent');
      }
      agentTerminal.show();
    })
  );

  // 4. Auto-Indexing on Startup
  const config = vscode.workspace.getConfiguration('eai');
  if (config.get<boolean>('autoIndex')) {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Window,
      title: 'eAI: Indexing Workspace...',
      cancellable: false
    }, async () => {
      // The SidebarChatProvider's indexer will handle this on the first request,
      // but we could trigger a pre-scan here if needed.
    });
  }

  console.log('eAI Agentic IDE Pro Activated.');
}

export function deactivate() {
  // Cleanup terminal if needed
}
// ✅ END OF extension.ts
