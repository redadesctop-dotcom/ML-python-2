import React, { useState } from 'react';
import { Box, TextField, Button } from '@mui/material';
import axios from 'axios';

function Auth({ onLogin, onLogout }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    axios.post('/api/login', {
      username,
      password,
    })
    .then(response => onLogin(response.data.token))
    .catch(error => console.error(error));
  };

  const handleLogout = (e) => {
    e.preventDefault();
    onLogout();
  };

  return (
    <Box>
      <form onSubmit={handleLogin}>
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit">Login</Button>
      </form>
      <Button onClick={handleLogout}>Logout</Button>
    </Box>
  );
}

export default Auth;
