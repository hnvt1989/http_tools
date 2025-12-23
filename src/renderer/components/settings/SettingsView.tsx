import React, { useEffect, useState } from 'react';
import { useProxyStore } from '../../stores/proxyStore';
import type { AppSettings, CACertificate } from '../../../shared/types';

export const SettingsView: React.FC = () => {
  const { config, updateConfig } = useProxyStore();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ca, setCA] = useState<CACertificate | null>(null);
  const [port, setPort] = useState(config.port);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load settings
    window.electronAPI.settings.get().then(setSettings);
    window.electronAPI.certificates.getCA().then(setCA);
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

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <strong>To intercept HTTPS traffic:</strong>
              <ol className="list-decimal list-inside mt-1 space-y-1">
                <li>Export the certificate above</li>
                <li>Import it into your browser/system as a trusted CA</li>
                <li>Configure your browser to use the proxy</li>
              </ol>
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
