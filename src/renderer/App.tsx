import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TrafficView } from './components/traffic/TrafficView';
import { RulesView } from './components/rules/RulesView';
import { ClientView } from './components/client/ClientView';
import { SettingsView } from './components/settings/SettingsView';
import { useTrafficStore } from './stores/trafficStore';
import { useProxyStore } from './stores/proxyStore';
import type { TrafficEntry } from '../shared/types';

type View = 'traffic' | 'rules' | 'client' | 'settings';

declare global {
  interface Window {
    electronAPI: import('../preload/index').ElectronAPI;
  }
}

function App() {
  const [currentView, setCurrentView] = useState<View>('traffic');
  const addEntry = useTrafficStore((state) => state.addEntry);
  const updateEntry = useTrafficStore((state) => state.updateEntry);
  const setProxyStatus = useProxyStore((state) => state.setStatus);

  useEffect(() => {
    // Subscribe to traffic events
    const unsubNew = window.electronAPI.traffic.onNew((entry: TrafficEntry) => {
      addEntry(entry);
    });

    const unsubUpdate = window.electronAPI.traffic.onUpdate((entry: TrafficEntry) => {
      updateEntry(entry);
    });

    // Get initial proxy status
    window.electronAPI.proxy.getStatus().then(setProxyStatus);

    return () => {
      unsubNew();
      unsubUpdate();
    };
  }, [addEntry, updateEntry, setProxyStatus]);

  const renderView = () => {
    switch (currentView) {
      case 'traffic':
        return <TrafficView />;
      case 'rules':
        return <RulesView />;
      case 'client':
        return <ClientView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <TrafficView />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
