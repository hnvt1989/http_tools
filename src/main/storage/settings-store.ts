import Store from 'electron-store';
import type { AppSettings, ProxyConfig } from '../../shared/types';

const defaultProxyConfig: ProxyConfig = {
  port: 8080,
  enableHttps: true,
  autoStart: false,
};

const defaultSettings: AppSettings = {
  proxy: defaultProxyConfig,
  theme: 'system',
  fontSize: 13,
  maxTrafficEntries: 10000,
  autoTrustCertificate: false,
};

export class SettingsStore {
  private store: Store<AppSettings>;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: defaultSettings,
    });
  }

  get(): AppSettings {
    return {
      proxy: this.store.get('proxy', defaultProxyConfig),
      theme: this.store.get('theme', 'system'),
      fontSize: this.store.get('fontSize', 13),
      maxTrafficEntries: this.store.get('maxTrafficEntries', 10000),
      autoTrustCertificate: this.store.get('autoTrustCertificate', false),
    };
  }

  set(settings: Partial<AppSettings>): AppSettings {
    if (settings.proxy) {
      this.store.set('proxy', { ...this.get().proxy, ...settings.proxy });
    }
    if (settings.theme !== undefined) {
      this.store.set('theme', settings.theme);
    }
    if (settings.fontSize !== undefined) {
      this.store.set('fontSize', settings.fontSize);
    }
    if (settings.maxTrafficEntries !== undefined) {
      this.store.set('maxTrafficEntries', settings.maxTrafficEntries);
    }
    if (settings.autoTrustCertificate !== undefined) {
      this.store.set('autoTrustCertificate', settings.autoTrustCertificate);
    }
    return this.get();
  }

  reset(): AppSettings {
    this.store.clear();
    return this.get();
  }
}
