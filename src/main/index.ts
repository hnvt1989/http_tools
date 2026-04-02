import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { CAGenerator } from './certificates/ca-generator';
import { ChromeProfileSetup, cleanupProfile } from './certificates/chrome-profile-setup';
import { ProxyServer } from './proxy/proxy-server';
import { RuleEngine } from './rules/rule-engine';
import { HttpClient } from './client/http-client';
import { SettingsStore } from './storage/settings-store';
import { RulesStore } from './storage/rules-store';
import { SavedRequestsStore } from './storage/saved-requests-store';
import { exportToHarString, importFromHarString } from './export/har-converter';
import { generateSnippet } from './export/snippet-generator';
import { analyzePerformance } from './export/performance-analyzer';
import { WebSocketHandler } from './proxy/websocket-handler';
import { ApiValidator } from './export/api-validator';
import type { ProxyConfig, Rule, ClientRequest, SavedRequest, RequestFolder, SnippetLanguage, TrafficEntry, UpstreamProxy, WebSocketEntry, WebSocketMessage } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let caGenerator: CAGenerator;
let proxyServer: ProxyServer | null = null;
let ruleEngine: RuleEngine;
let httpClient: HttpClient;
let settingsStore: SettingsStore;
let rulesStore: RulesStore;
let savedRequestsStore: SavedRequestsStore;
let browserProcess: ChildProcess | null = null;
let currentBrowserProfileDir: string | null = null;
let webSocketHandler: WebSocketHandler;
let terminalProcess: ChildProcess | null = null;
let trafficEntries: TrafficEntry[] = [];
let apiValidator: ApiValidator;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  // Initialize stores
  settingsStore = new SettingsStore();
  rulesStore = new RulesStore();
  savedRequestsStore = new SavedRequestsStore();

  // Initialize CA generator
  caGenerator = new CAGenerator();
  await caGenerator.initialize();

  // Initialize rule engine
  ruleEngine = new RuleEngine();
  const savedRules = await rulesStore.list();
  ruleEngine.setRules(savedRules);

  // Initialize HTTP client
  httpClient = new HttpClient();

  // Initialize WebSocket handler
  webSocketHandler = new WebSocketHandler();
  apiValidator = new ApiValidator();
  webSocketHandler.on('websocket:new', (entry: WebSocketEntry) => {
    mainWindow?.webContents.send(IPC_CHANNELS.WEBSOCKET_NEW, entry);
  });
  webSocketHandler.on('websocket:message', (wsId: string, message: WebSocketMessage) => {
    mainWindow?.webContents.send(IPC_CHANNELS.WEBSOCKET_MESSAGE, wsId, message);
  });
  webSocketHandler.on('websocket:closed', (wsId: string, code?: number, reason?: string) => {
    mainWindow?.webContents.send(IPC_CHANNELS.WEBSOCKET_CLOSED, wsId, code, reason);
  });
  webSocketHandler.on('websocket:error', (wsId: string, error: string) => {
    mainWindow?.webContents.send(IPC_CHANNELS.WEBSOCKET_ERROR, wsId, error);
  });

  // Auto-start proxy if configured
  const settings = settingsStore.get();
  if (settings.proxy.autoStart) {
    await startProxyServer(settings.proxy.port);
  }
}

async function startProxyServer(port: number) {
  if (proxyServer) {
    await proxyServer.stop();
  }

  const ca = caGenerator.getCA();
  if (!ca) {
    throw new Error('CA certificate not initialized');
  }

  proxyServer = new ProxyServer({
    port,
    ca,
    ruleEngine,
  });

  // Forward traffic events to renderer
  proxyServer.on('traffic:new', (entry) => {
    trafficEntries.push(entry);
    if (trafficEntries.length > 50000) trafficEntries = trafficEntries.slice(-50000);
    mainWindow?.webContents.send(IPC_CHANNELS.TRAFFIC_NEW, entry);
  });

  proxyServer.on('traffic:update', (entry) => {
    const idx = trafficEntries.findIndex((e) => e.id === entry.id);
    if (idx !== -1) trafficEntries[idx] = entry;
    mainWindow?.webContents.send(IPC_CHANNELS.TRAFFIC_UPDATE, entry);
  });

  proxyServer.on('breakpoint:paused', (pause) => {
    mainWindow?.webContents.send(IPC_CHANNELS.BREAKPOINT_PAUSED, pause);
  });

  await proxyServer.start();
}

function setupIpcHandlers() {
  // Proxy handlers
  ipcMain.handle(IPC_CHANNELS.PROXY_START, async (_, port?: number) => {
    const config = settingsStore.get().proxy;
    await startProxyServer(port ?? config.port);
    return proxyServer?.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STOP, async () => {
    if (proxyServer) {
      await proxyServer.stop();
      proxyServer = null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STATUS, () => {
    return proxyServer?.getStatus() ?? {
      running: false,
      port: settingsStore.get().proxy.port,
      totalRequests: 0,
      activeConnections: 0,
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_CONFIG_GET, () => {
    return settingsStore.get().proxy;
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_CONFIG_SET, (_, config: Partial<ProxyConfig>) => {
    const settings = settingsStore.get();
    settings.proxy = { ...settings.proxy, ...config };
    settingsStore.set(settings);
    return settings.proxy;
  });

  // Rules handlers
  ipcMain.handle(IPC_CHANNELS.RULES_LIST, () => {
    return rulesStore.list();
  });

  ipcMain.handle(IPC_CHANNELS.RULES_ADD, async (_, rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRule = await rulesStore.add(rule);
    ruleEngine.setRules(await rulesStore.list());
    return newRule;
  });

  ipcMain.handle(IPC_CHANNELS.RULES_UPDATE, async (_, rule: Rule) => {
    const updatedRule = await rulesStore.update(rule);
    ruleEngine.setRules(await rulesStore.list());
    return updatedRule;
  });

  ipcMain.handle(IPC_CHANNELS.RULES_DELETE, async (_, id: string) => {
    await rulesStore.delete(id);
    ruleEngine.setRules(await rulesStore.list());
  });

  ipcMain.handle(IPC_CHANNELS.RULES_TOGGLE, async (_, id: string) => {
    const rule = await rulesStore.toggle(id);
    ruleEngine.setRules(await rulesStore.list());
    return rule;
  });

  ipcMain.handle(IPC_CHANNELS.RULES_REORDER, async (_, ids: string[]) => {
    await rulesStore.reorder(ids);
    ruleEngine.setRules(await rulesStore.list());
  });

  // Certificate handlers
  ipcMain.handle(IPC_CHANNELS.CERT_GET_CA, () => {
    return caGenerator.getCA();
  });

  ipcMain.handle(IPC_CHANNELS.CERT_EXPORT_CA, async (_, filePath: string) => {
    const ca = caGenerator.getCA();
    if (ca) {
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, ca.cert);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CERT_REGENERATE_CA, async () => {
    await caGenerator.regenerate();
    return caGenerator.getCA();
  });

  ipcMain.handle(IPC_CHANNELS.CERT_IS_INSTALLED, async () => {
    return caGenerator.isCAInstalledInKeychain();
  });

  ipcMain.handle(IPC_CHANNELS.CERT_INSTALL_CA, async () => {
    return caGenerator.installCAInKeychain();
  });

  ipcMain.handle(IPC_CHANNELS.CERT_REMOVE_CA, async () => {
    return caGenerator.removeCAFromKeychain();
  });

  // HTTP Client handlers
  ipcMain.handle(IPC_CHANNELS.CLIENT_SEND, async (_, request: ClientRequest) => {
    return httpClient.send(request);
  });

  ipcMain.handle(IPC_CHANNELS.CLIENT_CANCEL, async (_, id: string) => {
    httpClient.cancel(id);
  });

  // Saved Requests handlers
  ipcMain.handle(IPC_CHANNELS.REQUESTS_LIST, () => {
    return savedRequestsStore.listRequests();
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_SAVE, async (_, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) => {
    return savedRequestsStore.saveRequest(request);
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_UPDATE, async (_, request: SavedRequest) => {
    return savedRequestsStore.updateRequest(request);
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_DELETE, async (_, id: string) => {
    return savedRequestsStore.deleteRequest(id);
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_FOLDERS_LIST, () => {
    return savedRequestsStore.listFolders();
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_FOLDERS_CREATE, async (_, folder: Omit<RequestFolder, 'id'>) => {
    return savedRequestsStore.createFolder(folder);
  });

  // Breakpoint handlers
  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_RESUME, async (_, id: string, data?: any) => {
    proxyServer?.resumeBreakpoint(id, data);
  });

  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_DROP, async (_, id: string) => {
    proxyServer?.dropBreakpoint(id);
  });

  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, settings) => {
    return settingsStore.set(settings);
  });

  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.APP_MINIMIZE, () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.APP_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.APP_SHOW_SAVE_DIALOG, async (_, options) => {
    return dialog.showSaveDialog(mainWindow!, options);
  });

  ipcMain.handle(IPC_CHANNELS.APP_SHOW_OPEN_DIALOG, async (_, options) => {
    return dialog.showOpenDialog(mainWindow!, options);
  });

  ipcMain.handle(IPC_CHANNELS.APP_WRITE_FILE, async (_, filePath: string, content: string) => {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.APP_READ_FILE, async (_, filePath: string) => {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.APP_LAUNCH_BROWSER, async () => {
    // Return false if browser is already running
    if (browserProcess && !browserProcess.killed) {
      return { launched: false, reason: 'Browser already running' };
    }

    const port = proxyServer?.getStatus().port ?? settingsStore.get().proxy.port;

    // Set up Chrome profile with CA certificate trust
    const ca = caGenerator.getCA();
    if (!ca) {
      return { launched: false, reason: 'CA certificate not available' };
    }

    // Check if CA is installed in system keychain
    const caInstalled = await caGenerator.isCAInstalledInKeychain();
    console.log(`CA installed in system keychain: ${caInstalled}`);

    const profileSetup = new ChromeProfileSetup(ca);
    const setupResult = await profileSetup.setupProfile();
    currentBrowserProfileDir = setupResult.profileDir;

    console.log(`Chrome profile setup: method=${setupResult.method}, success=${setupResult.success}`);
    if (setupResult.error) {
      console.log(`Profile setup error: ${setupResult.error}`);
    }

    // Get launch arguments - use trusted mode if CA is installed in keychain
    const launchArgs = ChromeProfileSetup.getLaunchArgs(setupResult, port, caInstalled);

    const onExit = async () => {
      browserProcess = null;
      // Clean up profile directory
      if (currentBrowserProfileDir) {
        await cleanupProfile(currentBrowserProfileDir);
        currentBrowserProfileDir = null;
      }
      mainWindow?.webContents.send(IPC_CHANNELS.APP_BROWSER_EXITED);
    };

    // Detect OS and launch appropriate browser
    if (process.platform === 'darwin') {
      // macOS - Launch Chrome
      browserProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', launchArgs, { stdio: 'ignore' });
      browserProcess.on('exit', onExit);
    } else if (process.platform === 'win32') {
      // Windows - Launch Chrome
      browserProcess = spawn('cmd.exe', ['/c', 'start', '/wait', 'chrome', ...launchArgs], { stdio: 'ignore' });
      browserProcess.on('exit', onExit);
    } else {
      // Linux - Launch Chrome/Chromium
      const browsers = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
      for (const browser of browsers) {
        try {
          browserProcess = spawn(browser, launchArgs, { stdio: 'ignore' });
          browserProcess.on('exit', onExit);
          break;
        } catch {
          continue;
        }
      }
    }

    return {
      launched: true,
      port,
      profileDir: setupResult.profileDir,
      setupMethod: setupResult.method,
      setupSuccess: setupResult.success,
    };
  });

  // Traffic export/import
  ipcMain.handle(IPC_CHANNELS.TRAFFIC_GET_ALL, () => trafficEntries);

  ipcMain.handle(IPC_CHANNELS.TRAFFIC_EXPORT_HAR, () => {
    return exportToHarString(trafficEntries);
  });

  ipcMain.handle(IPC_CHANNELS.TRAFFIC_IMPORT_HAR, async (_, data: string) => {
    const entries = importFromHarString(data);
    for (const entry of entries) {
      trafficEntries.push(entry);
      mainWindow?.webContents.send(IPC_CHANNELS.TRAFFIC_NEW, entry);
    }
    return entries.length;
  });

  // Clear traffic entries
  ipcMain.handle(IPC_CHANNELS.TRAFFIC_CLEAR, () => {
    trafficEntries = [];
  });

  // Code snippets
  ipcMain.handle(IPC_CHANNELS.SNIPPET_GENERATE, (_, language: SnippetLanguage, request: any) => {
    return generateSnippet(language, request);
  });

  // Performance analysis
  ipcMain.handle(IPC_CHANNELS.PERFORMANCE_ANALYZE, (_, entry: TrafficEntry) => {
    return analyzePerformance(entry);
  });

  // Terminal interception
  ipcMain.handle(IPC_CHANNELS.TERMINAL_LAUNCH, async () => {
    if (terminalProcess && !terminalProcess.killed) {
      return { launched: false, reason: 'Terminal already running' };
    }

    const port = proxyServer?.getStatus().port ?? settingsStore.get().proxy.port;

    const env = {
      ...process.env,
      HTTP_PROXY: `http://localhost:${port}`,
      HTTPS_PROXY: `http://localhost:${port}`,
      http_proxy: `http://localhost:${port}`,
      https_proxy: `http://localhost:${port}`,
      NO_PROXY: 'localhost,127.0.0.1',
      no_proxy: 'localhost,127.0.0.1',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      REQUESTS_CA_BUNDLE: '',
      SSL_CERT_FILE: '',
    };

    const onExit = () => {
      terminalProcess = null;
      mainWindow?.webContents.send(IPC_CHANNELS.TERMINAL_EXITED);
    };

    if (process.platform === 'darwin') {
      // macOS - use osascript to open Terminal.app with env vars
      const envStr = Object.entries(env)
        .filter(([k]) => k.startsWith('HTTP_PROXY') || k.startsWith('HTTPS_PROXY') || k.startsWith('http_proxy') || k.startsWith('https_proxy') || k === 'NO_PROXY' || k === 'no_proxy' || k === 'NODE_TLS_REJECT_UNAUTHORIZED')
        .map(([k, v]) => `export ${k}='${v}'`)
        .join('; ');
      terminalProcess = spawn('osascript', ['-e', `tell application "Terminal" to do script "${envStr}; echo 'HTTP Tools proxy configured on port ${port}'"`, '-e', 'tell application "Terminal" to activate'], { stdio: 'ignore' });
      terminalProcess.on('exit', onExit);
    } else if (process.platform === 'win32') {
      terminalProcess = spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { env, stdio: 'ignore' });
      terminalProcess.on('exit', onExit);
    } else {
      // Linux - try various terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm', 'x-terminal-emulator'];
      for (const term of terminals) {
        try {
          if (term === 'gnome-terminal') {
            terminalProcess = spawn(term, ['--'], { env, stdio: 'ignore' });
          } else {
            terminalProcess = spawn(term, [], { env, stdio: 'ignore' });
          }
          terminalProcess.on('exit', onExit);
          terminalProcess.on('error', () => { terminalProcess = null; });
          break;
        } catch {
          continue;
        }
      }
    }

    return {
      launched: true,
      port,
      envVars: {
        HTTP_PROXY: env.HTTP_PROXY,
        HTTPS_PROXY: env.HTTPS_PROXY,
      },
    };
  });

  // Breakpoint list
  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_LIST, () => {
    return [];
  });

  // TLS Passthrough
  ipcMain.handle(IPC_CHANNELS.TLS_PASSTHROUGH_LIST, () => {
    return settingsStore.get().tlsPassthroughDomains || [];
  });

  ipcMain.handle(IPC_CHANNELS.TLS_PASSTHROUGH_ADD, (_, domain: string) => {
    const settings = settingsStore.get();
    const domains = settings.tlsPassthroughDomains || [];
    if (!domains.includes(domain)) {
      domains.push(domain);
      settings.tlsPassthroughDomains = domains;
      settingsStore.set(settings);
    }
    return domains;
  });

  ipcMain.handle(IPC_CHANNELS.TLS_PASSTHROUGH_REMOVE, (_, domain: string) => {
    const settings = settingsStore.get();
    const domains = (settings.tlsPassthroughDomains || []).filter((d: string) => d !== domain);
    settings.tlsPassthroughDomains = domains;
    settingsStore.set(settings);
    return domains;
  });

  // Upstream Proxy
  ipcMain.handle(IPC_CHANNELS.UPSTREAM_PROXY_GET, () => {
    return settingsStore.get().upstreamProxy || { enabled: false, protocol: 'http', host: '', port: 0 };
  });

  ipcMain.handle(IPC_CHANNELS.UPSTREAM_PROXY_SET, (_, config: UpstreamProxy) => {
    const settings = settingsStore.get();
    settings.upstreamProxy = config;
    settingsStore.set(settings);
    return config;
  });

  // Resend request from traffic
  ipcMain.handle(IPC_CHANNELS.CLIENT_RESEND, async (_, request: any) => {
    return httpClient.send(request);
  });

  // API Validation
  ipcMain.handle(IPC_CHANNELS.API_SPEC_ADD, (_, id: string, specJson: string) => {
    const spec = JSON.parse(specJson);
    apiValidator.addSpec(id, spec);
  });

  ipcMain.handle(IPC_CHANNELS.API_SPEC_REMOVE, (_, id: string) => {
    apiValidator.removeSpec(id);
  });

  ipcMain.handle(IPC_CHANNELS.API_SPEC_LIST, () => {
    return apiValidator.listSpecs();
  });

  ipcMain.handle(IPC_CHANNELS.API_VALIDATE, (_, request: any, response?: any) => {
    return apiValidator.validate(request, response);
  });
}

app.whenReady().then(async () => {
  await initializeServices();
  setupIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (proxyServer) {
    await proxyServer.stop();
  }
});
