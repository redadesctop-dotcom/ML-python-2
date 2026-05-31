import React from 'react';
import { Box, Button } from '@mui/material';

function Cart({ cart, onRemoveFromCart }) {
  return (
    <Box>
      <h1>Cart:</h1>
      <ul>
        {cart.map((product) => (
          <li key={product.id}>
            {product.name} - ${product.price}
            <Button onClick={() => onRemoveFromCart(product)}>Remove</Button>
          </li>
        ))}
      </ul>
    </Box>
  );
}

export default Cart;
