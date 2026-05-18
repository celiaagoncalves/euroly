// React entry point. Wraps the app in BrowserRouter so every page has
// access to URL-based routing, mounts the Sonner Toaster once at the
// root so any component can call `toast(...)` without props drilling,
// and loads the Tailwind-generated CSS.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ duration: 5000 }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
