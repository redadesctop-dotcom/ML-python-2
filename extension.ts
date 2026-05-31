import * as vscode from 'vscode';
import { ChatPanel } from './ChatPanel';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('eAI Assistant is now active');

    // 1. Status Bar Items
    const modelTierStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    modelTierStatusBar.command = 'eai.switchModelTier';
    modelTierStatusBar.tooltip = 'Click to switch eAI Model Tier';
    updateModelTierStatusBar(modelTierStatusBar);
    modelTierStatusBar.show();

    const agentCountStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    agentCountStatusBar.tooltip = 'Spawned/Condemned Agents';
    updateAgentCountStatusBar(agentCountStatusBar, 0, 0);
    agentCountStatusBar.show();

    const healthStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    healthStatusBar.tooltip = 'eAI Backend Health Status';
    updateHealthStatusBar(healthStatusBar, 'offline');
    healthStatusBar.show();

    // 2. Sidebar Provider
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("eai.sidebar", sidebarProvider)
    );

    // 3. Command Registrations
    context.subscriptions.push(
        vscode.commands.registerCommand('eai.openChat', () => {
            ChatPanel.createOrShow(context.extensionUri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('eai.switchModelTier', async () => {
            const tiers = ['3b', '14b', '32b', 'cloud'];
            const selection = await vscode.window.showQuickPick(tiers, {
                placeHolder: 'Select eAI Model Tier'
            });
            if (selection) {
                const config = vscode.workspace.getConfiguration('eai');
                await config.update('defaultModelTier', selection, vscode.ConfigurationTarget.Global);
                updateModelTierStatusBar(modelTierStatusBar);
                vscode.window.showInformationMessage(`eAI Model Tier switched to: ${selection}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('eai.refactorSelection', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const text = editor.document.getText(selection);
                if (text) {
                    ChatPanel.createOrShow(context.extensionUri);
                    ChatPanel.currentPanel?.sendTask('refactor', text);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('eai.explainCode', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selection = editor.selection;
                const text = editor.document.getText(selection);
                if (text) {
                    ChatPanel.createOrShow(context.extensionUri);
                    ChatPanel.currentPanel?.sendTask('explain', text);
                }
            }
        })
    );

    // Periodic Health Check
    setInterval(() => {
        checkHealth(healthStatusBar, agentCountStatusBar);
    }, 5000);
}

function updateModelTierStatusBar(item: vscode.StatusBarItem) {
    const tier = vscode.workspace.getConfiguration('eai').get('defaultModelTier', '14b');
    item.text = `$(sparkle) eAI: ${tier}`;
}

function updateAgentCountStatusBar(item: vscode.StatusBarItem, spawned: number, condemned: number) {
    item.text = `$(hubot) ${spawned}/${condemned}`;
}

function updateHealthStatusBar(item: vscode.StatusBarItem, status: string) {
    if (status === 'ok') {
        item.text = `$(pass-filled) eAI: Online`;
    } else if (status === 'degraded') {
        item.text = `$(warning) eAI: Degraded`;
    } else {
        item.text = `$(circle-slash) eAI: Offline`;
    }
}

async function checkHealth(healthItem: vscode.StatusBarItem, agentItem: vscode.StatusBarItem) {
    const backendUrl = vscode.workspace.getConfiguration('eai').get('backendUrl', 'http://localhost:8000');
    try {
        const response = await fetch(`${backendUrl}/health`);
        const data: any = await response.json();
        updateHealthStatusBar(healthItem, data.status);
        updateAgentCountStatusBar(agentItem, data.agents.spawned, data.agents.condemned);
    } catch (e) {
        updateHealthStatusBar(healthItem, 'offline');
    }
}

export function deactivate() {}
