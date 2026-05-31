import React, { useState, useEffect } from 'react';

function App() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch('http://localhost:8005/items')
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(err => console.error("API Error:", err));
  }, []);

  return (
    <div style={{ padding: '2rem', background: '#f0f4f8', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ background: '#102a43', color: 'white', padding: '1.5rem', borderRadius: '8px' }}>
        <h1>Native Agentic Dashboard</h1>
      </header>
      <main style={{ marginTop: '2rem' }}>
        <h2>System Insights</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {items.map(item => (
            <div key={item.id} style={{ background: 'white', padding: '1rem', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <strong>{item.name}</strong>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;