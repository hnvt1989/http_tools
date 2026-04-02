import React, { useState, useEffect } from 'react';
import { useProxyStore } from '../../stores/proxyStore';
import { useTrafficStore } from '../../stores/trafficStore';

export const Header: React.FC = () => {
  const { status, isStarting, isStopping, start, stop } = useProxyStore();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isBrowserRunning, setIsBrowserRunning] = useState(false);
  const [isTerminalLaunching, setIsTerminalLaunching] = useState(false);
  const { isRecording, toggleRecording, clearEntries } = useTrafficStore();

  useEffect(() => {
    const unsubscribe = window.electronAPI.app.onBrowserExited(() => {
      setIsBrowserRunning(false);
    });
    return () => unsubscribe();
  }, []);
  const stats = useTrafficStore((state) => state.getStats());

  const handleToggleProxy = async () => {
    if (status.running) {
      await stop();
    } else {
      await start();
    }
  };

  const handleLaunchBrowser = async () => {
    setIsLaunching(true);
    try {
      // Start proxy first if not running
      if (!status.running) {
        await start();
      }
      const result = await window.electronAPI.app.launchBrowser();
      if (result.launched) {
        setIsBrowserRunning(true);
      }
    } catch (error) {
      console.error('Failed to launch browser:', error);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <header className="h-12 bg-gray-900 text-white flex items-center px-4 drag-region">
      {/* macOS traffic lights spacing */}
      <div className="w-16" />

      {/* Logo / Title */}
      <div className="flex items-center gap-2 no-drag">
        <svg
          className="w-6 h-6 text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="font-semibold">HTTP Tools</span>
      </div>

      {/* Proxy Status & Controls */}
      <div className="flex items-center gap-4 ml-8 no-drag">
        <button
          onClick={handleToggleProxy}
          disabled={isStarting || isStopping}
          className={`
            px-3 py-1 rounded text-sm font-medium transition-colors
            ${
              status.running
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-green-500 hover:bg-green-600'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {isStarting
            ? 'Starting...'
            : isStopping
            ? 'Stopping...'
            : status.running
            ? 'Stop Proxy'
            : 'Start Proxy'}
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              status.running ? 'bg-green-400' : 'bg-gray-500'
            }`}
          />
          <span className="text-gray-300">
            {status.running ? `Port ${status.port}` : 'Stopped'}
          </span>
        </div>

        <button
          onClick={handleLaunchBrowser}
          disabled={isLaunching || isBrowserRunning}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
            isBrowserRunning ? 'bg-gray-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
          title={isBrowserRunning ? 'Chrome is running - close it to launch again' : 'Launch Chrome with proxy configured'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {isLaunching ? 'Launching...' : isBrowserRunning ? 'Chrome Running' : 'Launch Chrome'}
        </button>

        <button
          onClick={async () => {
            setIsTerminalLaunching(true);
            try {
              if (!status.running) await start();
              await window.electronAPI.terminal.launch();
            } catch (error) {
              console.error('Failed to launch terminal:', error);
            } finally {
              setIsTerminalLaunching(false);
            }
          }}
          disabled={isTerminalLaunching}
          className="px-3 py-1 rounded text-sm font-medium transition-colors bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          title="Launch a terminal with proxy environment variables set"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {isTerminalLaunching ? 'Launching...' : 'Terminal'}
        </button>
      </div>

      {/* Recording & Clear */}
      <div className="flex items-center gap-2 ml-auto no-drag">
        <button
          onClick={toggleRecording}
          className={`
            p-2 rounded transition-colors
            ${isRecording ? 'text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-800'}
          `}
          title={isRecording ? 'Pause recording' : 'Resume recording'}
        >
          {isRecording ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" strokeWidth={2} />
            </svg>
          )}
        </button>

        <button
          onClick={clearEntries}
          className="p-2 rounded text-gray-400 hover:bg-gray-800 transition-colors"
          title="Clear traffic"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>

        {/* Stats */}
        <div className="flex items-center gap-3 ml-4 text-sm text-gray-400">
          <span>{stats.total} requests</span>
          {stats.pending > 0 && (
            <span className="text-blue-400">{stats.pending} pending</span>
          )}
          {stats.errors > 0 && (
            <span className="text-red-400">{stats.errors} errors</span>
          )}
          {stats.mocked > 0 && (
            <span className="text-purple-400">{stats.mocked} mocked</span>
          )}
        </div>
      </div>
    </header>
  );
};
