"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatPanel_1 = require("./ChatPanel");
const SidebarProvider_1 = require("./SidebarProvider");
function activate(context) {
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
    const sidebarProvider = new SidebarProvider_1.SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("eai.sidebar", sidebarProvider));
    // 3. Command Registrations
    context.subscriptions.push(vscode.commands.registerCommand('eai.openChat', () => {
        ChatPanel_1.ChatPanel.createOrShow(context.extensionUri);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('eai.switchModelTier', async () => {
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
    }));
    context.subscriptions.push(vscode.commands.registerCommand('eai.refactorSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            if (text) {
                ChatPanel_1.ChatPanel.createOrShow(context.extensionUri);
                ChatPanel_1.ChatPanel.currentPanel?.sendTask('refactor', text);
            }
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('eai.explainCode', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            if (text) {
                ChatPanel_1.ChatPanel.createOrShow(context.extensionUri);
                ChatPanel_1.ChatPanel.currentPanel?.sendTask('explain', text);
            }
        }
    }));
    // Periodic Health Check
    setInterval(() => {
        checkHealth(healthStatusBar, agentCountStatusBar);
    }, 5000);
}
function updateModelTierStatusBar(item) {
    const tier = vscode.workspace.getConfiguration('eai').get('defaultModelTier', '14b');
    item.text = `$(sparkle) eAI: ${tier}`;
}
function updateAgentCountStatusBar(item, spawned, condemned) {
    item.text = `$(hubot) ${spawned}/${condemned}`;
}
function updateHealthStatusBar(item, status) {
    if (status === 'ok') {
        item.text = `$(pass-filled) eAI: Online`;
    }
    else if (status === 'degraded') {
        item.text = `$(warning) eAI: Degraded`;
    }
    else {
        item.text = `$(circle-slash) eAI: Offline`;
    }
}
async function checkHealth(healthItem, agentItem) {
    const backendUrl = vscode.workspace.getConfiguration('eai').get('backendUrl', 'http://localhost:8000');
    try {
        const response = await fetch(`${backendUrl}/health`);
        const data = await response.json();
        updateHealthStatusBar(healthItem, data.status);
        updateAgentCountStatusBar(agentItem, data.agents.spawned, data.agents.condemned);
    }
    catch (e) {
        updateHealthStatusBar(healthItem, 'offline');
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map