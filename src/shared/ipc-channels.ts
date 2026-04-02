export const IPC_CHANNELS = {
  // Proxy Control
  PROXY_START: 'proxy:start',
  PROXY_STOP: 'proxy:stop',
  PROXY_STATUS: 'proxy:status',
  PROXY_CONFIG_GET: 'proxy:config:get',
  PROXY_CONFIG_SET: 'proxy:config:set',

  // Traffic Events
  TRAFFIC_NEW: 'traffic:new',
  TRAFFIC_UPDATE: 'traffic:update',
  TRAFFIC_CLEAR: 'traffic:clear',
  TRAFFIC_EXPORT: 'traffic:export',
  TRAFFIC_IMPORT: 'traffic:import',
  TRAFFIC_EXPORT_HAR: 'traffic:export:har',
  TRAFFIC_IMPORT_HAR: 'traffic:import:har',
  TRAFFIC_GET_ALL: 'traffic:get-all',

  // Rules Management
  RULES_LIST: 'rules:list',
  RULES_ADD: 'rules:add',
  RULES_UPDATE: 'rules:update',
  RULES_DELETE: 'rules:delete',
  RULES_TOGGLE: 'rules:toggle',
  RULES_REORDER: 'rules:reorder',
  RULES_IMPORT: 'rules:import',
  RULES_EXPORT: 'rules:export',

  // Certificate Management
  CERT_GET_CA: 'cert:get-ca',
  CERT_EXPORT_CA: 'cert:export-ca',
  CERT_REGENERATE_CA: 'cert:regenerate-ca',
  CERT_TRUST_STATUS: 'cert:trust-status',
  CERT_INSTALL_CA: 'cert:install-ca',
  CERT_REMOVE_CA: 'cert:remove-ca',
  CERT_IS_INSTALLED: 'cert:is-installed',

  // HTTP Client
  CLIENT_SEND: 'client:send',
  CLIENT_CANCEL: 'client:cancel',
  CLIENT_RESEND: 'client:resend',

  // Saved Requests
  REQUESTS_LIST: 'requests:list',
  REQUESTS_SAVE: 'requests:save',
  REQUESTS_UPDATE: 'requests:update',
  REQUESTS_DELETE: 'requests:delete',
  REQUESTS_FOLDERS_LIST: 'requests:folders:list',
  REQUESTS_FOLDERS_CREATE: 'requests:folders:create',
  REQUESTS_FOLDERS_UPDATE: 'requests:folders:update',
  REQUESTS_FOLDERS_DELETE: 'requests:folders:delete',

  // Breakpoints
  BREAKPOINT_PAUSED: 'breakpoint:paused',
  BREAKPOINT_RESUME: 'breakpoint:resume',
  BREAKPOINT_DROP: 'breakpoint:drop',
  BREAKPOINT_EDIT: 'breakpoint:edit',
  BREAKPOINT_LIST: 'breakpoint:list',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // WebSocket
  WEBSOCKET_NEW: 'websocket:new',
  WEBSOCKET_MESSAGE: 'websocket:message',
  WEBSOCKET_CLOSED: 'websocket:closed',
  WEBSOCKET_ERROR: 'websocket:error',

  // Terminal Interception
  TERMINAL_LAUNCH: 'terminal:launch',
  TERMINAL_EXITED: 'terminal:exited',

  // Code Snippets
  SNIPPET_GENERATE: 'snippet:generate',

  // Performance Analysis
  PERFORMANCE_ANALYZE: 'performance:analyze',

  // TLS Passthrough
  TLS_PASSTHROUGH_LIST: 'tls:passthrough:list',
  TLS_PASSTHROUGH_ADD: 'tls:passthrough:add',
  TLS_PASSTHROUGH_REMOVE: 'tls:passthrough:remove',

  // Upstream Proxy
  UPSTREAM_PROXY_GET: 'upstream:proxy:get',
  UPSTREAM_PROXY_SET: 'upstream:proxy:set',

  // API Validation
  API_SPEC_ADD: 'api:spec:add',
  API_SPEC_REMOVE: 'api:spec:remove',
  API_SPEC_LIST: 'api:spec:list',
  API_VALIDATE: 'api:validate',

  // App
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_OPEN_EXTERNAL: 'app:open-external',
  APP_SHOW_SAVE_DIALOG: 'app:show-save-dialog',
  APP_SHOW_OPEN_DIALOG: 'app:show-open-dialog',
  APP_LAUNCH_BROWSER: 'app:launch-browser',
  APP_BROWSER_EXITED: 'app:browser-exited',
  APP_WRITE_FILE: 'app:write-file',
  APP_READ_FILE: 'app:read-file',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
