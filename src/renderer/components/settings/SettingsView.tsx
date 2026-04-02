import React, { useEffect, useState } from 'react';
import { useProxyStore } from '../../stores/proxyStore';
import type { AppSettings, CACertificate, UpstreamProxy } from '../../../shared/types';

export const SettingsView: React.FC = () => {
  const { config, updateConfig } = useProxyStore();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ca, setCA] = useState<CACertificate | null>(null);
  const [port, setPort] = useState(config.port);
  const [isSaving, setIsSaving] = useState(false);
  const [caInstalled, setCaInstalled] = useState(false);
  const [isInstallingCA, setIsInstallingCA] = useState(false);

  // TLS Passthrough state
  const [tlsDomains, setTlsDomains] = useState<string[]>([]);
  const [newTlsDomain, setNewTlsDomain] = useState('');

  // Upstream Proxy state
  const [upstreamProxy, setUpstreamProxy] = useState<UpstreamProxy>({
    enabled: false,
    protocol: 'http',
    host: '',
    port: 8080,
  });
  const [upstreamAuth, setUpstreamAuth] = useState({ username: '', password: '' });
  const [isSavingUpstream, setIsSavingUpstream] = useState(false);

  useEffect(() => {
    // Load settings
    window.electronAPI.settings.get().then(setSettings);
    window.electronAPI.certificates.getCA().then(setCA);
    window.electronAPI.certificates.isInstalled().then(setCaInstalled);

    // Load TLS passthrough domains
    window.electronAPI.tlsPassthrough.list().then(setTlsDomains);

    // Load upstream proxy config
    window.electronAPI.upstreamProxy.get().then((config: UpstreamProxy | null) => {
      if (config) {
        setUpstreamProxy(config);
        if (config.auth) {
          setUpstreamAuth(config.auth);
        }
      }
    });
  }, []);

  useEffect(() => {
    setPort(config.port);
  }, [config.port]);

  const handleSavePort = async () => {
    setIsSaving(true);
    try {
      await updateConfig({ port });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCA = async () => {
    const result = await window.electronAPI.app.showSaveDialog({
      defaultPath: 'http-tools-ca.crt',
      filters: [{ name: 'Certificate', extensions: ['crt', 'pem'] }],
    });

    if (!result.canceled && result.filePath) {
      await window.electronAPI.certificates.exportCA(result.filePath);
      alert('Certificate exported successfully!');
    }
  };

  const handleRegenerateCA = async () => {
    if (confirm('This will invalidate all existing browser trust. Continue?')) {
      const newCA = await window.electronAPI.certificates.regenerateCA();
      setCA(newCA);
    }
  };

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    if (settings) {
      const updated = await window.electronAPI.settings.set({ theme });
      setSettings(updated);
    }
  };

  const handleInstallCA = async () => {
    setIsInstallingCA(true);
    try {
      const result = await window.electronAPI.certificates.install();
      if (result.success) {
        setCaInstalled(true);
        alert('Certificate installed successfully! The browser will now trust HTTPS traffic through the proxy.');
      } else {
        alert(`Failed to install certificate: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsInstallingCA(false);
    }
  };

  // TLS Passthrough handlers
  const handleAddTlsDomain = async () => {
    const domain = newTlsDomain.trim();
    if (!domain || tlsDomains.includes(domain)) return;
    await window.electronAPI.tlsPassthrough.add(domain);
    setTlsDomains((prev) => [...prev, domain]);
    setNewTlsDomain('');
  };

  const handleRemoveTlsDomain = async (domain: string) => {
    await window.electronAPI.tlsPassthrough.remove(domain);
    setTlsDomains((prev) => prev.filter((d) => d !== domain));
  };

  // Upstream Proxy handlers
  const handleSaveUpstreamProxy = async () => {
    setIsSavingUpstream(true);
    try {
      const config: UpstreamProxy = {
        ...upstreamProxy,
        auth: upstreamAuth.username
          ? { username: upstreamAuth.username, password: upstreamAuth.password }
          : undefined,
      };
      await window.electronAPI.upstreamProxy.set(config);
      setUpstreamProxy(config);
    } finally {
      setIsSavingUpstream(false);
    }
  };

  // Data Management handlers
  const handleExportHar = async () => {
    const harData = await window.electronAPI.traffic.exportHar();
    const result = await window.electronAPI.app.showSaveDialog({
      defaultPath: 'traffic.har',
      filters: [{ name: 'HAR File', extensions: ['har'] }],
    });
    if (!result.canceled && result.filePath) {
      await window.electronAPI.app.writeFile(result.filePath, JSON.stringify(harData, null, 2));
      alert('Traffic exported successfully!');
    }
  };

  const handleImportHar = async () => {
    const result = await window.electronAPI.app.showOpenDialog({
      filters: [{ name: 'HAR File', extensions: ['har'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const content = await window.electronAPI.app.readFile(result.filePaths[0]);
      const data = JSON.parse(content);
      await window.electronAPI.traffic.importHar(data);
      alert('Traffic imported successfully!');
    }
  };

  const handleExportRules = async () => {
    const rulesData = await window.electronAPI.rules.export();
    const result = await window.electronAPI.app.showSaveDialog({
      defaultPath: 'rules.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      await window.electronAPI.app.writeFile(result.filePath, JSON.stringify(rulesData, null, 2));
      alert('Rules exported successfully!');
    }
  };

  const handleImportRules = async () => {
    const result = await window.electronAPI.app.showOpenDialog({
      filters: [{ name: 'JSON File', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const content = await window.electronAPI.app.readFile(result.filePaths[0]);
      const data = JSON.parse(content);
      await window.electronAPI.rules.import(data);
      alert('Rules imported successfully!');
    }
  };

  const handleRemoveCA = async () => {
    if (confirm('Remove the CA certificate from the system keychain?')) {
      const result = await window.electronAPI.certificates.remove();
      if (result.success) {
        setCaInstalled(false);
        alert('Certificate removed successfully.');
      } else {
        alert(`Failed to remove certificate: ${result.error}`);
      }
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Proxy Settings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Proxy Settings</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proxy Port
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 8080)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSavePort}
                  disabled={port === config.port || isSaving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Configure your browser or app to use localhost:{port} as proxy
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoStart"
                checked={config.autoStart}
                onChange={(e) => updateConfig({ autoStart: e.target.checked })}
                className="rounded text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="autoStart" className="text-sm text-gray-700">
                Auto-start proxy on launch
              </label>
            </div>
          </div>
        </section>

        {/* Certificate Settings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Certificate Authority</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            {/* Installation Status */}
            <div className={`flex items-center justify-between p-3 rounded-lg ${
              caInstalled
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${caInstalled ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className={`text-sm font-medium ${caInstalled ? 'text-green-700' : 'text-yellow-700'}`}>
                  {caInstalled ? 'CA Trusted in System Keychain' : 'CA Not Installed'}
                </span>
              </div>
              {caInstalled ? (
                <button
                  onClick={handleRemoveCA}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={handleInstallCA}
                  disabled={isInstallingCA}
                  className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  {isInstallingCA ? 'Installing...' : 'Install CA'}
                </button>
              )}
            </div>

            {!caInstalled && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>Recommended:</strong> Click "Install CA" to add the certificate to your system keychain.
                This allows the proxy to intercept HTTPS traffic without triggering bot detection on sites like ID.me.
                You'll be prompted for your password.
              </div>
            )}

            {ca && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Fingerprint:</span>
                  <span className="font-mono text-gray-700 text-xs">{ca.fingerprint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created:</span>
                  <span className="text-gray-700">
                    {new Date(ca.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Expires:</span>
                  <span className="text-gray-700">
                    {new Date(ca.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={handleExportCA}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
              >
                Export Certificate
              </button>
              <button
                onClick={handleRegenerateCA}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Regenerate
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`px-4 py-2 text-sm rounded-lg capitalize transition-colors ${
                    settings?.theme === theme
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* TLS Passthrough */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">TLS Passthrough</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <p className="text-sm text-gray-500">
              Traffic to these domains will be tunneled without interception, preserving TLS fingerprints.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTlsDomain}
                onChange={(e) => setNewTlsDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTlsDomain()}
                placeholder="e.g. example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleAddTlsDomain}
                disabled={!newTlsDomain.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tlsDomains.map((domain) => (
                <span
                  key={domain}
                  onClick={() => handleRemoveTlsDomain(domain)}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm cursor-pointer hover:bg-red-100 hover:text-red-700 transition-colors"
                  title="Click to remove"
                >
                  {domain}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              ))}
              {tlsDomains.length === 0 && (
                <span className="text-sm text-gray-400">No domains added</span>
              )}
            </div>
          </div>
        </section>

        {/* Upstream Proxy */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upstream Proxy</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="upstreamEnabled"
                checked={upstreamProxy.enabled}
                onChange={(e) => setUpstreamProxy((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="rounded text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="upstreamEnabled" className="text-sm text-gray-700">
                Enable upstream proxy
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                <select
                  value={upstreamProxy.protocol}
                  onChange={(e) => setUpstreamProxy((prev) => ({ ...prev, protocol: e.target.value as UpstreamProxy['protocol'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                <input
                  type="text"
                  value={upstreamProxy.host}
                  onChange={(e) => setUpstreamProxy((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder="127.0.0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={upstreamProxy.port}
                  onChange={(e) => setUpstreamProxy((prev) => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                  placeholder="8080"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional)</label>
                <input
                  type="text"
                  value={upstreamAuth.username}
                  onChange={(e) => setUpstreamAuth((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="Username"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
                <input
                  type="password"
                  value={upstreamAuth.password}
                  onChange={(e) => setUpstreamAuth((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleSaveUpstreamProxy}
              disabled={isSavingUpstream}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
            >
              {isSavingUpstream ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        {/* Data Management */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Traffic</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleExportHar}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  Export Traffic as HAR
                </button>
                <button
                  onClick={handleImportHar}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Import HAR File
                </button>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Rules</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleExportRules}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  Export Rules
                </button>
                <button
                  onClick={handleImportRules}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Import Rules
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-gray-700 font-medium">HTTP Tools</p>
            <p className="text-sm text-gray-500">
              A powerful HTTP debugging proxy and toolkit
            </p>
            <p className="text-sm text-gray-400 mt-2">Version 1.0.0</p>
          </div>
        </section>
      </div>
    </div>
  );
};
