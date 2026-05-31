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
const SidebarChatProvider_1 = require("./SidebarChatProvider");
/**
 * eAI Pro Extension Entry Point.
 * Activation, command registration, and terminal bridging.
 */
function activate(context) {
    // 1. Initialize Sidebar
    const provider = new SidebarChatProvider_1.SidebarChatProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarChatProvider_1.SidebarChatProvider.viewType, provider));
    // 2. Command Registration
    context.subscriptions.push(vscode.commands.registerCommand('eai.focusSidebar', () => {
        vscode.commands.executeCommand('eaiMainView.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('eai.applyAllDiffs', () => {
        vscode.window.showInformationMessage('Applying all eAI changes...');
        // Sidebar provider handles this via message
    }));
    context.subscriptions.push(vscode.commands.registerCommand('eai.undoLastChange', () => {
        // Logic for undoing the last change
    }));
    // 3. Terminal Integration Bridge
    let agentTerminal;
    context.subscriptions.push(vscode.commands.registerCommand('eai.toggleTerminal', () => {
        if (!agentTerminal) {
            agentTerminal = vscode.window.createTerminal('eAI Agent');
        }
        agentTerminal.show();
    }));
    // 4. Auto-Indexing on Startup
    const config = vscode.workspace.getConfiguration('eai');
    if (config.get('autoIndex')) {
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
function deactivate() {
    // Cleanup terminal if needed
}
// ✅ END OF extension.ts
//# sourceMappingURL=extension.js.map