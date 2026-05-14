import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OtterfulHub from './OtterfulHub';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OtterfulHub />
  </StrictMode>
);
