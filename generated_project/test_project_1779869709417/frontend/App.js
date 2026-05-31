import React, { useState, useEffect } from 'react';

function App() {
  const [data, setData] = useState({ message: 'Loading...', status: 'Pending' });
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Database Design', status: 'Completed' },
    { id: 2, title: 'Auth Implementation', status: 'In Progress' }
  ]);

  useEffect(() => {
    fetch('http://localhost:8001/')
      .then(res => res.json())
      .then(json => setData(json))
      .catch(err => setData({ message: 'Backend Offline', status: 'Error' }));
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
      <header style={{ backgroundColor: '#2c3e50', color: 'white', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
        <h1>Evolutionary AI: Enterprise Dashboard</h1>
        <p>Backend Status: <strong>{data.status}</strong></p>
      </header>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>System Message</h3>
          <p style={{ fontSize: '1.2em', color: '#34495e' }}>{data.message}</p>
        </div>
        
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Agentic Task Progress</h3>
          <ul>
            {tasks.map(task => (
              <li key={task.id} style={{ marginBottom: '10px' }}>
                <strong>{task.title}</strong>: 
                <span style={{ color: task.status === 'Completed' ? 'green' : 'orange', marginLeft: '10px' }}>
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
