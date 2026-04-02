import { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TrafficView } from './components/traffic/TrafficView';
import { WebSocketView } from './components/traffic/WebSocketView';
import { RulesView } from './components/rules/RulesView';
import { ClientView } from './components/client/ClientView';
import { SettingsView } from './components/settings/SettingsView';
import { BreakpointPanel } from './components/traffic/BreakpointPanel';
import { useTrafficStore } from './stores/trafficStore';
import { useProxyStore } from './stores/proxyStore';
import type { TrafficEntry, BreakpointPause } from '../shared/types';

export type View = 'traffic' | 'websocket' | 'rules' | 'client' | 'settings';

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
  const [activeBreakpoints, setActiveBreakpoints] = useState<BreakpointPause[]>([]);

  useEffect(() => {
    // Subscribe to traffic events
    const unsubNew = window.electronAPI.traffic.onNew((entry: TrafficEntry) => {
      addEntry(entry);
    });

    const unsubUpdate = window.electronAPI.traffic.onUpdate((entry: TrafficEntry) => {
      updateEntry(entry);
    });

    // Subscribe to breakpoint events
    const unsubBreakpoint = window.electronAPI.breakpoints.onPaused((pause: BreakpointPause) => {
      setActiveBreakpoints((prev) => [...prev, pause]);
    });

    // Get initial proxy status
    window.electronAPI.proxy.getStatus().then(setProxyStatus);

    return () => {
      unsubNew();
      unsubUpdate();
      unsubBreakpoint();
    };
  }, [addEntry, updateEntry, setProxyStatus]);

  const handleBreakpointResume = async (id: string, modifiedData?: any) => {
    await window.electronAPI.breakpoints.resume(id, modifiedData);
    setActiveBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
  };

  const handleBreakpointDrop = async (id: string) => {
    await window.electronAPI.breakpoints.drop(id);
    setActiveBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
  };

  const renderView = () => {
    switch (currentView) {
      case 'traffic':
        return <TrafficView />;
      case 'websocket':
        return <WebSocketView />;
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

      {/* Breakpoint panels */}
      {activeBreakpoints.map((bp) => (
        <BreakpointPanel
          key={bp.id}
          pause={bp}
          onResume={handleBreakpointResume}
          onDrop={handleBreakpointDrop}
        />
      ))}
    </div>
  );
}

export default App;
