import * as vscode from 'vscode';

export interface FileChange {
  path: string;
  content: string;
  originalContent?: string;
}

/**
 * DiffManager: Generates, applies, and rejects multi-file diffs with rollback support.
 */
export class DiffManager {
  private pendingChanges: FileChange[] = [];
  private history: FileChange[][] = [];

  public async proposeChanges(changes: FileChange[]): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;

    for (const change of changes) {
      const uri = vscode.Uri.joinPath(root, change.path);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        change.originalContent = Buffer.from(bytes).toString('utf-8');
      } catch {
        change.originalContent = undefined; // New file
      }
    }
    this.pendingChanges = changes;
  }

  public async applyAll(): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;

    for (const change of this.pendingChanges) {
      const uri = vscode.Uri.joinPath(root, change.path);
      if (change.originalContent === undefined) {
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), change.content);
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);
        const fullRange = new vscode.Range(
          doc.lineAt(0).range.start,
          doc.lineAt(doc.lineCount - 1).range.end
        );
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

  public async undoLast(): Promise<void> {
    const lastChanges = this.history.pop();
    if (!lastChanges) {
      vscode.window.showWarningMessage('eAI: No history to undo.');
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;

    for (const change of lastChanges) {
      const uri = vscode.Uri.joinPath(root, change.path);
      if (change.originalContent === undefined) {
        edit.deleteFile(uri);
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);
        const fullRange = new vscode.Range(
          doc.lineAt(0).range.start,
          doc.lineAt(doc.lineCount - 1).range.end
        );
        edit.replace(uri, fullRange, change.originalContent);
      }
    }

    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage('eAI: Last change reverted.');
  }

  public clearPending() {
    this.pendingChanges = [];
  }

  public getPending() {
    return this.pendingChanges;
  }
}
// ✅ END OF DiffManager.ts
