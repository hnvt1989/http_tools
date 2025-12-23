import { create } from 'zustand';
import type { ProxyStatus, ProxyConfig } from '../../shared/types';

interface ProxyState {
  status: ProxyStatus;
  config: ProxyConfig;
  isStarting: boolean;
  isStopping: boolean;
  error: string | null;

  // Actions
  setStatus: (status: ProxyStatus) => void;
  setConfig: (config: ProxyConfig) => void;
  setError: (error: string | null) => void;
  start: (port?: number) => Promise<void>;
  stop: () => Promise<void>;
  updateConfig: (config: Partial<ProxyConfig>) => Promise<void>;
}

const defaultStatus: ProxyStatus = {
  running: false,
  port: 8080,
  totalRequests: 0,
  activeConnections: 0,
};

const defaultConfig: ProxyConfig = {
  port: 8080,
  enableHttps: true,
  autoStart: false,
};

export const useProxyStore = create<ProxyState>((set, get) => ({
  status: defaultStatus,
  config: defaultConfig,
  isStarting: false,
  isStopping: false,
  error: null,

  setStatus: (status) => set({ status, error: null }),

  setConfig: (config) => set({ config }),

  setError: (error) => set({ error }),

  start: async (port) => {
    set({ isStarting: true, error: null });
    try {
      const status = await window.electronAPI.proxy.start(port);
      set({ status, isStarting: false });
    } catch (err: any) {
      set({
        isStarting: false,
        error: err.message || 'Failed to start proxy',
      });
      throw err;
    }
  },

  stop: async () => {
    set({ isStopping: true, error: null });
    try {
      await window.electronAPI.proxy.stop();
      const status = await window.electronAPI.proxy.getStatus();
      set({ status, isStopping: false });
    } catch (err: any) {
      set({
        isStopping: false,
        error: err.message || 'Failed to stop proxy',
      });
      throw err;
    }
  },

  updateConfig: async (configUpdate) => {
    try {
      const newConfig = await window.electronAPI.proxy.setConfig(configUpdate);
      set({ config: newConfig });
    } catch (err: any) {
      set({ error: err.message || 'Failed to update config' });
      throw err;
    }
  },
}));
