import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  ProxyConfig,
  ProxyStatus,
  TrafficEntry,
  Rule,
  ClientRequest,
  ClientResponse,
  SavedRequest,
  RequestFolder,
  CACertificate,
  AppSettings,
  BreakpointPause,
  SnippetLanguage,
  PerformanceAnalysis,
  WebSocketEntry,
  WebSocketMessage,
  UpstreamProxy,
} from '../shared/types';

type Callback<T> = (data: T) => void;
type Unsubscribe = () => void;

const electronAPI = {
  // Proxy Control
  proxy: {
    start: (port?: number): Promise<ProxyStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_START, port),
    stop: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_STOP),
    getStatus: (): Promise<ProxyStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_STATUS),
    getConfig: (): Promise<ProxyConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_CONFIG_GET),
    setConfig: (config: Partial<ProxyConfig>): Promise<ProxyConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_CONFIG_SET, config),
  },

  // Traffic
  traffic: {
    onNew: (callback: Callback<TrafficEntry>): Unsubscribe => {
      const handler = (_: IpcRendererEvent, data: TrafficEntry) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.TRAFFIC_NEW, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRAFFIC_NEW, handler);
    },
    onUpdate: (callback: Callback<TrafficEntry>): Unsubscribe => {
      const handler = (_: IpcRendererEvent, data: TrafficEntry) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.TRAFFIC_UPDATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRAFFIC_UPDATE, handler);
    },
    getAll: (): Promise<TrafficEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_GET_ALL),
    clear: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_CLEAR),
    export: (format: 'har' | 'json'): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_EXPORT, format),
    import: (data: string, format: 'har' | 'json'): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_IMPORT, data, format),
    exportHar: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_EXPORT_HAR),
    importHar: (data: string): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRAFFIC_IMPORT_HAR, data),
  },

  // Rules
  rules: {
    list: (): Promise<Rule[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_LIST),
    add: (rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>): Promise<Rule> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_ADD, rule),
    update: (rule: Rule): Promise<Rule> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_UPDATE, rule),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_DELETE, id),
    toggle: (id: string): Promise<Rule> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_TOGGLE, id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_REORDER, ids),
    import: (data: string): Promise<Rule[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_IMPORT, data),
    export: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.RULES_EXPORT),
  },

  // Certificates
  certificates: {
    getCA: (): Promise<CACertificate> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_GET_CA),
    exportCA: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_EXPORT_CA, path),
    regenerateCA: (): Promise<CACertificate> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_REGENERATE_CA),
    getTrustStatus: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_TRUST_STATUS),
    isInstalled: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_IS_INSTALLED),
    install: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_INSTALL_CA),
    remove: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_REMOVE_CA),
  },

  // HTTP Client
  client: {
    send: (request: ClientRequest): Promise<ClientResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENT_SEND, request),
    cancel: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENT_CANCEL, id),
    resend: (request: any): Promise<ClientResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENT_RESEND, request),
  },

  // Saved Requests
  savedRequests: {
    list: (): Promise<SavedRequest[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_LIST),
    save: (request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedRequest> =>
      ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_SAVE, request),
    update: (request: SavedRequest): Promise<SavedRequest> =>
      ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_UPDATE, request),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_DELETE, id),
    folders: {
      list: (): Promise<RequestFolder[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_FOLDERS_LIST),
      create: (folder: Omit<RequestFolder, 'id'>): Promise<RequestFolder> =>
        ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_FOLDERS_CREATE, folder),
      update: (folder: RequestFolder): Promise<RequestFolder> =>
        ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_FOLDERS_UPDATE, folder),
      delete: (id: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.REQUESTS_FOLDERS_DELETE, id),
    },
  },

  // Breakpoints
  breakpoints: {
    onPaused: (callback: Callback<BreakpointPause>): Unsubscribe => {
      const handler = (_: IpcRendererEvent, data: BreakpointPause) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.BREAKPOINT_PAUSED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BREAKPOINT_PAUSED, handler);
    },
    resume: (id: string, data?: any): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BREAKPOINT_RESUME, id, data),
    drop: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BREAKPOINT_DROP, id),
    list: (): Promise<BreakpointPause[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.BREAKPOINT_LIST),
  },

  // WebSocket
  websocket: {
    onNew: (callback: Callback<WebSocketEntry>): Unsubscribe => {
      const handler = (_: IpcRendererEvent, data: WebSocketEntry) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.WEBSOCKET_NEW, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WEBSOCKET_NEW, handler);
    },
    onMessage: (callback: (wsId: string, message: WebSocketMessage) => void): Unsubscribe => {
      const handler = (_: IpcRendererEvent, wsId: string, message: WebSocketMessage) => callback(wsId, message);
      ipcRenderer.on(IPC_CHANNELS.WEBSOCKET_MESSAGE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WEBSOCKET_MESSAGE, handler);
    },
    onClosed: (callback: (wsId: string, code?: number, reason?: string) => void): Unsubscribe => {
      const handler = (_: IpcRendererEvent, wsId: string, code?: number, reason?: string) => callback(wsId, code, reason);
      ipcRenderer.on(IPC_CHANNELS.WEBSOCKET_CLOSED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WEBSOCKET_CLOSED, handler);
    },
    onError: (callback: (wsId: string, error: string) => void): Unsubscribe => {
      const handler = (_: IpcRendererEvent, wsId: string, error: string) => callback(wsId, error);
      ipcRenderer.on(IPC_CHANNELS.WEBSOCKET_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WEBSOCKET_ERROR, handler);
    },
  },

  // Terminal
  terminal: {
    launch: (): Promise<{ launched: boolean; port?: number; envVars?: Record<string, string>; reason?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_LAUNCH),
    onExited: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXITED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXITED, handler);
    },
  },

  // Snippets
  snippets: {
    generate: (language: SnippetLanguage, request: any): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.SNIPPET_GENERATE, language, request),
  },

  // Performance
  performance: {
    analyze: (entry: TrafficEntry): Promise<PerformanceAnalysis> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERFORMANCE_ANALYZE, entry),
  },

  // TLS Passthrough
  tlsPassthrough: {
    list: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TLS_PASSTHROUGH_LIST),
    add: (domain: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TLS_PASSTHROUGH_ADD, domain),
    remove: (domain: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TLS_PASSTHROUGH_REMOVE, domain),
  },

  // Upstream Proxy
  upstreamProxy: {
    get: (): Promise<UpstreamProxy> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPSTREAM_PROXY_GET),
    set: (config: UpstreamProxy): Promise<UpstreamProxy> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPSTREAM_PROXY_SET, config),
  },

  // API Validation
  apiValidation: {
    addSpec: (id: string, specJson: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_SPEC_ADD, id, specJson),
    removeSpec: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_SPEC_REMOVE, id),
    listSpecs: (): Promise<{ id: string; title: string; version: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_SPEC_LIST),
    validate: (request: any, response?: any): Promise<any> =>
      ipcRenderer.invoke(IPC_CHANNELS.API_VALIDATE, request, response),
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (settings: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  },

  // App
  app: {
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
    quit: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
    minimize: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_MINIMIZE),
    maximize: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_MAXIMIZE),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
    showSaveDialog: (options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SHOW_SAVE_DIALOG, options),
    showOpenDialog: (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SHOW_OPEN_DIALOG, options),
    launchBrowser: (): Promise<{ launched: boolean; port?: number; profileDir?: string; reason?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_LAUNCH_BROWSER),
    onBrowserExited: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.APP_BROWSER_EXITED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_BROWSER_EXITED, handler);
    },
    writeFile: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_WRITE_FILE, filePath, content),
    readFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_READ_FILE, filePath),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
