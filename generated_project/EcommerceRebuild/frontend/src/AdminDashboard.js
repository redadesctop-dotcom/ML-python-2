import React from 'react';
import { Box } from '@mui/material';

function AdminDashboard({ user }) {
  if (!user) return <div>Please login first.</div>;

  return (
    <Box>
      <h1>Admin Dashboard:</h1>
      <p>User ID: {user.id}</p>
      <p>Username: {user.username}</p>
    </Box>
  );
}

export default AdminDashboard;
