import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type {
  TrafficEntry,
  PerformanceAnalysis,
  SnippetLanguage,
  ClientResponse,
} from '../../../shared/types';

interface TrafficDetailProps {
  entry: TrafficEntry;
}

type Tab = 'headers' | 'body' | 'timing' | 'performance' | 'snippets';
type ViewMode = 'request' | 'response';
type BodyFormat = 'formatted' | 'raw' | 'hex';

const SNIPPET_LANGUAGES: { value: SnippetLanguage; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'python', label: 'Python (requests)' },
  { value: 'javascript', label: 'JavaScript (fetch)' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'rust', label: 'Rust' },
  { value: 'httpie', label: 'HTTPie' },
];

const HEADER_DESCRIPTIONS: Record<string, string> = {
  'content-type': 'Indicates the media type of the resource',
  'content-length': 'Size of the response body in bytes',
  'content-encoding': 'Compression algorithm used on the body',
  'cache-control': 'Directives for caching mechanisms',
  'authorization': 'Credentials for authenticating the client',
  'accept': 'Media types the client can process',
  'accept-encoding': 'Encoding algorithms the client supports',
  'accept-language': 'Preferred natural languages for the response',
  'user-agent': 'Identifies the client software',
  'host': 'Specifies the domain name of the server',
  'cookie': 'HTTP cookies previously sent by the server',
  'set-cookie': 'Sends cookies from the server to the client',
  'location': 'URL to redirect the client to',
  'x-request-id': 'Unique identifier for tracking the request',
  'x-forwarded-for': 'Identifies the originating IP of a client',
  'x-frame-options': 'Controls whether a page can be embedded in a frame',
  'x-content-type-options': 'Prevents MIME type sniffing',
  'strict-transport-security': 'Enforces HTTPS connections',
  'content-security-policy': 'Controls resources the browser is allowed to load',
  'access-control-allow-origin': 'Specifies which origins can access the resource',
  'access-control-allow-methods': 'Specifies allowed HTTP methods for CORS',
  'access-control-allow-headers': 'Specifies allowed headers for CORS',
  'etag': 'Identifier for a specific version of a resource',
  'last-modified': 'Date the resource was last modified',
  'if-none-match': 'Conditional request based on ETag',
  'if-modified-since': 'Conditional request based on modification date',
  'referrer-policy': 'Controls referrer information sent with requests',
  'transfer-encoding': 'Encoding used to transfer the body',
  'vary': 'Determines how to match future request headers',
  'server': 'Identifies the server software',
  'date': 'Date and time the message was sent',
  'expires': 'Date/time after which the response is considered stale',
  'pragma': 'Implementation-specific directives (legacy)',
  'connection': 'Control options for the current connection',
  'keep-alive': 'Parameters for persistent connections',
};

const HEADER_CATEGORIES: Record<string, string[]> = {
  'General': ['host', 'connection', 'keep-alive', 'date', 'transfer-encoding', 'server', 'via'],
  'Content': ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-disposition', 'content-range'],
  'Caching': ['cache-control', 'expires', 'etag', 'last-modified', 'if-none-match', 'if-modified-since', 'pragma', 'vary', 'age'],
  'Auth & Cookies': ['authorization', 'www-authenticate', 'cookie', 'set-cookie', 'proxy-authorization'],
  'Security': ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'x-xss-protection', 'permissions-policy'],
  'CORS': ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-max-age', 'origin'],
  'Client Info': ['user-agent', 'accept', 'accept-encoding', 'accept-language', 'referer', 'x-forwarded-for', 'x-real-ip', 'x-request-id'],
};

function getHeaderCategory(headerName: string): string {
  const lower = headerName.toLowerCase();
  for (const [category, headers] of Object.entries(HEADER_CATEGORIES)) {
    if (headers.includes(lower)) return category;
  }
  return 'Other';
}

function getHeaderColor(headerName: string): string {
  const category = getHeaderCategory(headerName);
  const colors: Record<string, string> = {
    'General': 'text-slate-600',
    'Content': 'text-blue-600',
    'Caching': 'text-green-600',
    'Auth & Cookies': 'text-red-600',
    'Security': 'text-purple-600',
    'CORS': 'text-orange-600',
    'Client Info': 'text-cyan-600',
    'Other': 'text-gray-600',
  };
  return colors[category] || 'text-gray-600';
}

function hexDump(input: Buffer | string | null): string {
  if (!input) return '';
  const bytes: number[] = [];
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      bytes.push(input.charCodeAt(i) & 0xff);
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      bytes.push(input[i]);
    }
  }

  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = chunk
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('');
    const offsetStr = offset.toString(16).padStart(8, '0');
    lines.push(`${offsetStr}  ${hex.padEnd(48, ' ')}  |${ascii}|`);
  }
  return lines.join('\n');
}

function detectLanguage(contentType: string | undefined): string {
  if (!contentType) return 'plaintext';
  const ct = String(contentType).toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('html')) return 'html';
  if (ct.includes('xml') || ct.includes('svg')) return 'xml';
  if (ct.includes('css')) return 'css';
  if (ct.includes('javascript') || ct.includes('ecmascript')) return 'javascript';
  if (ct.includes('typescript')) return 'typescript';
  if (ct.includes('yaml') || ct.includes('yml')) return 'yaml';
  if (ct.includes('graphql')) return 'graphql';
  if (ct.includes('markdown')) return 'markdown';
  return 'plaintext';
}

function snippetLanguageToMonaco(lang: SnippetLanguage): string {
  const map: Record<SnippetLanguage, string> = {
    curl: 'shell',
    python: 'python',
    javascript: 'javascript',
    go: 'go',
    ruby: 'ruby',
    php: 'php',
    java: 'java',
    csharp: 'csharp',
    rust: 'rust',
    httpie: 'shell',
  };
  return map[lang] || 'plaintext';
}

function formatBodyContent(
  body: Buffer | string | null,
  contentType: string | undefined,
  format: BodyFormat
): string {
  if (!body) return '';
  if (format === 'hex') return hexDump(body);

  const str = typeof body === 'string' ? body : body.toString('utf-8');

  if (format === 'raw') return str;

  // Formatted: try to pretty-print known formats
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }
  return str;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function generateCurlCommand(entry: TrafficEntry): string {
  const { request } = entry;
  const parts = [`curl -X ${request.method}`];

  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        const val = Array.isArray(value) ? value.join(', ') : String(value);
        parts.push(`  -H '${key}: ${val}'`);
      }
    }
  }

  if (request.body) {
    const bodyStr = typeof request.body === 'string' ? request.body : request.body.toString('utf-8');
    const escaped = bodyStr.replace(/'/g, "'\\''");
    parts.push(`  -d '${escaped}'`);
  }

  parts.push(`  '${request.url}'`);
  return parts.join(' \\\n');
}

// --- Sub-components ---

const SuggestionItem: React.FC<{ text: string }> = ({ text }) => {
  const isWarning = text.toLowerCase().includes('missing') || text.toLowerCase().includes('not ') || text.toLowerCase().includes('should');
  return (
    <div className="flex items-start gap-2 text-sm py-1">
      <span className={`mt-0.5 flex-shrink-0 ${isWarning ? 'text-yellow-500' : 'text-blue-500'}`}>
        {isWarning ? '\u26A0' : '\u2139'}
      </span>
      <span className="text-gray-700">{text}</span>
    </div>
  );
};

// --- Main Component ---

export const TrafficDetail: React.FC<TrafficDetailProps> = ({ entry }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('request');
  const [tab, setTab] = useState<Tab>('headers');
  const [bodyFormat, setBodyFormat] = useState<BodyFormat>('formatted');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Edit & Resend state
  const [editMode, setEditMode] = useState(false);
  const [editMethod, setEditMethod] = useState(entry.request.method);
  const [editUrl, setEditUrl] = useState(entry.request.url);
  const [editHeaders, setEditHeaders] = useState('');
  const [editBody, setEditBody] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendResponse, setResendResponse] = useState<ClientResponse | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  // Snippets state
  const [snippetLanguage, setSnippetLanguage] = useState<SnippetLanguage>('curl');
  const [snippetCode, setSnippetCode] = useState('');
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

  // Performance state
  const [perfAnalysis, setPerfAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState<string | null>(null);

  const { request, response, timing, status } = entry;
  const data = viewMode === 'request' ? request : response;

  const getContentType = useCallback((): string | undefined => {
    const headers = viewMode === 'request' ? request.headers : response?.headers;
    if (!headers) return undefined;
    const ct = headers['content-type'];
    return ct ? String(ct) : undefined;
  }, [viewMode, request.headers, response?.headers]);

  // Initialize edit mode fields
  const enterEditMode = useCallback(() => {
    setEditMode(true);
    setEditMethod(entry.request.method);
    setEditUrl(entry.request.url);
    setResendResponse(null);
    setResendError(null);

    const headerLines = Object.entries(entry.request.headers || {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join('\n');
    setEditHeaders(headerLines);

    const body = entry.request.body;
    if (body) {
      const str = typeof body === 'string' ? body : body.toString('utf-8');
      try {
        setEditBody(JSON.stringify(JSON.parse(str), null, 2));
      } catch {
        setEditBody(str);
      }
    } else {
      setEditBody('');
    }
  }, [entry]);

  const handleResend = useCallback(async () => {
    setResendLoading(true);
    setResendError(null);
    setResendResponse(null);

    try {
      const headers: Record<string, string> = {};
      editHeaders.split('\n').forEach((line) => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.substring(0, idx).trim();
          const value = line.substring(idx + 1).trim();
          if (key) headers[key] = value;
        }
      });

      const result = await window.electronAPI.client.resend({
        method: editMethod,
        url: editUrl,
        headers,
        body: editBody || undefined,
      });
      setResendResponse(result);
    } catch (err: any) {
      setResendError(err.message || 'Request failed');
    } finally {
      setResendLoading(false);
    }
  }, [editMethod, editUrl, editHeaders, editBody]);

  // Load snippets when tab or language changes
  useEffect(() => {
    if (tab !== 'snippets') return;

    let cancelled = false;
    setSnippetLoading(true);

    window.electronAPI.snippets
      .generate(snippetLanguage, {
        method: entry.request.method,
        url: entry.request.url,
        headers: entry.request.headers,
        body: entry.request.body
          ? typeof entry.request.body === 'string'
            ? entry.request.body
            : entry.request.body.toString('utf-8')
          : undefined,
      })
      .then((code) => {
        if (!cancelled) {
          setSnippetCode(code);
          setSnippetLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnippetCode('// Failed to generate snippet');
          setSnippetLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab, snippetLanguage, entry]);

  // Load performance analysis when tab changes
  useEffect(() => {
    if (tab !== 'performance') return;
    if (!entry.response) return;

    let cancelled = false;
    setPerfLoading(true);
    setPerfError(null);

    window.electronAPI.performance
      .analyze(entry)
      .then((analysis) => {
        if (!cancelled) {
          setPerfAnalysis(analysis);
          setPerfLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPerfError(err.message || 'Analysis failed');
          setPerfLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab, entry]);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleCopyCurl = useCallback(async () => {
    const curl = generateCurlCommand(entry);
    await navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    setShowExportMenu(false);
    setTimeout(() => setCopiedCurl(false), 2000);
  }, [entry]);

  const handleCopySnippet = useCallback(async () => {
    await navigator.clipboard.writeText(snippetCode);
    setSnippetCopied(true);
    setTimeout(() => setSnippetCopied(false), 2000);
  }, [snippetCode]);

  const handleExportSnippet = useCallback(() => {
    setTab('snippets');
    setShowExportMenu(false);
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = () => setShowExportMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showExportMenu]);

  // Organize headers into categories
  const categorizeHeaders = useCallback(
    (headers: Record<string, string | string[] | undefined>): Record<string, [string, string | string[] | undefined][]> => {
      const categories: Record<string, [string, string | string[] | undefined][]> = {};

      for (const [key, value] of Object.entries(headers)) {
        const category = getHeaderCategory(key);
        if (!categories[category]) categories[category] = [];
        categories[category].push([key, value]);
      }

      // Sort categories: known first, Other last
      const ordered: Record<string, [string, string | string[] | undefined][]> = {};
      const knownOrder = ['General', 'Content', 'Caching', 'Auth & Cookies', 'Security', 'CORS', 'Client Info'];
      for (const cat of knownOrder) {
        if (categories[cat]) ordered[cat] = categories[cat];
      }
      if (categories['Other']) ordered['Other'] = categories['Other'];

      return ordered;
    },
    []
  );

  const detectedLanguage = bodyFormat === 'hex' ? 'plaintext' : detectLanguage(getContentType());
  const currentBody = data?.body ?? null;
  const formattedBody = formatBodyContent(currentBody, getContentType(), bodyFormat);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'headers', label: 'Headers' },
    { key: 'body', label: 'Body' },
    { key: 'timing', label: 'Timing' },
    { key: 'performance', label: 'Performance' },
    { key: 'snippets', label: 'Snippets' },
  ];

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded method-${request.method.toLowerCase()}`}>
              {request.method}
            </span>
            <span className={`font-mono text-sm font-semibold status-${status}`}>
              {response?.statusCode || status}
              {response?.statusMessage ? ` ${response.statusMessage}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Edit & Resend button */}
            <button
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                } else {
                  enterEditMode();
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                editMode
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {editMode ? 'Cancel Edit' : 'Edit & Resend'}
            </button>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExportMenu(!showExportMenu);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1"
              >
                Export
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                  <button
                    onClick={handleCopyCurl}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {copiedCurl ? 'Copied!' : 'Copy as cURL'}
                  </button>
                  <button
                    onClick={handleExportSnippet}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Export as code snippet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="text-sm font-mono text-gray-600 truncate" title={request.url}>
          {request.url}
        </p>
        {entry.matchedRule && (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
              Rule: {entry.matchedRule}
            </span>
          </div>
        )}
      </div>

      {/* Edit & Resend panel */}
      {editMode && (
        <div className="border-b border-gray-200 bg-blue-50 p-4 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <select
              value={editMethod}
              onChange={(e) => setEditMethod(e.target.value)}
              className="px-2 py-1.5 text-sm font-mono font-bold border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm font-mono border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="URL"
            />
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="px-4 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resendLoading ? 'Sending...' : 'Send'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Headers (one per line, Key: Value)</label>
            <textarea
              value={editHeaders}
              onChange={(e) => setEditHeaders(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
              placeholder="Content-Type: application/json"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
            <div className="h-40 border border-gray-300 rounded overflow-hidden">
              <Editor
                height="100%"
                language="json"
                value={editBody}
                onChange={(val) => setEditBody(val || '')}
                options={{
                  readOnly: false,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  fontSize: 13,
                  automaticLayout: true,
                }}
                theme="vs-dark"
              />
            </div>
          </div>

          {resendResponse && (
            <div className="bg-green-100 border border-green-300 rounded p-3">
              <div className="text-sm font-medium text-green-800 mb-1">
                Response: {resendResponse.statusCode} {resendResponse.statusMessage}
              </div>
              <div className="text-xs text-green-700 font-mono">
                Size: {formatBytes(resendResponse.size)} | Time: {resendResponse.timing.total}ms
              </div>
            </div>
          )}

          {resendError && (
            <div className="bg-red-100 border border-red-300 rounded p-3">
              <div className="text-sm font-medium text-red-800">Error: {resendError}</div>
            </div>
          )}
        </div>
      )}

      {/* Request/Response toggle */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
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
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'text-blue-600 bg-white border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {/* Headers Tab */}
        {tab === 'headers' && data && (
          <div className="p-4 space-y-4">
            {Object.keys(data.headers || {}).length === 0 ? (
              <p className="text-gray-400 text-sm">No headers</p>
            ) : (
              Object.entries(categorizeHeaders(data.headers || {})).map(([category, headers]) => (
                <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {category}
                      <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
                        ({headers.length})
                      </span>
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        collapsedCategories.has(category) ? '' : 'rotate-180'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!collapsedCategories.has(category) && (
                    <div className="divide-y divide-gray-100">
                      {headers.map(([key, value]) => (
                        <div key={key} className="px-3 py-2 hover:bg-gray-50 transition-colors group">
                          <div className="flex gap-2 text-sm font-mono">
                            <span className={`font-medium flex-shrink-0 ${getHeaderColor(key)}`}>
                              {key}:
                            </span>
                            <span className="text-gray-700 break-all">
                              {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                            </span>
                          </div>
                          {HEADER_DESCRIPTIONS[key.toLowerCase()] && (
                            <p className="text-xs text-gray-400 mt-0.5 hidden group-hover:block">
                              {HEADER_DESCRIPTIONS[key.toLowerCase()]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Body Tab */}
        {tab === 'body' && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-1">
                {(['formatted', 'raw', 'hex'] as BodyFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setBodyFormat(fmt)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                      bodyFormat === fmt
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              {currentBody && (
                <span className="text-xs text-gray-400 font-mono">
                  {detectLanguage(getContentType())}
                  {' | '}
                  {formatBytes(typeof currentBody === 'string' ? currentBody.length : currentBody.length)}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {currentBody ? (
                <Editor
                  height="100%"
                  language={detectedLanguage}
                  value={formattedBody}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    fontSize: 13,
                    automaticLayout: true,
                  }}
                  theme="vs-dark"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400 text-sm">No body content</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timing Tab */}
        {tab === 'timing' && (
          <div className="p-4 space-y-3">
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
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Waterfall</h4>
                  <div className="space-y-2">
                    {[
                      { label: 'DNS', value: timing.dns, color: 'bg-purple-400' },
                      { label: 'TCP', value: timing.tcp, color: 'bg-orange-400' },
                      { label: 'TLS', value: timing.tls, color: 'bg-yellow-400' },
                      { label: 'TTFB', value: timing.firstByte, color: 'bg-green-400' },
                      { label: 'Download', value: timing.download, color: 'bg-blue-400' },
                    ]
                      .filter((item) => item.value !== undefined && item.value > 0)
                      .map((item) => {
                        const percent = ((item.value! / timing.total) * 100).toFixed(1);
                        return (
                          <div key={item.label} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                              {item.label}
                            </span>
                            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden relative">
                              <div
                                className={`${item.color} h-full rounded transition-all`}
                                style={{ width: `${percent}%`, minWidth: item.value! > 0 ? '2px' : '0' }}
                              />
                            </div>
                            <span className="text-xs font-mono text-gray-600 w-20 text-right flex-shrink-0">
                              {item.value} ms ({percent}%)
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {[
                      { label: 'DNS', color: 'bg-purple-400' },
                      { label: 'TCP', color: 'bg-orange-400' },
                      { label: 'TLS', color: 'bg-yellow-400' },
                      { label: 'TTFB', color: 'bg-green-400' },
                      { label: 'Download', color: 'bg-blue-400' },
                    ].map((item) => (
                      <span key={item.label} className="flex items-center gap-1 text-xs text-gray-500">
                        <span className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
                        {item.label}
                      </span>
                    ))}
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

        {/* Performance Tab */}
        {tab === 'performance' && (
          <div className="p-4 space-y-6">
            {!entry.response ? (
              <p className="text-gray-400 text-sm">No response data available for analysis</p>
            ) : perfLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                <span className="ml-3 text-sm text-gray-500">Analyzing performance...</span>
              </div>
            ) : perfError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">Failed to analyze: {perfError}</p>
              </div>
            ) : perfAnalysis ? (
              <>
                {/* Compression */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">C</span>
                      Compression
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Compressed:</span>
                        <span className={`ml-2 font-medium ${perfAnalysis.compression.isCompressed ? 'text-green-600' : 'text-yellow-600'}`}>
                          {perfAnalysis.compression.isCompressed ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {perfAnalysis.compression.encoding && (
                        <div>
                          <span className="text-gray-500">Encoding:</span>
                          <span className="ml-2 font-mono text-gray-700">{perfAnalysis.compression.encoding}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Original:</span>
                        <span className="ml-2 font-mono text-gray-700">{formatBytes(perfAnalysis.compression.originalSize)}</span>
                      </div>
                      {perfAnalysis.compression.isCompressed && (
                        <div>
                          <span className="text-gray-500">Compressed:</span>
                          <span className="ml-2 font-mono text-gray-700">{formatBytes(perfAnalysis.compression.compressedSize)}</span>
                        </div>
                      )}
                    </div>
                    {perfAnalysis.compression.isCompressed && perfAnalysis.compression.savingsPercent > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Savings</span>
                          <span>{perfAnalysis.compression.savingsPercent.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${perfAnalysis.compression.savingsPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {perfAnalysis.compression.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {perfAnalysis.compression.suggestions.map((s, i) => (
                          <SuggestionItem key={i} text={s} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Caching */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">$</span>
                      Caching
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Cacheable:</span>
                        <span className={`ml-2 font-medium ${perfAnalysis.caching.isCacheable ? 'text-green-600' : 'text-yellow-600'}`}>
                          {perfAnalysis.caching.isCacheable ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {perfAnalysis.caching.cacheControl && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Cache-Control:</span>
                          <span className="ml-2 font-mono text-gray-700 text-xs">{perfAnalysis.caching.cacheControl}</span>
                        </div>
                      )}
                      {perfAnalysis.caching.maxAge !== null && (
                        <div>
                          <span className="text-gray-500">Max-Age:</span>
                          <span className="ml-2 font-mono text-gray-700">{perfAnalysis.caching.maxAge}s</span>
                        </div>
                      )}
                      {perfAnalysis.caching.etag && (
                        <div>
                          <span className="text-gray-500">ETag:</span>
                          <span className="ml-2 font-mono text-gray-700 text-xs">{perfAnalysis.caching.etag}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {perfAnalysis.caching.isPublic && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">public</span>
                      )}
                      {perfAnalysis.caching.isPrivate && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">private</span>
                      )}
                      {perfAnalysis.caching.noStore && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">no-store</span>
                      )}
                      {perfAnalysis.caching.noCache && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">no-cache</span>
                      )}
                      {perfAnalysis.caching.mustRevalidate && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">must-revalidate</span>
                      )}
                    </div>
                    {perfAnalysis.caching.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {perfAnalysis.caching.suggestions.map((s, i) => (
                          <SuggestionItem key={i} text={s} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Security */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">S</span>
                      Security Headers
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2 text-sm">
                      {[
                        { label: 'HTTPS', ok: perfAnalysis.security.isHttps },
                        { label: 'HSTS', ok: perfAnalysis.security.hasHsts },
                        { label: 'CSP', ok: perfAnalysis.security.hasCsp },
                        { label: 'X-Frame-Options', ok: perfAnalysis.security.hasXFrameOptions },
                        { label: 'X-Content-Type-Options', ok: perfAnalysis.security.hasXContentTypeOptions },
                        { label: 'Referrer-Policy', ok: perfAnalysis.security.hasReferrerPolicy },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-1">
                          <span className="text-gray-600">{item.label}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            item.ok
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {item.ok ? 'Present' : 'Missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {perfAnalysis.security.hasHsts && perfAnalysis.security.hstsMaxAge !== null && (
                      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                        <div>HSTS max-age: {perfAnalysis.security.hstsMaxAge}s</div>
                        <div className="flex gap-2">
                          {perfAnalysis.security.hstsIncludesSubdomains && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded">includeSubDomains</span>
                          )}
                          {perfAnalysis.security.hstsPreload && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded">preload</span>
                          )}
                        </div>
                      </div>
                    )}
                    {perfAnalysis.security.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {perfAnalysis.security.suggestions.map((s, i) => (
                          <SuggestionItem key={i} text={s} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Overall suggestions */}
                {perfAnalysis.suggestions.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-700">Overall Suggestions</h3>
                    </div>
                    <div className="p-4">
                      {perfAnalysis.suggestions.map((s, i) => (
                        <SuggestionItem key={i} text={s} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Snippets Tab */}
        {tab === 'snippets' && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <select
                value={snippetLanguage}
                onChange={(e) => setSnippetLanguage(e.target.value as SnippetLanguage)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {SNIPPET_LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleCopySnippet}
                disabled={snippetLoading || !snippetCode}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {snippetCopied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {snippetLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <span className="ml-3 text-sm text-gray-500">Generating snippet...</span>
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={snippetLanguageToMonaco(snippetLanguage)}
                  value={snippetCode}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    fontSize: 13,
                    automaticLayout: true,
                  }}
                  theme="vs-dark"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
