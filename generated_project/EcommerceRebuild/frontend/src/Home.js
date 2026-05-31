import React from 'react';
import { Box, Button } from '@mui/material';

function Home({ user, onAddToCart }) {
  if (!user) return <div>Please login first.</div>;
  
  return (
    <Box>
      <h1>Welcome, {user.username}!</h1>
      <Button onClick={() => onAddToCart({ id: 1, name: 'Product 1', price: 10.99 })}>
        Add Product 1 to Cart
      </Button>
    </Box>
  );
}

export default Home;
