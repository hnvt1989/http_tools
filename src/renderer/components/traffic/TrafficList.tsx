import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTrafficStore } from '../../stores/trafficStore';
import { useRulesStore } from '../../stores/rulesStore';
import { TrafficItem } from './TrafficItem';
import { ContextMenu, ContextMenuItem } from '../common/ContextMenu';
import type { TrafficEntry, RuleType } from '../../../shared/types';

interface ContextMenuState {
  x: number;
  y: number;
  entry: TrafficEntry;
}

export const TrafficList: React.FC = () => {
  const entries = useTrafficStore((state) => state.getFilteredEntries());
  const selectedId = useTrafficStore((state) => state.selectedId);
  const selectEntry = useTrafficStore((state) => state.selectEntry);
  const deleteEntry = useTrafficStore((state) => state.deleteEntry);

  const { addRule } = useRulesStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [ruleEditorData, setRuleEditorData] = useState<{
    type: RuleType;
    entry: TrafficEntry;
  } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();

  const handleContextMenu = (e: React.MouseEvent, entry: TrafficEntry) => {
    e.preventDefault();
    selectEntry(entry.id);
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const createRuleFromEntry = (type: RuleType) => {
    if (contextMenu) {
      setRuleEditorData({ type, entry: contextMenu.entry });
      closeContextMenu();
    }
  };

  const quickMockBlankPage = async () => {
    if (!contextMenu) return;

    const { entry } = contextMenu;
    let urlPattern = entry.request.url;
    try {
      const url = new URL(entry.request.url);
      urlPattern = `*${url.host}${url.pathname}*`;
    } catch {
      // Keep full URL if parsing fails
    }

    const rule = {
      name: `Blank page - ${urlPattern.slice(0, 40)}`,
      type: 'mock' as RuleType,
      enabled: true,
      priority: 100,
      matcher: {
        urlPattern,
        methods: [entry.request.method],
      },
      response: {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '<!DOCTYPE html><html><head><title>Blank</title></head><body></body></html>',
      },
    };

    await addRule(rule);
    closeContextMenu();
  };

  const copyUrl = () => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.entry.request.url);
      closeContextMenu();
    }
  };

  const copyAsCurl = () => {
    if (contextMenu) {
      const { request } = contextMenu.entry;
      let curl = `curl '${request.url}'`;

      // Add method if not GET
      if (request.method !== 'GET') {
        curl += ` -X ${request.method}`;
      }

      // Add headers
      for (const [key, value] of Object.entries(request.headers)) {
        if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length') {
          curl += ` -H '${key}: ${value}'`;
        }
      }

      // Add body
      if (request.body) {
        const body = typeof request.body === 'string'
          ? request.body
          : new TextDecoder().decode(new Uint8Array(request.body));
        curl += ` -d '${body.replace(/'/g, "\\'")}'`;
      }

      navigator.clipboard.writeText(curl);
      closeContextMenu();
    }
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];

    return [
      {
        label: 'Quick mock - blank page',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        onClick: quickMockBlankPage,
      },
      {
        label: 'Mock this request',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
        onClick: () => createRuleFromEntry('mock'),
      },
      {
        label: 'Rewrite this request',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        onClick: () => createRuleFromEntry('rewrite'),
      },
      {
        label: 'Block this request',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        ),
        onClick: () => createRuleFromEntry('block'),
      },
      {
        label: 'Add breakpoint',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        onClick: () => createRuleFromEntry('breakpoint'),
      },
      { label: '', divider: true, onClick: () => {} },
      {
        label: 'Copy URL',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        ),
        onClick: copyUrl,
      },
      {
        label: 'Copy as cURL',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        ),
        onClick: copyAsCurl,
      },
      { label: '', divider: true, onClick: () => {} },
      {
        label: 'Open in HTTP Client',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        ),
        onClick: () => {
          // TODO: Navigate to client view with this request
          closeContextMenu();
        },
      },
      { label: '', divider: true, onClick: () => {} },
      {
        label: 'Delete',
        icon: (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        onClick: () => {
          deleteEntry(contextMenu.entry.id);
          closeContextMenu();
        },
        danger: true,
      },
    ];
  };

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <svg
          className="w-16 h-16 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <p className="text-lg font-medium">No traffic captured</p>
        <p className="text-sm mt-1">Start the proxy and make some requests</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center h-8 px-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
          <div className="w-16 shrink-0">Method</div>
          <div className="w-14 shrink-0">Status</div>
          <div className="flex-1 min-w-0">URL</div>
          <div className="w-24 shrink-0 text-right">Type</div>
          <div className="w-20 shrink-0 text-right">Time</div>
          <div className="w-20 shrink-0 text-right">Size</div>
        </div>

        {/* Virtual list */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {items.map((virtualRow) => {
              const entry = entries[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TrafficItem
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    onClick={() => selectEntry(entry.id)}
                    onContextMenu={handleContextMenu}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* Rule Editor Modal */}
      {ruleEditorData && (
        <RuleEditorFromTraffic
          type={ruleEditorData.type}
          entry={ruleEditorData.entry}
          onClose={() => setRuleEditorData(null)}
        />
      )}
    </>
  );
};

// Helper component to create a pre-filled rule editor
interface RuleEditorFromTrafficProps {
  type: RuleType;
  entry: TrafficEntry;
  onClose: () => void;
}

const RuleEditorFromTraffic: React.FC<RuleEditorFromTrafficProps> = ({
  type,
  entry,
  onClose,
}) => {
  const { addRule } = useRulesStore();
  const [isSaving, setIsSaving] = useState(false);

  // Extract URL pattern from the request
  let urlPattern = entry.request.url;
  try {
    const url = new URL(entry.request.url);
    // Use host + path as pattern (without query params for more general matching)
    urlPattern = `*${url.host}${url.pathname}*`;
  } catch {
    // Keep full URL if parsing fails
  }

  const [name, setName] = useState(`${type} - ${new URL(entry.request.url).pathname.slice(0, 30)}`);
  const [pattern, setPattern] = useState(urlPattern);
  const [methods, setMethods] = useState<string[]>([entry.request.method]);

  // Mock specific
  const [statusCode, setStatusCode] = useState(entry.response?.statusCode || 200);
  const [responseBody, setResponseBody] = useState(() => {
    if (entry.response?.body) {
      const body = typeof entry.response.body === 'string'
        ? entry.response.body
        : new TextDecoder().decode(new Uint8Array(entry.response.body));
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return '{}';
  });
  const [responseHeaders, setResponseHeaders] = useState(() => {
    if (entry.response?.headers) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(entry.response.headers)) {
        if (v && !['content-length', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) {
          headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
      }
      return JSON.stringify(headers, null, 2);
    }
    return '{\n  "Content-Type": "application/json"\n}';
  });

  // Rewrite specific
  const [rewriteUrl, setRewriteUrl] = useState('');

  // Block specific
  const [blockCode, setBlockCode] = useState(403);
  const [blockMessage, setBlockMessage] = useState('Blocked by HTTP Tools');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(responseHeaders);
      } catch {
        headers = { 'Content-Type': 'application/json' };
      }

      const baseRule = {
        name,
        type,
        enabled: true,
        priority: 100,
        matcher: {
          urlPattern: pattern,
          methods: methods.length > 0 ? methods : undefined,
        },
      };

      let fullRule: any;

      if (type === 'mock') {
        fullRule = {
          ...baseRule,
          response: {
            statusCode,
            headers,
            body: responseBody,
          },
        };
      } else if (type === 'rewrite') {
        fullRule = {
          ...baseRule,
          modifications: {
            request: rewriteUrl ? { url: rewriteUrl } : undefined,
          },
        };
      } else if (type === 'block') {
        fullRule = {
          ...baseRule,
          errorCode: blockCode,
          errorMessage: blockMessage,
        };
      } else if (type === 'breakpoint') {
        fullRule = {
          ...baseRule,
          breakOn: 'request',
        };
      }

      await addRule(fullRule);
      onClose();
    } catch (error) {
      console.error('Failed to save rule:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMethod = (method: string) => {
    if (methods.includes(method)) {
      setMethods(methods.filter((m) => m !== method));
    } else {
      setMethods([...methods, method]);
    }
  };

  const typeColors: Record<RuleType, string> = {
    mock: 'text-purple-600',
    rewrite: 'text-blue-600',
    block: 'text-red-600',
    breakpoint: 'text-yellow-600',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            Create <span className={`capitalize ${typeColors[type]}`}>{type}</span> Rule from Request
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            {/* Original request info */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-700">Original Request</p>
              <p className="font-mono text-gray-600 truncate">{entry.request.method} {entry.request.url}</p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* URL Pattern */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Pattern</label>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Use * for wildcards, /regex/ for regex patterns</p>
            </div>

            {/* Methods */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Methods</label>
              <div className="flex gap-2 flex-wrap">
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                  <button
                    key={method}
                    onClick={() => toggleMethod(method)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      methods.includes(method)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Type-specific fields */}
            {type === 'mock' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status Code</label>
                  <input
                    type="number"
                    value={statusCode}
                    onChange={(e) => setStatusCode(parseInt(e.target.value) || 200)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response Headers (JSON)</label>
                  <textarea
                    value={responseHeaders}
                    onChange={(e) => setResponseHeaders(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response Body</label>
                  <textarea
                    value={responseBody}
                    onChange={(e) => setResponseBody(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {type === 'rewrite' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rewrite URL to</label>
                <input
                  type="text"
                  value={rewriteUrl}
                  onChange={(e) => setRewriteUrl(e.target.value)}
                  placeholder="https://new-host.com/api"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {type === 'block' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Error Code</label>
                  <input
                    type="number"
                    value={blockCode}
                    onChange={(e) => setBlockCode(parseInt(e.target.value) || 403)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Error Message</label>
                  <input
                    type="text"
                    value={blockMessage}
                    onChange={(e) => setBlockMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {type === 'breakpoint' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                <p className="font-medium">Breakpoint Rule</p>
                <p className="mt-1">
                  When a request matches this pattern, it will be paused before being sent.
                  You can then inspect and modify the request before continuing.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !pattern}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Creating...' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};
