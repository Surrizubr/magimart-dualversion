import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LogService } from './services/LogService.ts';

// Global error handlers to capture crashes
window.onerror = (message, source, lineno, colno, error) => {
  LogService.error(`Unhandled Error: ${message}`, { source, lineno, colno, error });
};

window.onunhandledrejection = (event) => {
  LogService.error(`Unhandled Rejection: ${event.reason}`);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
