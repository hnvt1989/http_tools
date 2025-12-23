import React, { useState } from 'react';
import type { TrafficEntry } from '../../../shared/types';

interface TrafficDetailProps {
  entry: TrafficEntry;
}

type Tab = 'headers' | 'body' | 'timing';
type ViewMode = 'request' | 'response';

export const TrafficDetail: React.FC<TrafficDetailProps> = ({ entry }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('request');
  const [tab, setTab] = useState<Tab>('headers');

  const { request, response, timing, status } = entry;
  const data = viewMode === 'request' ? request : response;

  const formatBody = (body: Buffer | string | null): string => {
    if (!body) return '';
    const str = typeof body === 'string' ? body : body.toString('utf-8');

    // Try to parse and format JSON
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  const getContentType = (): string => {
    const headers = viewMode === 'request' ? request.headers : response?.headers;
    if (!headers) return 'text';
    const ct = headers['content-type'];
    if (!ct) return 'text';
    const type = String(ct).toLowerCase();
    if (type.includes('json')) return 'json';
    if (type.includes('html')) return 'html';
    if (type.includes('xml')) return 'xml';
    return 'text';
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <span className={`font-mono font-bold method-${request.method.toLowerCase()}`}>
            {request.method}
          </span>
          <span className={`font-mono status-${status}`}>
            {response?.statusCode || status}
          </span>
        </div>
        <p className="text-sm font-mono text-gray-600 truncate" title={request.url}>
          {request.url}
        </p>
      </div>

      {/* Request/Response toggle */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setViewMode('request')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            viewMode === 'request'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Request
        </button>
        <button
          onClick={() => setViewMode('response')}
          disabled={!response}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            viewMode === 'response'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Response
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {(['headers', 'body', 'timing'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? 'text-blue-600 bg-white border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'headers' && data && (
          <div className="space-y-1">
            {Object.entries(data.headers || {}).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-sm font-mono">
                <span className="text-blue-600 font-medium">{key}:</span>
                <span className="text-gray-700 break-all">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(data.headers || {}).length === 0 && (
              <p className="text-gray-400 text-sm">No headers</p>
            )}
          </div>
        )}

        {tab === 'body' && (
          <div className="h-full">
            {data?.body ? (
              <pre className={`text-sm font-mono whitespace-pre-wrap break-all ${
                getContentType() === 'json' ? 'text-gray-800' : 'text-gray-600'
              }`}>
                {formatBody(data.body)}
              </pre>
            ) : (
              <p className="text-gray-400 text-sm">No body</p>
            )}
          </div>
        )}

        {tab === 'timing' && (
          <div className="space-y-3">
            {timing ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total time:</span>
                  <span className="font-mono font-medium">{timing.total} ms</span>
                </div>
                {timing.dns !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">DNS lookup:</span>
                    <span className="font-mono">{timing.dns} ms</span>
                  </div>
                )}
                {timing.tcp !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">TCP connect:</span>
                    <span className="font-mono">{timing.tcp} ms</span>
                  </div>
                )}
                {timing.tls !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">TLS handshake:</span>
                    <span className="font-mono">{timing.tls} ms</span>
                  </div>
                )}
                {timing.firstByte !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Time to first byte:</span>
                    <span className="font-mono">{timing.firstByte} ms</span>
                  </div>
                )}
                {timing.download !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Download:</span>
                    <span className="font-mono">{timing.download} ms</span>
                  </div>
                )}

                {/* Visual timeline */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="h-6 bg-gray-100 rounded overflow-hidden flex">
                    {timing.dns !== undefined && timing.dns > 0 && (
                      <div
                        className="bg-purple-400 h-full"
                        style={{ width: `${(timing.dns / timing.total) * 100}%` }}
                        title={`DNS: ${timing.dns}ms`}
                      />
                    )}
                    {timing.tcp !== undefined && timing.tcp > 0 && (
                      <div
                        className="bg-orange-400 h-full"
                        style={{ width: `${(timing.tcp / timing.total) * 100}%` }}
                        title={`TCP: ${timing.tcp}ms`}
                      />
                    )}
                    {timing.tls !== undefined && timing.tls > 0 && (
                      <div
                        className="bg-yellow-400 h-full"
                        style={{ width: `${(timing.tls / timing.total) * 100}%` }}
                        title={`TLS: ${timing.tls}ms`}
                      />
                    )}
                    {timing.firstByte !== undefined && (
                      <div
                        className="bg-green-400 h-full"
                        style={{ width: `${(timing.firstByte / timing.total) * 100}%` }}
                        title={`TTFB: ${timing.firstByte}ms`}
                      />
                    )}
                    {timing.download !== undefined && (
                      <div
                        className="bg-blue-400 h-full"
                        style={{ width: `${(timing.download / timing.total) * 100}%` }}
                        title={`Download: ${timing.download}ms`}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0 ms</span>
                    <span>{timing.total} ms</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-400 text-sm">
                {status === 'pending' || status === 'active'
                  ? 'Request in progress...'
                  : 'No timing data available'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
