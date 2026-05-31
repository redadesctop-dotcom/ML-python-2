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
exports.WorkspaceIndexer = void 0;
const vscode = __importStar(require("vscode"));
/**
 * WorkspaceIndexer: Auto-scans project, builds context map, and extracts symbols.
 */
class WorkspaceIndexer {
    constructor() {
        this.ignorePatterns = [];
        this.updateIgnorePatterns();
    }
    async updateIgnorePatterns() {
        this.ignorePatterns = ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**'];
        const roots = vscode.workspace.workspaceFolders;
        if (!roots)
            return;
        for (const root of roots) {
            const gitignore = vscode.Uri.joinPath(root.uri, '.gitignore');
            try {
                const bytes = await vscode.workspace.fs.readFile(gitignore);
                const content = Buffer.from(bytes).toString('utf-8');
                const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                this.ignorePatterns.push(...lines.map(l => `**/${l.trim()}/**`));
            }
            catch { /* ignore */ }
        }
    }
    async getFullContext() {
        await this.updateIgnorePatterns();
        const roots = vscode.workspace.workspaceFolders;
        if (!roots)
            return { fileTree: '', symbols: {} };
        const exclude = `{${this.ignorePatterns.join(',')}}`;
        const files = await vscode.workspace.findFiles('**/*', exclude, 200);
        const fileTree = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
        const symbols = {};
        const activeEditor = vscode.window.activeTextEditor;
        let activeFile;
        if (activeEditor) {
            activeFile = {
                path: vscode.workspace.asRelativePath(activeEditor.document.uri),
                content: activeEditor.document.getText().slice(0, 10000)
            };
        }
        return { fileTree, symbols, activeFile };
    }
    async getSymbolsForFile(uri) {
        try {
            const docSymbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
            if (!docSymbols)
                return [];
            return docSymbols.map(s => ({
                name: s.name,
                kind: vscode.SymbolKind[s.kind],
                line: s.range.start.line
            }));
        }
        catch {
            return [];
        }
    }
}
exports.WorkspaceIndexer = WorkspaceIndexer;
// ✅ END OF WorkspaceIndexer.ts
//# sourceMappingURL=WorkspaceIndexer.js.map