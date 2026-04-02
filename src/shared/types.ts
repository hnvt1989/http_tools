// Traffic Types
export interface RequestData {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | string | null;
  startTime: number;
}

export interface ResponseData {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | string | null;
  endTime: number;
  httpVersion?: string;
}

export interface TimingData {
  start: number;
  dns?: number;
  tcp?: number;
  tls?: number;
  firstByte?: number;
  download?: number;
  end: number;
  total: number;
}

export type TrafficStatus = 'pending' | 'active' | 'complete' | 'error' | 'blocked' | 'mocked';

export interface TrafficEntry {
  id: string;
  request: RequestData;
  response: ResponseData | null;
  protocol: 'http' | 'https' | 'ws' | 'wss';
  status: TrafficStatus;
  error?: string;
  timing?: TimingData;
  matchedRule?: string;
  tags?: string[];
}

// Rule Types
export type RuleType = 'mock' | 'rewrite' | 'breakpoint' | 'block';

export interface RuleMatcher {
  urlPattern: string;
  methods?: string[];
  headers?: Record<string, string>;
  bodyContains?: string;
}

export interface BaseRule {
  id: string;
  name: string;
  type: RuleType;
  enabled: boolean;
  priority: number;
  matcher: RuleMatcher;
  createdAt: number;
  updatedAt: number;
}

export interface MockRule extends BaseRule {
  type: 'mock';
  response: {
    statusCode: number;
    statusMessage?: string;
    headers: Record<string, string>;
    body: string;
    bodyEncoding?: 'text' | 'base64' | 'json';
    delay?: number;
  };
}

export interface RewriteRule extends BaseRule {
  type: 'rewrite';
  modifications: {
    request?: {
      url?: string;
      method?: string;
      headers?: Record<string, string | null>;
      body?: string;
    };
    response?: {
      statusCode?: number;
      statusMessage?: string;
      headers?: Record<string, string | null>;
      body?: string;
    };
  };
}

export interface BreakpointRule extends BaseRule {
  type: 'breakpoint';
  breakOn: 'request' | 'response' | 'both';
}

export interface BlockRule extends BaseRule {
  type: 'block';
  errorCode?: number;
  errorMessage?: string;
}

export type Rule = MockRule | RewriteRule | BreakpointRule | BlockRule;

// Proxy Types
export interface ProxyStatus {
  running: boolean;
  port: number;
  startedAt?: number;
  totalRequests: number;
  activeConnections: number;
}

export interface ProxyConfig {
  port: number;
  enableHttps: boolean;
  autoStart: boolean;
}

// HTTP Client Types
export interface ClientRequest {
  id?: string;
  name?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyType?: 'none' | 'text' | 'json' | 'form' | 'binary';
  timeout?: number;
  followRedirects?: boolean;
}

export interface ClientResponse {
  id: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | string;
  timing: TimingData;
  size: number;
}

export interface SavedRequest extends ClientRequest {
  id: string;
  name: string;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RequestFolder {
  id: string;
  name: string;
  parentId?: string;
  order: number;
}

// Certificate Types
export interface CACertificate {
  cert: string;
  key: string;
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
}

// Settings Types
export interface AppSettings {
  proxy: ProxyConfig;
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  maxTrafficEntries: number;
  autoTrustCertificate: boolean;
}

// Breakpoint Types
export interface BreakpointPause {
  id: string;
  trafficId: string;
  ruleId: string;
  type: 'request' | 'response';
  data: RequestData | ResponseData;
  timestamp: number;
}

// Filter Types
export interface TrafficFilter {
  methods?: string[];
  statusCodes?: string[];
  contentTypes?: string[];
  hosts?: string[];
  search?: string;
  showOnlyErrors?: boolean;
  showOnlyMocked?: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  id: string;
  direction: 'sent' | 'received';
  opcode: number; // 1=text, 2=binary, 8=close, 9=ping, 10=pong
  data: string | Buffer;
  timestamp: number;
  size: number;
}

export interface WebSocketEntry {
  id: string;
  url: string;
  protocol: 'ws' | 'wss';
  status: 'connecting' | 'open' | 'closed' | 'error';
  request: RequestData;
  messages: WebSocketMessage[];
  closeCode?: number;
  closeReason?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

// HAR Types
export interface HarLog {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: any[];
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
    postData?: { mimeType: string; text: string; params?: { name: string; value: string }[] };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: any[];
    headers: { name: string; value: string }[];
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, any>;
  timings: {
    send: number;
    wait: number;
    receive: number;
    dns?: number;
    connect?: number;
    ssl?: number;
    blocked?: number;
  };
  comment?: string;
}

// Performance Analysis Types
export interface PerformanceAnalysis {
  compression: {
    isCompressed: boolean;
    encoding: string | null;
    originalSize: number;
    compressedSize: number;
    savingsPercent: number;
    suggestions: string[];
  };
  caching: {
    isCacheable: boolean;
    cacheControl: string | null;
    maxAge: number | null;
    expires: string | null;
    etag: string | null;
    lastModified: string | null;
    isPublic: boolean;
    isPrivate: boolean;
    noStore: boolean;
    noCache: boolean;
    mustRevalidate: boolean;
    suggestions: string[];
  };
  security: {
    isHttps: boolean;
    hasHsts: boolean;
    hstsMaxAge: number | null;
    hstsIncludesSubdomains: boolean;
    hstsPreload: boolean;
    hasCsp: boolean;
    csp: string | null;
    hasXFrameOptions: boolean;
    xFrameOptions: string | null;
    hasXContentTypeOptions: boolean;
    hasReferrerPolicy: boolean;
    referrerPolicy: string | null;
    suggestions: string[];
  };
  suggestions: string[];
}

// Code Snippet Languages
export type SnippetLanguage =
  | 'curl'
  | 'python'
  | 'javascript'
  | 'go'
  | 'ruby'
  | 'php'
  | 'java'
  | 'csharp'
  | 'rust'
  | 'httpie';

// Upstream Proxy Configuration
export interface UpstreamProxy {
  enabled: boolean;
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

// Extended App Settings
export interface AppSettings {
  proxy: ProxyConfig;
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  maxTrafficEntries: number;
  autoTrustCertificate: boolean;
  upstreamProxy?: UpstreamProxy;
  tlsPassthroughDomains?: string[];
}
