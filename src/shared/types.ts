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
