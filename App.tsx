import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import SidePanel from './SidePanel';
import { useHealthCheck } from './hooks/useHealthCheck';
import DiagnosticOverlay from './components/DiagnosticOverlay';
import ThreeDCanvas from '../e2e_test/frontend/ThreeDCanvas';
import './App.css';

const App: React.FC = () => {
    const { isHealthy, error } = useHealthCheck(8000);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        const unlisten = listen('sidecar_log', (event: any) => {
            const { message, stream } = event.payload;
            setLogs(prev => [...prev.slice(-100), `[${stream}] ${message}`]);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleRestart = () => {
        window.location.reload();
    };

    if (isHealthy === false) {
        return <DiagnosticOverlay error={error || "Unknown Error"} logs={logs} onRestart={handleRestart} />;
    }

    if (isHealthy === null) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1e1e', color: '#fff' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner"></div>
                    <p>Waking up AI Core...</p>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px' }}>
                        {logs.slice(-1).map(l => l)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container" style={{ overflow: 'hidden' }}>
            <div className="editor-main" style={{ flex: 1, position: 'relative' }}>
                <ThreeDCanvas />
                <div style={{ 
                    position: 'absolute', bottom: 0, width: '100%', 
                    height: '30%', backgroundColor: 'rgba(30, 30, 30, 0.8)',
                    zIndex: 10
                }}>
                    <textarea 
                        className="editor-textarea" 
                        placeholder="// Quantum Code Overlay..."
                        style={{ height: '100%', background: 'transparent' }}
                    />
                </div>
            </div>
            <SidePanel />
        </div>
    );
};

export default App;
