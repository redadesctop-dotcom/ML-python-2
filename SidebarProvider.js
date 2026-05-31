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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const utils_1 = require("./utils");
class SidebarProvider {
    _extensionUri;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "onInfo": {
                    if (!data.value)
                        return;
                    vscode.window.showInformationMessage(data.value);
                    break;
                }
                case "onError": {
                    if (!data.value)
                        return;
                    vscode.window.showErrorMessage(data.value);
                    break;
                }
                case "refresh": {
                    this._updateMetrics(webviewView.webview);
                    break;
                }
            }
        });
        // Initial refresh
        this._updateMetrics(webviewView.webview);
        // Auto-refresh every 10 seconds
        const interval = setInterval(() => {
            if (webviewView.visible) {
                this._updateMetrics(webviewView.webview);
            }
        }, 10000);
        webviewView.onDidDispose(() => clearInterval(interval));
    }
    async _updateMetrics(webview) {
        const backendUrl = vscode.workspace.getConfiguration('eai').get('backendUrl', 'http://localhost:8000');
        try {
            const response = await fetch(`${backendUrl}/health`);
            const data = await response.json();
            webview.postMessage({ type: 'metrics', data });
        }
        catch (e) {
            webview.postMessage({ type: 'metrics', data: { status: 'offline' } });
        }
    }
    _getHtmlForWebview(_webview) {
        const nonce = (0, utils_1.getNonce)();
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
                    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                    .metric-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); padding: 8px; border-radius: 4px; text-align: center; }
                    .metric-label { font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase; }
                    .metric-value { font-size: 16px; font-weight: bold; margin-top: 4px; }
                    .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
                    .status-ok { background: #4caf50; }
                    .status-degraded { background: #ff9800; }
                    .status-offline { background: #f44336; }
                    button { width: 100%; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px; cursor: pointer; border-radius: 2px; margin-top: 10px; }
                    .activity-feed { font-size: 11px; border-top: 1px solid var(--vscode-panel-border); margin-top: 20px; padding-top: 10px; }
                    .activity-item { margin-bottom: 5px; color: var(--vscode-descriptionForeground); }
                </style>
            </head>
            <body>
                <h3>eAI Dashboard</h3>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-label">Status</div>
                        <div class="metric-value" id="status-text">--</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Ollama</div>
                        <div class="metric-value" id="ollama-status">--</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">VRAM %</div>
                        <div class="metric-value" id="vram-val">--</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">RAM %</div>
                        <div class="metric-value" id="ram-val">--</div>
                    </div>
                </div>
                <div class="metric-card" style="grid-column: span 2;">
                    <div class="metric-label">Agents (Active/Dead)</div>
                    <div class="metric-value" id="agent-counts">0 / 0</div>
                </div>
                <button onclick="refresh()">Refresh Metrics</button>
                <div class="activity-feed">
                    <div class="metric-label">Recent Activity</div>
                    <div id="activity-log">
                        <div class="activity-item">Waiting for backend...</div>
                    </div>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({ type: 'refresh' });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'metrics') {
                            const data = message.data;
                            document.getElementById('status-text').innerText = data.status || 'OFFLINE';
                            document.getElementById('ollama-status').innerText = data.ollama ? 'ONLINE' : 'OFFLINE';
                            document.getElementById('vram-val').innerText = data.vram !== undefined ? data.vram + '%' : '--';
                            document.getElementById('ram-val').innerText = data.ram !== undefined ? data.ram + '%' : '--';
                            if (data.agents) {
                                document.getElementById('agent-counts').innerText = data.agents.spawned + ' / ' + data.agents.condemned;
                            }
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=SidebarProvider.js.map