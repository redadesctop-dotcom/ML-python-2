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
exports.FileSystemOps = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Files to always try reading for project context
const CONTEXT_FILES = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'README.md',
    '.eaiignore',
];
// Patterns to always ignore when scanning
const ALWAYS_IGNORE = [
    '**/node_modules/**',
    '**/.git/**',
    '**/out/**',
    '**/dist/**',
    '**/build/**',
    '**/__pycache__/**',
    '**/*.min.js',
    '**/*.map',
];
class FileSystemOps {
    /** Read a single file from the workspace. */
    async readFile(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(bytes).toString('utf-8');
            return { ok: true, message: 'Read OK', content };
        }
        catch (err) {
            return { ok: false, message: `Cannot read file: ${err}` };
        }
    }
    /** Write content to a file, creating parent directories as needed. */
    async writeFile(filePath, content) {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            return { ok: true, message: `Written: ${filePath}` };
        }
        catch (err) {
            return { ok: false, message: `Cannot write file: ${err}` };
        }
    }
    /**
     * Apply a WorkspaceEdit that replaces the full content of a file.
     * Shows a diff preview first and asks for confirmation.
     */
    async applyCodeToFile(filePath, newContent) {
        const uri = vscode.Uri.file(filePath);
        // Show diff preview
        const existsResult = await this.readFile(filePath);
        if (existsResult.ok && existsResult.content !== undefined) {
            // Open a diff editor for preview
            const original = uri;
            const modified = vscode.Uri.parse(`untitled:${path.basename(filePath)}.preview`);
            // Write proposed content into a temp document
            const edit = new vscode.WorkspaceEdit();
            edit.createFile(modified, { overwrite: true, ignoreIfExists: false });
            edit.insert(modified, new vscode.Position(0, 0), newContent);
            await vscode.workspace.applyEdit(edit);
            await vscode.commands.executeCommand('vscode.diff', original, modified, `eAI Proposed Change — ${path.basename(filePath)}`);
            const choice = await vscode.window.showInformationMessage('Apply eAI suggested changes?', { modal: true }, 'Apply', 'Cancel');
            // Clean up temp
            const cleanup = new vscode.WorkspaceEdit();
            cleanup.deleteFile(modified, { ignoreIfNotExists: true });
            await vscode.workspace.applyEdit(cleanup);
            if (choice !== 'Apply') {
                return { ok: false, message: 'User cancelled.' };
            }
        }
        return this.writeFile(filePath, newContent);
    }
    /**
     * Insert text at the current cursor position in the active editor.
     */
    async insertAtCursor(content) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return { ok: false, message: 'No active editor.' };
        const success = await editor.edit(eb => {
            eb.insert(editor.selection.active, content);
        });
        return success
            ? { ok: true, message: 'Inserted at cursor.' }
            : { ok: false, message: 'Edit failed.' };
    }
    /**
     * Replace the currently selected text in the active editor.
     */
    async replaceSelection(content) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return { ok: false, message: 'No active editor.' };
        if (editor.selection.isEmpty)
            return { ok: false, message: 'No selection.' };
        const success = await editor.edit(eb => {
            eb.replace(editor.selection, content);
        });
        return success
            ? { ok: true, message: 'Selection replaced.' }
            : { ok: false, message: 'Replace failed.' };
    }
    /**
     * Create a new file in the workspace root or a given path.
     * Prompts the user for the filename if not provided.
     */
    async createNewFile(content, suggestedName) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root)
            return { ok: false, message: 'No workspace folder open.' };
        const fileName = suggestedName ?? (await vscode.window.showInputBox({
            prompt: 'New file name (relative to workspace root)',
            placeHolder: 'src/newFile.ts',
        }));
        if (!fileName)
            return { ok: false, message: 'Cancelled.' };
        const fullPath = path.join(root, fileName);
        const result = await this.writeFile(fullPath, content);
        if (result.ok) {
            const uri = vscode.Uri.file(fullPath);
            await vscode.window.showTextDocument(uri);
        }
        return result;
    }
    /**
     * Collect project context: key config files + open editor content.
     * Respects .eaiignore if present.
     */
    async gatherProjectContext() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const files = [];
        // Read context anchor files
        for (const name of CONTEXT_FILES) {
            const fullPath = path.join(root, name);
            const result = await this.readFile(fullPath);
            if (result.ok && result.content) {
                files.push({
                    relativePath: name,
                    // Truncate large files to avoid context bloat
                    content: result.content.slice(0, 2000),
                });
            }
        }
        // Add currently open file if not already included
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const relPath = vscode.workspace.asRelativePath(editor.document.uri);
            if (!files.find(f => f.relativePath === relPath)) {
                const content = editor.document.getText().slice(0, 4000);
                files.push({ relativePath: relPath, content });
            }
        }
        const fileList = files.map(f => f.relativePath).join(', ');
        const summary = `Workspace root: ${root}\nContext files: ${fileList}\nActive file: ${editor ? vscode.workspace.asRelativePath(editor.document.uri) : 'none'}`;
        return { rootPath: root, files, summary };
    }
    /** Get the selected text from the active editor, or empty string. */
    getSelectedText() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty)
            return '';
        return editor.document.getText(editor.selection);
    }
    /** Get the language ID of the active file. */
    getActiveLanguage() {
        return vscode.window.activeTextEditor?.document.languageId ?? 'plaintext';
    }
}
exports.FileSystemOps = FileSystemOps;
// ✅ END OF FileSystemOps.ts
//# sourceMappingURL=FileSystemOps.js.map