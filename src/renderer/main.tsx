import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

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
