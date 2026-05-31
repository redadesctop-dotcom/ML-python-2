import React from 'react';
import { Box } from '@mui/material';

function Payments({ user }) {
  if (!user) return <div>Please login first.</div>;

  return (
    <Box>
      <h1>Payments:</h1>
      <p>Payment method: {user.paymentMethod}</p>
      <p>Account balance: {user.balance}</p>
    </Box>
  );
}

export default Payments;
