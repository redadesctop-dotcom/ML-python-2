import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

const SidePanel: React.FC = () => {
    const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
    const [input, setInput] = useState('');
    const [ws, setWs] = useState<WebSocket | null>(null);

    useEffect(() => {
        const socket = new WebSocket('ws://127.0.0.1:8001/ws');
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setMessages(prev => [...prev, {role: 'assistant', content: JSON.stringify(data)}]);
        };
        setWs(socket);
        return () => socket.close();
    }, []);

    const sendMessage = () => {
        if (ws && input) {
            ws.send(JSON.stringify({type: 'chat', content: input}));
            setMessages(prev => [...prev, {role: 'user', content: input}]);
            setInput('');
        }
    };

    return (
        <div className="side-panel">
            <div className="messages">
                {messages.map((m, i) => (
                    <div key={i} className={`message ${m.role}`}>
                        <strong>{m.role}:</strong> {m.content}
                    </div>
                ))}
            </div>
            <div className="input-area">
                <input 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default SidePanel;
