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
exports.DiffManager = void 0;
const vscode = __importStar(require("vscode"));
/**
 * DiffManager: Generates, applies, and rejects multi-file diffs with rollback support.
 */
class DiffManager {
    constructor() {
        this.pendingChanges = [];
        this.history = [];
    }
    async proposeChanges(changes) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root)
            return;
        for (const change of changes) {
            const uri = vscode.Uri.joinPath(root, change.path);
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                change.originalContent = Buffer.from(bytes).toString('utf-8');
            }
            catch {
                change.originalContent = undefined; // New file
            }
        }
        this.pendingChanges = changes;
    }
    async applyAll() {
        const edit = new vscode.WorkspaceEdit();
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root)
            return;
        for (const change of this.pendingChanges) {
            const uri = vscode.Uri.joinPath(root, change.path);
            if (change.originalContent === undefined) {
                edit.createFile(uri, { overwrite: true });
                edit.insert(uri, new vscode.Position(0, 0), change.content);
            }
            else {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end);
                edit.replace(uri, fullRange, change.content);
            }
        }
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            this.history.push([...this.pendingChanges]);
            this.pendingChanges = [];
            vscode.window.showInformationMessage('eAI: Changes applied successfully.');
        }
    }
    async undoLast() {
        const lastChanges = this.history.pop();
        if (!lastChanges) {
            vscode.window.showWarningMessage('eAI: No history to undo.');
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root)
            return;
        for (const change of lastChanges) {
            const uri = vscode.Uri.joinPath(root, change.path);
            if (change.originalContent === undefined) {
                edit.deleteFile(uri);
            }
            else {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end);
                edit.replace(uri, fullRange, change.originalContent);
            }
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage('eAI: Last change reverted.');
    }
    clearPending() {
        this.pendingChanges = [];
    }
    getPending() {
        return this.pendingChanges;
    }
}
exports.DiffManager = DiffManager;
// ✅ END OF DiffManager.ts
//# sourceMappingURL=DiffManager.js.map