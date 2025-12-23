import React, { useEffect } from 'react';
import { useClientStore } from '../../stores/clientStore';

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

export const ClientView: React.FC = () => {
  const {
    currentRequest,
    response,
    isLoading,
    error,
    savedRequests,
    setCurrentRequest,
    resetCurrentRequest,
    sendRequest,
    cancelRequest,
    loadSavedRequests,
    saveCurrentRequest,
    loadSavedRequest,
    deleteSavedRequest,
  } = useClientStore();

  useEffect(() => {
    loadSavedRequests();
  }, [loadSavedRequests]);

  const handleSend = async () => {
    await sendRequest();
  };

  const handleSave = async () => {
    const name = prompt('Enter a name for this request:');
    if (name) {
      await saveCurrentRequest(name);
    }
  };

  const formatBody = (body: Buffer | string | null | undefined): string => {
    if (!body) return '';
    const str = typeof body === 'string' ? body : Buffer.from(body).toString('utf-8');
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  const [headersText, setHeadersText] = React.useState(
    JSON.stringify(currentRequest.headers, null, 2) || '{}'
  );

  useEffect(() => {
    setHeadersText(JSON.stringify(currentRequest.headers, null, 2) || '{}');
  }, [currentRequest.headers]);

  const handleHeadersChange = (text: string) => {
    setHeadersText(text);
    try {
      const headers = JSON.parse(text);
      setCurrentRequest({ headers });
    } catch {
      // Invalid JSON, don't update
    }
  };

  return (
    <div className="h-full flex">
      {/* Saved requests sidebar */}
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium text-gray-900">Saved Requests</h3>
        </div>
        <div className="flex-1 overflow-auto">
          {savedRequests.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No saved requests</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {savedRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => loadSavedRequest(req.id)}
                >
                  <span className={`text-xs font-medium method-${req.method.toLowerCase()}`}>
                    {req.method}
                  </span>
                  <span className="text-sm text-gray-700 truncate flex-1">{req.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedRequest(req.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Request builder */}
        <div className="p-4 border-b border-gray-200">
          {/* Method & URL */}
          <div className="flex gap-2 mb-4">
            <select
              value={currentRequest.method}
              onChange={(e) => setCurrentRequest({ method: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              value={currentRequest.url}
              onChange={(e) => setCurrentRequest({ url: e.target.value })}
              placeholder="Enter URL..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={isLoading ? cancelRequest : handleSend}
              disabled={!currentRequest.url}
              className={`px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                isLoading
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isLoading ? 'Cancel' : 'Send'}
            </button>
            <button
              onClick={handleSave}
              disabled={!currentRequest.url}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={resetCurrentRequest}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Headers & Body tabs */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Headers (JSON)</label>
              <textarea
                value={headersText}
                onChange={(e) => handleHeadersChange(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='{"Content-Type": "application/json"}'
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={currentRequest.body || ''}
                onChange={(e) => setCurrentRequest({ body: e.target.value || undefined })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='{"key": "value"}'
              />
            </div>
          </div>
        </div>

        {/* Response */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-red-700 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="p-8 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

          {response && !isLoading && (
            <div className="p-4">
              {/* Status */}
              <div className="flex items-center gap-4 mb-4">
                <span className={`text-lg font-bold ${
                  response.statusCode >= 200 && response.statusCode < 300
                    ? 'text-green-600'
                    : response.statusCode >= 400
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}>
                  {response.statusCode} {response.statusMessage}
                </span>
                <span className="text-sm text-gray-500">
                  {response.timing.total} ms
                </span>
                <span className="text-sm text-gray-500">
                  {response.size} bytes
                </span>
              </div>

              {/* Headers */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Response Headers</h4>
                <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono overflow-x-auto">
                  {Object.entries(response.headers).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-blue-600">{key}:</span>{' '}
                      <span className="text-gray-700">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Response Body</h4>
                <pre className="bg-gray-50 rounded-lg p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {formatBody(response.body)}
                </pre>
              </div>
            </div>
          )}

          {!response && !isLoading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">Enter a URL and click Send</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
