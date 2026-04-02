import React, { useState, useMemo } from 'react';
import type { BreakpointPause, RequestData, ResponseData } from '../../../shared/types';

interface BreakpointPanelProps {
  pause: BreakpointPause;
  onResume: (id: string, modifiedData?: any) => void;
  onDrop: (id: string) => void;
}

function isRequestData(data: RequestData | ResponseData): data is RequestData {
  return 'method' in data && 'url' in data;
}

function formatHeaders(headers: Record<string, string | string[] | undefined>): string {
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '{}';
  }
}

function parseHeaders(str: string): Record<string, string | string[] | undefined> | null {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const BreakpointPanel: React.FC<BreakpointPanelProps> = ({ pause, onResume, onDrop }) => {
  const isRequest = isRequestData(pause.data);
  const requestData = isRequest ? (pause.data as RequestData) : null;
  const responseData = !isRequest ? (pause.data as ResponseData) : null;

  const [method, setMethod] = useState(requestData?.method ?? '');
  const [url, setUrl] = useState(requestData?.url ?? '');
  const [statusCode, setStatusCode] = useState(responseData?.statusCode?.toString() ?? '');
  const [statusMessage, setStatusMessage] = useState(responseData?.statusMessage ?? '');
  const [headersText, setHeadersText] = useState(formatHeaders(pause.data.headers));
  const [body, setBody] = useState(
    pause.data.body
      ? typeof pause.data.body === 'string'
        ? pause.data.body
        : pause.data.body.toString('utf-8')
      : ''
  );
  const [headersError, setHeadersError] = useState<string | null>(null);

  const hasChanges = useMemo(() => {
    if (isRequest && requestData) {
      if (method !== requestData.method) return true;
      if (url !== requestData.url) return true;
    }
    if (!isRequest && responseData) {
      if (statusCode !== responseData.statusCode.toString()) return true;
      if (statusMessage !== responseData.statusMessage) return true;
    }
    if (headersText !== formatHeaders(pause.data.headers)) return true;
    const originalBody = pause.data.body
      ? typeof pause.data.body === 'string'
        ? pause.data.body
        : pause.data.body.toString('utf-8')
      : '';
    if (body !== originalBody) return true;
    return false;
  }, [method, url, statusCode, statusMessage, headersText, body, pause.data, isRequest, requestData, responseData]);

  const handleResumeWithChanges = () => {
    const parsedHeaders = parseHeaders(headersText);
    if (!parsedHeaders) {
      setHeadersError('Invalid JSON. Please fix the headers before resuming.');
      return;
    }
    setHeadersError(null);

    if (isRequest) {
      onResume(pause.id, {
        method,
        url,
        headers: parsedHeaders,
        body: body || null,
        startTime: requestData!.startTime,
      });
    } else {
      onResume(pause.id, {
        statusCode: parseInt(statusCode, 10) || responseData!.statusCode,
        statusMessage,
        headers: parsedHeaders,
        body: body || null,
        endTime: responseData!.endTime,
      });
    }
  };

  const handleResumeWithoutChanges = () => {
    onResume(pause.id);
  };

  const handleDrop = () => {
    onDrop(pause.id);
  };

  const handleHeadersChange = (value: string) => {
    setHeadersText(value);
    if (headersError) {
      const parsed = parseHeaders(value);
      if (parsed) setHeadersError(null);
    }
  };

  const timestamp = new Date(pause.timestamp).toLocaleTimeString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-[720px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            <h2 className="text-lg font-semibold text-gray-900">
              Breakpoint Hit
            </h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
              {pause.type === 'request' ? 'Request' : 'Response'}
            </span>
          </div>
          <span className="text-xs text-gray-400 font-mono">{timestamp}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Request fields */}
          {isRequest && (
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <label className="text-sm font-medium text-gray-700">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <label className="text-sm font-medium text-gray-700">URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
            </div>
          )}

          {/* Response fields */}
          {!isRequest && (
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <label className="text-sm font-medium text-gray-700">Status Code</label>
              <input
                type="number"
                value={statusCode}
                onChange={(e) => setStatusCode(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono w-32"
              />

              <label className="text-sm font-medium text-gray-700">Status Text</label>
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
              />
            </div>
          )}

          {/* Headers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Headers (JSON)</label>
            <textarea
              value={headersText}
              onChange={(e) => handleHeadersChange(e.target.value)}
              rows={6}
              spellCheck={false}
              className={`w-full px-3 py-2 text-sm border rounded-md font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                headersError ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            {headersError && (
              <p className="mt-1 text-xs text-red-600">{headersError}</p>
            )}
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="(empty body)"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={handleDrop}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Drop
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResumeWithoutChanges}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Resume Without Changes
            </button>
            <button
              onClick={handleResumeWithChanges}
              disabled={!hasChanges}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
