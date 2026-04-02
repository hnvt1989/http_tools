/**
 * Mock electronAPI for browser development (when not running in Electron).
 * Provides no-op implementations so the UI renders without crashing.
 */

import type { ProxyStatus, ProxyConfig, AppSettings, UpstreamProxy } from '../../shared/types';

type Unsubscribe = () => void;
const noop: Unsubscribe = () => {};
const noopAsync = (..._args: any[]): Promise<any> => Promise.resolve(undefined);

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

const defaultSettings: AppSettings = {
  proxy: defaultConfig,
  theme: 'light',
  fontSize: 13,
  maxTrafficEntries: 10000,
  autoTrustCertificate: false,
};

export const mockElectronAPI = {
  proxy: {
    start: (_port?: number): Promise<ProxyStatus> => Promise.resolve({ ...defaultStatus, running: true }),
    stop: noopAsync,
    getStatus: (): Promise<ProxyStatus> => Promise.resolve(defaultStatus),
    getConfig: (): Promise<ProxyConfig> => Promise.resolve(defaultConfig),
    setConfig: (config: Partial<ProxyConfig>): Promise<ProxyConfig> =>
      Promise.resolve({ ...defaultConfig, ...config }),
  },

  traffic: {
    onNew: (_cb: any): Unsubscribe => noop,
    onUpdate: (_cb: any): Unsubscribe => noop,
    getAll: (): Promise<any[]> => Promise.resolve([]),
    clear: noopAsync,
    export: noopAsync,
    import: noopAsync,
    exportHar: (): Promise<string> => Promise.resolve('{"log":{"entries":[]}}'),
    importHar: noopAsync,
  },

  rules: {
    list: (): Promise<any[]> => Promise.resolve([]),
    add: (rule: any): Promise<any> =>
      Promise.resolve({ ...rule, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }),
    update: (rule: any): Promise<any> => Promise.resolve({ ...rule, updatedAt: Date.now() }),
    delete: noopAsync,
    toggle: (id: string): Promise<any> => Promise.resolve({ id, enabled: true }),
    reorder: noopAsync,
    import: (): Promise<any[]> => Promise.resolve([]),
    export: (): Promise<string> => Promise.resolve('[]'),
  },

  certificates: {
    getCA: (): Promise<any> =>
      Promise.resolve({ cert: '', key: '', fingerprint: 'mock', createdAt: Date.now(), expiresAt: Date.now() + 365 * 86400000 }),
    exportCA: noopAsync,
    regenerateCA: (): Promise<any> =>
      Promise.resolve({ cert: '', key: '', fingerprint: 'mock-new', createdAt: Date.now(), expiresAt: Date.now() + 365 * 86400000 }),
    getTrustStatus: (): Promise<boolean> => Promise.resolve(false),
    isInstalled: (): Promise<boolean> => Promise.resolve(false),
    install: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    remove: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
  },

  client: {
    send: (_req: any): Promise<any> =>
      Promise.resolve({
        id: crypto.randomUUID(),
        statusCode: 0,
        statusMessage: 'Mock - run in Electron for real requests',
        headers: {},
        body: '',
        timing: { total: 0 },
        size: 0,
      }),
    cancel: noopAsync,
    resend: noopAsync,
  },

  savedRequests: {
    list: (): Promise<any[]> => Promise.resolve([]),
    save: (req: any): Promise<any> =>
      Promise.resolve({ ...req, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }),
    update: (req: any): Promise<any> => Promise.resolve(req),
    delete: noopAsync,
    folders: {
      list: (): Promise<any[]> => Promise.resolve([]),
      create: (folder: any): Promise<any> => Promise.resolve({ ...folder, id: crypto.randomUUID() }),
      update: (folder: any): Promise<any> => Promise.resolve(folder),
      delete: noopAsync,
    },
  },

  breakpoints: {
    onPaused: (_cb: any): Unsubscribe => noop,
    resume: noopAsync,
    drop: noopAsync,
    list: (): Promise<any[]> => Promise.resolve([]),
  },

  websocket: {
    onNew: (_cb: any): Unsubscribe => noop,
    onMessage: (_cb: any): Unsubscribe => noop,
    onClosed: (_cb: any): Unsubscribe => noop,
    onError: (_cb: any): Unsubscribe => noop,
  },

  terminal: {
    launch: (): Promise<any> => Promise.resolve({ launched: false, reason: 'Running in browser mode' }),
    onExited: (_cb: any): Unsubscribe => noop,
  },

  snippets: {
    generate: (_lang: any, _req: any): Promise<string> => Promise.resolve('# Run in Electron for snippet generation'),
  },

  performance: {
    analyze: (_entry: any): Promise<any> => Promise.resolve({ recommendations: [] }),
  },

  tlsPassthrough: {
    list: (): Promise<string[]> => Promise.resolve([]),
    add: (_domain: string): Promise<string[]> => Promise.resolve([]),
    remove: (_domain: string): Promise<string[]> => Promise.resolve([]),
  },

  upstreamProxy: {
    get: (): Promise<UpstreamProxy> =>
      Promise.resolve({ enabled: false, protocol: 'http' as const, host: '', port: 8080 }),
    set: (config: UpstreamProxy): Promise<UpstreamProxy> => Promise.resolve(config),
  },

  apiValidation: {
    addSpec: noopAsync,
    removeSpec: noopAsync,
    listSpecs: (): Promise<any[]> => Promise.resolve([]),
    validate: noopAsync,
  },

  settings: {
    get: (): Promise<AppSettings> => Promise.resolve(defaultSettings),
    set: (s: Partial<AppSettings>): Promise<AppSettings> => Promise.resolve({ ...defaultSettings, ...s }),
  },

  app: {
    getVersion: (): Promise<string> => Promise.resolve('1.0.0-dev'),
    quit: noopAsync,
    minimize: noopAsync,
    maximize: noopAsync,
    openExternal: noopAsync,
    showSaveDialog: (): Promise<any> => Promise.resolve({ canceled: true }),
    showOpenDialog: (): Promise<any> => Promise.resolve({ canceled: true, filePaths: [] }),
    launchBrowser: (): Promise<any> => Promise.resolve({ launched: false, reason: 'Running in browser mode' }),
    onBrowserExited: (_cb: any): Unsubscribe => noop,
    writeFile: noopAsync,
    readFile: (): Promise<string> => Promise.resolve(''),
  },
};
