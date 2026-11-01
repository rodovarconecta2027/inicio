import {GlobalLoading} from './components/GlobalLoading';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.debug('Service Worker registration info:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<><GlobalLoading /><App /></>);

import './typography.css';
