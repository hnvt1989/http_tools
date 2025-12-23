"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
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
    // HTTP Client
    CLIENT_SEND: 'client:send',
    CLIENT_CANCEL: 'client:cancel',
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
    // Settings
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    // App
    APP_VERSION: 'app:version',
    APP_QUIT: 'app:quit',
    APP_MINIMIZE: 'app:minimize',
    APP_MAXIMIZE: 'app:maximize',
    APP_OPEN_EXTERNAL: 'app:open-external',
    APP_SHOW_SAVE_DIALOG: 'app:show-save-dialog',
    APP_SHOW_OPEN_DIALOG: 'app:show-open-dialog',
};
