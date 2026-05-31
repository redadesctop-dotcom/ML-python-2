import * as vscode from 'vscode';
import * as path from 'path';

export interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
}

export interface WorkspaceContext {
  fileTree: string;
  symbols: Record<string, SymbolInfo[]>;
  activeFile?: {
    path: string;
    content: string;
  };
}

/**
 * WorkspaceIndexer: Auto-scans project, builds context map, and extracts symbols.
 */
export class WorkspaceIndexer {
  private ignorePatterns: string[] = [];

  constructor() {
    this.updateIgnorePatterns();
  }

  private async updateIgnorePatterns() {
    this.ignorePatterns = ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**'];
    const roots = vscode.workspace.workspaceFolders;
    if (!roots) return;

    for (const root of roots) {
      const gitignore = vscode.Uri.joinPath(root.uri, '.gitignore');
      try {
        const bytes = await vscode.workspace.fs.readFile(gitignore);
        const content = Buffer.from(bytes).toString('utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        this.ignorePatterns.push(...lines.map(l => `**/${l.trim()}/**`));
      } catch { /* ignore */ }
    }
  }

  public async getFullContext(): Promise<WorkspaceContext> {
    await this.updateIgnorePatterns();
    const roots = vscode.workspace.workspaceFolders;
    if (!roots) return { fileTree: '', symbols: {} };

    const exclude = `{${this.ignorePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*', exclude, 200);
    
    const fileTree = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
    const symbols: Record<string, SymbolInfo[]> = {};

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

  public async getSymbolsForFile(uri: vscode.Uri): Promise<SymbolInfo[]> {
    try {
      const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );
      if (!docSymbols) return [];
      
      return docSymbols.map(s => ({
        name: s.name,
        kind: vscode.SymbolKind[s.kind],
        line: s.range.start.line
      }));
    } catch {
      return [];
    }
  }
}
// ✅ END OF WorkspaceIndexer.ts
