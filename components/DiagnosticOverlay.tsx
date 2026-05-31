import React from 'react';

interface DiagnosticOverlayProps {
    error: string;
    logs: string[];
    onRestart: () => void;
}

const DiagnosticOverlay: React.FC<DiagnosticOverlayProps> = ({ error, logs, onRestart }) => {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(30, 30, 30, 0.95)', color: '#ff4b4b',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', zIndex: 9999, padding: '20px', textAlign: 'center'
        }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>⚠️ Sidecar Initialization Failed</h1>
            <p style={{ fontSize: '1.2rem', color: '#d4d4d4', marginBottom: '20px' }}>{error}</p>
            
            <div style={{
                width: '80%', height: '300px', backgroundColor: '#000', color: '#00ff00',
                fontFamily: 'Consolas, monospace', padding: '15px', overflowY: 'auto',
                textAlign: 'left', borderRadius: '5px', marginBottom: '20px', border: '1px solid #333'
            }}>
                <div style={{ color: '#aaa', borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '10px' }}>SYSTEM_LOGS</div>
                {logs.map((log, i) => <div key={i}>{log}</div>)}
            </div>

            <button 
                onClick={onRestart}
                style={{
                    padding: '12px 24px', backgroundColor: '#007acc', color: 'white',
                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem',
                    fontWeight: 'bold'
                }}
            >
                Fix & Restart App
            </button>
            
            <p style={{ marginTop: '20px', color: '#666', fontSize: '0.9rem' }}>
                If this persists, run <code>fix_and_launch.bat</code> from the project root.
            </p>
        </div>
    );
};

export default DiagnosticOverlay;
