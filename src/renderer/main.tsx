import React from 'react';
import ReactDOM from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import App from './App';
import './styles/globals.css';

// Use locally installed monaco-editor instead of loading from CDN
loader.config({ monaco });

// Inject mock electronAPI when running outside Electron (e.g. browser dev)
if (!window.electronAPI) {
  import('./mocks/electronAPI').then(({ mockElectronAPI }) => {
    (window as any).electronAPI = mockElectronAPI;
    renderApp();
  });
} else {
  renderApp();
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
