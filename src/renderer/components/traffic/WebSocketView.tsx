import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { WebSocketEntry, WebSocketMessage } from '../../../shared/types';

const opcodeLabels: Record<number, string> = {
  1: 'text',
  2: 'binary',
  8: 'close',
  9: 'ping',
  10: 'pong',
};

const statusColors: Record<string, string> = {
  connecting: 'text-yellow-600',
  open: 'text-green-600',
  closed: 'text-gray-500',
  error: 'text-red-600',
};

const statusDotColors: Record<string, string> = {
  connecting: 'bg-yellow-400',
  open: 'bg-green-500',
  closed: 'bg-gray-400',
  error: 'bg-red-500',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function formatMessageData(data: string | Buffer, opcode: number): string {
  if (opcode !== 1) return typeof data === 'string' ? data : '[binary data]';
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function isJsonMessage(data: string | Buffer, opcode: number): boolean {
  if (opcode !== 1) return false;
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

const MessageItem: React.FC<{ message: WebSocketMessage }> = ({ message }) => {
  const isSent = message.direction === 'sent';
  const isJson = isJsonMessage(message.data, message.opcode);
  const formattedData = formatMessageData(message.data, message.opcode);
  const opcodeLabel = opcodeLabels[message.opcode] || `opcode ${message.opcode}`;
  const isControl = message.opcode >= 8;

  if (isControl) {
    return (
      <div className="flex justify-center py-1.5">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
          <span className="font-medium uppercase">{opcodeLabel}</span>
          <span>{formatTime(message.timestamp)}</span>
          {formattedData && <span className="font-mono">{formattedData}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isSent ? 'justify-start' : 'justify-end'} px-4 py-1`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isSent
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-900'
        }`}
      >
        {/* Meta row */}
        <div className={`flex items-center gap-2 mb-1 text-xs ${
          isSent ? 'text-blue-200' : 'text-gray-500'
        }`}>
          <span className="font-medium">{isSent ? 'Sent' : 'Received'}</span>
          <span className="uppercase">{opcodeLabel}</span>
          <span>{formatSize(message.size)}</span>
          <span>{formatTime(message.timestamp)}</span>
        </div>

        {/* Data */}
        <pre className={`text-sm font-mono whitespace-pre-wrap break-all ${
          isJson ? '' : ''
        }`}>
          {formattedData || '(empty)'}
        </pre>
      </div>
    </div>
  );
};

export const WebSocketView: React.FC = () => {
  const [connections, setConnections] = useState<WebSocketEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedConnection = connections.find((c) => c.id === selectedId) ?? null;
  const messages = selectedConnection?.messages ?? [];

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  // Auto-scroll to bottom when new messages arrive
  const prevMessageCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, virtualizer]);

  // Subscribe to WebSocket events
  useEffect(() => {
    const unsubNew = window.electronAPI.websocket.onNew((entry) => {
      setConnections((prev) => [entry, ...prev]);
    });

    const unsubMessage = window.electronAPI.websocket.onMessage((wsId, message) => {
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === wsId
            ? { ...conn, messages: [...conn.messages, message] }
            : conn
        )
      );
    });

    const unsubClosed = window.electronAPI.websocket.onClosed((wsId, code, reason) => {
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === wsId
            ? { ...conn, status: 'closed' as const, closeCode: code, closeReason: reason, endTime: Date.now() }
            : conn
        )
      );
    });

    const unsubError = window.electronAPI.websocket.onError((wsId, error) => {
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === wsId
            ? { ...conn, status: 'error' as const, error, endTime: Date.now() }
            : conn
        )
      );
    });

    return () => {
      unsubNew();
      unsubMessage();
      unsubClosed();
      unsubError();
    };
  }, []);

  const handleSelectConnection = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div className="h-full flex">
      {/* Connections list */}
      <div className="w-80 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">WebSocket Connections</h3>
          <p className="text-xs text-gray-400 mt-0.5">{connections.length} connection{connections.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-auto">
          {connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
              </svg>
              <p className="text-sm text-center">No WebSocket connections yet</p>
            </div>
          ) : (
            connections.map((conn) => (
              <div
                key={conn.id}
                onClick={() => handleSelectConnection(conn.id)}
                className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${
                  selectedId === conn.id
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotColors[conn.status]}`} />
                  <span className={`text-xs font-medium ${statusColors[conn.status]}`}>
                    {conn.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto font-mono">
                    {conn.messages.length} msg{conn.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="text-xs text-gray-400 font-mono truncate" title={conn.url}>
                  {extractHost(conn.url)}
                </div>
                <div className="text-sm font-mono text-gray-700 truncate" title={conn.url}>
                  {extractPath(conn.url)}
                </div>

                {conn.status === 'closed' && conn.closeCode !== undefined && (
                  <div className="mt-1 text-xs text-gray-400">
                    Code: {conn.closeCode}
                    {conn.closeReason ? ` - ${conn.closeReason}` : ''}
                  </div>
                )}
                {conn.status === 'error' && conn.error && (
                  <div className="mt-1 text-xs text-red-500 truncate">{conn.error}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages panel */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConnection ? (
          <>
            {/* Connection header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${statusDotColors[selectedConnection.status]}`} />
                <span className="text-sm font-medium text-gray-900 font-mono truncate">
                  {selectedConnection.url}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                <span>Protocol: {selectedConnection.protocol}</span>
                <span>Messages: {selectedConnection.messages.length}</span>
                <span>Started: {formatTime(selectedConnection.startTime)}</span>
                {selectedConnection.endTime && (
                  <span>Ended: {formatTime(selectedConnection.endTime)}</span>
                )}
              </div>
            </div>

            {/* Messages with virtual scrolling */}
            <div ref={parentRef} className="flex-1 overflow-auto">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p className="text-sm">No messages yet</p>
                </div>
              ) : (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const message = messages[virtualItem.index];
                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <MessageItem message={message} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer stats */}
            <div className="px-4 py-2 border-t border-gray-200 bg-white text-xs text-gray-500 flex items-center gap-4">
              <span>
                Sent: {messages.filter((m) => m.direction === 'sent').length}
              </span>
              <span>
                Received: {messages.filter((m) => m.direction === 'received').length}
              </span>
              <span>
                Total size: {formatSize(messages.reduce((acc, m) => acc + m.size, 0))}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">Select a connection to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
};
