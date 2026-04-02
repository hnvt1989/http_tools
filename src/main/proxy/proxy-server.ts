import http from 'http';
import http2 from 'http2';
import https from 'https';
import net from 'net';
import tls from 'tls';
import stream from 'stream';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import initCycleTLS, { CycleTLSClient } from 'cycletls';
import { CertGenerator } from '../certificates/cert-generator';
import { RuleEngine } from '../rules/rule-engine';
import type {
  CACertificate,
  TrafficEntry,
  RequestData,
  ProxyStatus,
  BreakpointPause,
} from '../../shared/types';

// Chrome 120 JA3 fingerprint for TLS spoofing
const CHROME_JA3 = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0';
const CHROME_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ProxyServerOptions {
  port: number;
  ca: CACertificate;
  ruleEngine: RuleEngine;
}

interface PendingBreakpoint {
  id: string;
  trafficId: string;
  ruleId: string;
  type: 'request' | 'response';
  resolve: (data?: any) => void;
  reject: (error: Error) => void;
}

export class ProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  private options: ProxyServerOptions;
  private certGenerator: CertGenerator;
  private ruleEngine: RuleEngine;
  private activeConnections: Map<string, TrafficEntry> = new Map();
  private pendingBreakpoints: Map<string, PendingBreakpoint> = new Map();
  private totalRequests = 0;
  private startedAt?: number;
  private cycleTLS: CycleTLSClient | null = null;
  private useCycleTLS = true; // Use CycleTLS for browser-like TLS fingerprint
  private http2SupportCache: Map<string, { supported: boolean; timestamp: number }> = new Map();
  private static readonly HTTP2_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(options: ProxyServerOptions) {
    super();
    this.options = options;
    this.certGenerator = new CertGenerator(options.ca);
    this.ruleEngine = options.ruleEngine;
  }

  async start(): Promise<void> {
    // Initialize CycleTLS for browser-like TLS fingerprinting
    if (this.useCycleTLS) {
      try {
        this.cycleTLS = await initCycleTLS();
        console.log('CycleTLS initialized - using Chrome TLS fingerprint');
      } catch (error) {
        console.error('Failed to initialize CycleTLS, falling back to Node.js TLS:', error);
        this.useCycleTLS = false;
      }
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Handle CONNECT method for HTTPS tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket, head);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.options.port, () => {
        this.startedAt = Date.now();
        this.emit('started', { port: this.options.port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Clean up CycleTLS
    if (this.cycleTLS) {
      try {
        await this.cycleTLS.exit();
      } catch {
        // Ignore cleanup errors
      }
      this.cycleTLS = null;
    }

    return new Promise((resolve) => {
      // Reject all pending breakpoints
      for (const bp of this.pendingBreakpoints.values()) {
        bp.reject(new Error('Proxy server stopped'));
      }
      this.pendingBreakpoints.clear();
      this.activeConnections.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.startedAt = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getStatus(): ProxyStatus {
    return {
      running: this.server !== null,
      port: this.options.port,
      startedAt: this.startedAt,
      totalRequests: this.totalRequests,
      activeConnections: this.activeConnections.size,
    };
  }

  resumeBreakpoint(id: string, modifiedData?: any): void {
    const bp = this.pendingBreakpoints.get(id);
    if (bp) {
      bp.resolve(modifiedData);
      this.pendingBreakpoints.delete(id);
    }
  }

  dropBreakpoint(id: string): void {
    const bp = this.pendingBreakpoints.get(id);
    if (bp) {
      bp.reject(new Error('Request dropped by user'));
      this.pendingBreakpoints.delete(id);
    }
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const id = uuid();
    this.totalRequests++;

    try {
      // Parse the full URL
      const targetUrl = new URL(req.url || '');

      // Capture request body
      const bodyChunks: Buffer[] = [];
      req.on('data', (chunk) => bodyChunks.push(chunk));

      await new Promise<void>((resolve) => req.on('end', resolve));

      const body = Buffer.concat(bodyChunks);

      // Create traffic entry
      const entry: TrafficEntry = {
        id,
        protocol: 'http',
        status: 'pending',
        request: {
          method: req.method || 'GET',
          url: targetUrl.href,
          headers: req.headers as Record<string, string>,
          body: body.length > 0 ? body : null,
          startTime: Date.now(),
        },
        response: null,
      };

      this.activeConnections.set(id, entry);
      this.emit('traffic:new', entry);

      // Check rules
      const ruleResult = this.ruleEngine.processRequest(entry);

      if (ruleResult.action === 'block') {
        entry.status = 'blocked';
        entry.matchedRule = ruleResult.rule?.id;
        res.writeHead(ruleResult.rule?.type === 'block' ? (ruleResult.rule as any).errorCode || 403 : 403);
        res.end(ruleResult.rule?.type === 'block' ? (ruleResult.rule as any).errorMessage || 'Blocked' : 'Blocked');
        this.emit('traffic:update', entry);
        return;
      }

      if (ruleResult.action === 'mock') {
        await this.handleMockResponse(entry, ruleResult, res);
        return;
      }

      if (ruleResult.action === 'breakpoint') {
        await this.handleBreakpoint(entry, ruleResult, 'request');
      }

      // Apply rewrites if any
      let finalRequest = entry.request;
      if (ruleResult.action === 'rewrite' && ruleResult.rule?.type === 'rewrite') {
        finalRequest = this.applyRequestRewrite(entry.request, ruleResult.rule.modifications.request);
      }

      // Forward request to target
      await this.forwardRequest(entry, finalRequest, targetUrl, res);
    } catch (error: any) {
      const entry = this.activeConnections.get(id);
      if (entry) {
        entry.status = 'error';
        entry.error = error.message;
        this.emit('traffic:update', entry);
      }
      res.writeHead(502);
      res.end(`Proxy Error: ${error.message}`);
    } finally {
      this.activeConnections.delete(id);
    }
  }

  // Domains that should bypass MITM (passthrough mode)
  // With CycleTLS (Chrome TLS fingerprint), most sites work without passthrough
  // Only keep domains with very aggressive bot detection that checks beyond TLS
  private static readonly PASSTHROUGH_DOMAINS = [
    // ID.me domains (DataDome + additional checks)
    'idmelabs.com',
    'id.me',
    // Login.gov domains
    'login.gov',
    'secure.login.gov',
    'idp.int.identitysandbox.gov',
  ];

  private shouldPassthrough(hostname: string): boolean {
    return ProxyServer.PASSTHROUGH_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  }

  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: stream.Duplex,
    head: Buffer
  ): Promise<void> {
    const [hostname, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr) || 443;
    this.totalRequests++;

    // Check if this domain should bypass MITM (passthrough mode)
    if (this.shouldPassthrough(hostname)) {
      console.log(`Passthrough mode for ${hostname} (TLS fingerprint protection)`);
      this.handlePassthrough(clientSocket, hostname, port, head);
      return;
    }

    try {
      // Generate certificate for this host
      const hostCert = this.certGenerator.generateForHost(hostname);

      // Check if socket is still writable before writing
      if (!clientSocket.writable) {
        console.log(`Client socket closed before CONNECT response for ${hostname}`);
        return;
      }

      // Tell client the connection is established
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      // Create TLS socket with our generated certificate
      const tlsSocket = new tls.TLSSocket(clientSocket as net.Socket, {
        isServer: true,
        key: hostCert.key,
        cert: hostCert.cert,
      });

      tlsSocket.on('error', (err) => {
        console.error(`TLS error for ${hostname}:`, err.message);
      });

      // Handle HTTPS requests through the TLS socket
      this.handleHttpsConnection(tlsSocket, hostname, port, head);
    } catch (error: any) {
      console.error(`CONNECT error for ${hostname}:`, error.message);
      if (clientSocket.writable) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      }
    }
  }

  /**
   * Passthrough mode - tunnel raw TCP without MITM.
   * Preserves the browser's TLS fingerprint for sites with aggressive bot detection.
   * Traffic cannot be inspected in this mode.
   */
  private handlePassthrough(
    clientSocket: stream.Duplex,
    hostname: string,
    port: number,
    head: Buffer
  ): void {
    // Check if client socket is still valid
    if (!clientSocket.writable) {
      console.log(`Client socket already closed for passthrough to ${hostname}`);
      return;
    }

    const serverSocket = net.connect(port, hostname, () => {
      if (!clientSocket.writable) {
        serverSocket.destroy();
        return;
      }
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        serverSocket.write(head);
      }
      // Pipe data bidirectionally
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`Passthrough error for ${hostname}:`, err.message);
      if (clientSocket.writable) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      }
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });

    clientSocket.on('close', () => {
      serverSocket.destroy();
    });
  }

  private handleHttpsConnection(
    tlsSocket: tls.TLSSocket,
    hostname: string,
    port: number,
    _initialData: Buffer
  ): void {
    let requestBuffer = Buffer.alloc(0);
    let processingRequest = false;

    tlsSocket.on('data', async (data) => {
      requestBuffer = Buffer.concat([requestBuffer, data]);

      if (processingRequest) return;

      // Try to parse HTTP request from buffer
      const requestEnd = requestBuffer.indexOf('\r\n\r\n');
      if (requestEnd === -1) return;

      processingRequest = true;

      try {
        const headerPart = requestBuffer.slice(0, requestEnd).toString();
        const [requestLine, ...headerLines] = headerPart.split('\r\n');
        const [method, path] = requestLine.split(' ');

        // Parse headers
        const headers: Record<string, string> = {};
        for (const line of headerLines) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).toLowerCase();
            const value = line.slice(colonIndex + 1).trim();
            headers[key] = value;
          }
        }

        // Get body if Content-Length is present
        let body: Buffer | null = null;
        const contentLength = parseInt(headers['content-length'] || '0');
        const bodyStart = requestEnd + 4;

        if (contentLength > 0) {
          // Wait for complete body
          while (requestBuffer.length < bodyStart + contentLength) {
            const chunk = await new Promise<Buffer>((resolve) => {
              tlsSocket.once('data', resolve);
            });
            requestBuffer = Buffer.concat([requestBuffer, chunk]);
          }
          body = requestBuffer.slice(bodyStart, bodyStart + contentLength);
        }

        // Create traffic entry
        const id = uuid();
        const url = `https://${hostname}${port !== 443 ? `:${port}` : ''}${path}`;

        const entry: TrafficEntry = {
          id,
          protocol: 'https',
          status: 'pending',
          request: {
            method,
            url,
            headers,
            body,
            startTime: Date.now(),
          },
          response: null,
        };

        this.activeConnections.set(id, entry);
        this.emit('traffic:new', entry);

        // Check rules
        const ruleResult = this.ruleEngine.processRequest(entry);

        if (ruleResult.action === 'block') {
          entry.status = 'blocked';
          const response = `HTTP/1.1 403 Forbidden\r\nContent-Length: 7\r\n\r\nBlocked`;
          tlsSocket.write(response);
          this.emit('traffic:update', entry);
          requestBuffer = requestBuffer.slice(bodyStart + contentLength);
          processingRequest = false;
          return;
        }

        if (ruleResult.action === 'mock' && ruleResult.mockResponse) {
          entry.status = 'mocked';
          entry.matchedRule = ruleResult.rule?.id;

          const mockRes = ruleResult.mockResponse;
          if (mockRes.delay) {
            await new Promise((r) => setTimeout(r, mockRes.delay));
          }

          const responseHeaders = Object.entries(mockRes.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n');
          const responseBody = mockRes.body || '';
          const response = `HTTP/1.1 ${mockRes.statusCode} ${mockRes.statusMessage || 'OK'}\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\n${responseHeaders}\r\n\r\n${responseBody}`;

          tlsSocket.write(response);

          entry.response = {
            statusCode: mockRes.statusCode,
            statusMessage: mockRes.statusMessage || 'OK',
            headers: mockRes.headers,
            body: responseBody,
            endTime: Date.now(),
          };
          this.emit('traffic:update', entry);

          requestBuffer = requestBuffer.slice(bodyStart + contentLength);
          processingRequest = false;
          return;
        }

        // Forward to actual server
        await this.forwardHttpsRequest(entry, tlsSocket, hostname, port, method, path, headers, body);

        requestBuffer = requestBuffer.slice(bodyStart + contentLength);
        processingRequest = false;
      } catch (error: any) {
        tlsSocket.end();
      }
    });

    tlsSocket.on('error', (err) => {
      console.error(`HTTPS connection error for ${hostname}:`, err.message);
    });
  }

  // Headers that should not be forwarded to the target server
  private static readonly HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ]);

  private filterHopByHopHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
    const filtered: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!ProxyServer.HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  private async forwardHttpsRequest(
    entry: TrafficEntry,
    clientSocket: tls.TLSSocket,
    hostname: string,
    port: number,
    method: string,
    path: string,
    headers: Record<string, string>,
    body: Buffer | null
  ): Promise<void> {
    // Filter out hop-by-hop headers that shouldn't be forwarded
    const filteredRequestHeaders = this.filterHopByHopHeaders(headers);

    // Use CycleTLS if available for browser-like TLS fingerprint
    if (this.cycleTLS && this.useCycleTLS) {
      return this.forwardHttpsRequestWithCycleTLS(
        entry, clientSocket, hostname, port, method, path,
        filteredRequestHeaders as Record<string, string>, body
      );
    }

    // Try HTTP/2 if the target supports it
    const supportsH2 = await this.detectHttp2Support(hostname, port);
    if (supportsH2) {
      return this.forwardHttpsRequestWithHttp2(
        entry, clientSocket, hostname, port, method, path,
        filteredRequestHeaders, body
      );
    }

    // Fall back to HTTP/1.1
    return this.forwardHttpsRequestWithNode(
      entry, clientSocket, hostname, port, method, path,
      filteredRequestHeaders, body
    );
  }

  /**
   * Forward HTTPS request using CycleTLS (Chrome TLS fingerprint)
   */
  private async forwardHttpsRequestWithCycleTLS(
    entry: TrafficEntry,
    clientSocket: tls.TLSSocket,
    hostname: string,
    port: number,
    method: string,
    path: string,
    headers: Record<string, string>,
    body: Buffer | null
  ): Promise<void> {
    try {
      const url = `https://${hostname}${port !== 443 ? `:${port}` : ''}${path}`;

      // Prepare headers for CycleTLS (needs lowercase keys)
      const cycleTLSHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
          cycleTLSHeaders[key.toLowerCase()] = String(value);
        }
      }

      entry.status = 'active';
      this.emit('traffic:update', entry);

      const response = await this.cycleTLS!(url, {
        body: body ? body.toString() : '',
        ja3: CHROME_JA3,
        userAgent: cycleTLSHeaders['user-agent'] || CHROME_USER_AGENT,
        headers: cycleTLSHeaders,
        insecureSkipVerify: true, // Accept self-signed certs
      }, method.toLowerCase() as any);

      // CycleTLS returns data as string or object, convert to Buffer
      let responseBody: Buffer;
      if (typeof response.data === 'string') {
        responseBody = Buffer.from(response.data);
      } else if (Buffer.isBuffer(response.data)) {
        responseBody = response.data;
      } else {
        // JSON object
        responseBody = Buffer.from(JSON.stringify(response.data));
      }

      entry.response = {
        statusCode: response.status,
        statusMessage: '',
        headers: response.headers as Record<string, string>,
        body: responseBody,
        endTime: Date.now(),
      };
      entry.status = 'complete';
      entry.timing = {
        start: entry.request.startTime,
        end: entry.response.endTime,
        total: entry.response.endTime - entry.request.startTime,
      };
      this.emit('traffic:update', entry);

      // Forward response to client
      const headersToRemove = new Set(['transfer-encoding', 'content-length']);
      const filteredHeaders = Object.entries(response.headers)
        .filter(([k, v]) => v !== undefined && !headersToRemove.has(k.toLowerCase()))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n');

      const statusLine = `HTTP/1.1 ${response.status} OK\r\n`;
      const contentLengthHeader = `content-length: ${responseBody.length}`;

      clientSocket.write(`${statusLine}${filteredHeaders}\r\n${contentLengthHeader}\r\n\r\n`);
      clientSocket.write(responseBody);

      this.activeConnections.delete(entry.id);
    } catch (error: any) {
      entry.status = 'error';
      entry.error = error.message;
      this.emit('traffic:update', entry);
      clientSocket.end();
      this.activeConnections.delete(entry.id);
      throw error;
    }
  }

  /**
   * Detect if a server supports HTTP/2 via ALPN negotiation.
   * Results are cached per hostname with a TTL.
   */
  private async detectHttp2Support(hostname: string, port: number): Promise<boolean> {
    const cacheKey = `${hostname}:${port}`;
    const cached = this.http2SupportCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < ProxyServer.HTTP2_CACHE_TTL) {
      return cached.supported;
    }

    const supported = await new Promise<boolean>((resolve) => {
      const socket = tls.connect({
        host: hostname,
        port,
        ALPNProtocols: ['h2', 'http/1.1'],
        rejectUnauthorized: false,
        servername: hostname,
      }, () => {
        const protocol = socket.alpnProtocol;
        socket.destroy();
        resolve(protocol === 'h2');
      });
      socket.on('error', () => {
        resolve(false);
      });
      socket.setTimeout(3000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    this.http2SupportCache.set(cacheKey, { supported, timestamp: Date.now() });
    return supported;
  }

  /**
   * Forward HTTPS request using HTTP/2
   * Connects to the target via HTTP/2 and writes the response back
   * to the client socket in HTTP/1.1 format (since our MITM socket speaks HTTP/1.1).
   */
  private forwardHttpsRequestWithHttp2(
    entry: TrafficEntry,
    clientSocket: tls.TLSSocket,
    hostname: string,
    port: number,
    method: string,
    path: string,
    headers: Record<string, string | string[] | undefined>,
    body: Buffer | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const authority = `https://${hostname}${port !== 443 ? `:${port}` : ''}`;

      const client = http2.connect(authority, {
        rejectUnauthorized: false,
      });

      client.on('error', (error) => {
        entry.status = 'error';
        entry.error = error.message;
        this.emit('traffic:update', entry);
        clientSocket.end();
        this.activeConnections.delete(entry.id);
        client.close();
        reject(error);
      });

      // Build HTTP/2 headers from the request headers
      const h2Headers: Record<string, string | string[] | undefined> = {
        [http2.constants.HTTP2_HEADER_METHOD]: method,
        [http2.constants.HTTP2_HEADER_PATH]: path,
        [http2.constants.HTTP2_HEADER_AUTHORITY]: hostname,
        [http2.constants.HTTP2_HEADER_SCHEME]: 'https',
      };

      // Copy request headers, skipping HTTP/1.1-specific ones
      const skipHeaders = new Set(['host', 'connection', 'transfer-encoding', 'upgrade', 'http2-settings']);
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined && !skipHeaders.has(key.toLowerCase())) {
          h2Headers[key.toLowerCase()] = value as string;
        }
      }

      const req = client.request(h2Headers);

      entry.status = 'active';
      this.emit('traffic:update', entry);

      const responseChunks: Buffer[] = [];
      let responseHeaders: Record<string, string> = {};
      let statusCode = 0;

      req.on('response', (h2ResponseHeaders) => {
        statusCode = Number(h2ResponseHeaders[http2.constants.HTTP2_HEADER_STATUS]) || 0;

        // Convert HTTP/2 headers to HTTP/1.1 style headers
        for (const [key, value] of Object.entries(h2ResponseHeaders)) {
          // Skip HTTP/2 pseudo-headers
          if (!key.startsWith(':') && value !== undefined) {
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
          }
        }
      });

      req.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk);
      });

      req.on('end', () => {
        const responseBody = Buffer.concat(responseChunks);

        entry.response = {
          statusCode,
          statusMessage: '',
          headers: responseHeaders,
          body: responseBody,
          endTime: Date.now(),
          httpVersion: '2.0',
        };
        entry.status = 'complete';
        entry.timing = {
          start: entry.request.startTime,
          end: entry.response.endTime,
          total: entry.response.endTime - entry.request.startTime,
        };
        this.emit('traffic:update', entry);

        // Write response back to client in HTTP/1.1 format
        const headersToRemove = new Set(['transfer-encoding', 'content-length']);
        const filteredHeaders = Object.entries(responseHeaders)
          .filter(([k, v]) => v !== undefined && !headersToRemove.has(k.toLowerCase()))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n');

        const statusLine = `HTTP/1.1 ${statusCode} OK\r\n`;
        const contentLengthHeader = `content-length: ${responseBody.length}`;

        clientSocket.write(`${statusLine}${filteredHeaders}\r\n${contentLengthHeader}\r\n\r\n`);
        clientSocket.write(responseBody);

        this.activeConnections.delete(entry.id);
        client.close();
        resolve();
      });

      req.on('error', (error) => {
        entry.status = 'error';
        entry.error = error.message;
        this.emit('traffic:update', entry);
        clientSocket.end();
        this.activeConnections.delete(entry.id);
        client.close();
        reject(error);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * Forward HTTPS request using Node.js https (fallback)
   */
  private forwardHttpsRequestWithNode(
    entry: TrafficEntry,
    clientSocket: tls.TLSSocket,
    hostname: string,
    port: number,
    method: string,
    path: string,
    headers: Record<string, string | string[] | undefined>,
    body: Buffer | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname,
        port,
        path,
        method,
        headers,
        rejectUnauthorized: false, // We're a proxy, we accept all certs
        servername: hostname, // SNI - required for virtual hosts
      };

      const proxyReq = https.request(options, (proxyRes) => {
        entry.status = 'active';
        this.emit('traffic:update', entry);

        const responseChunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => responseChunks.push(chunk));

        proxyRes.on('end', () => {
          const responseBody = Buffer.concat(responseChunks);

          entry.response = {
            statusCode: proxyRes.statusCode || 0,
            statusMessage: proxyRes.statusMessage || '',
            headers: proxyRes.headers as Record<string, string>,
            body: responseBody,
            endTime: Date.now(),
          };
          entry.status = 'complete';
          entry.timing = {
            start: entry.request.startTime,
            end: entry.response.endTime,
            total: entry.response.endTime - entry.request.startTime,
          };
          this.emit('traffic:update', entry);

          // Forward response to client
          const headersToRemove = new Set(['transfer-encoding', 'content-length']);
          const filteredHeaders = Object.entries(proxyRes.headers)
            .filter(([k, v]) => v !== undefined && !headersToRemove.has(k.toLowerCase()))
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n');

          const statusLine = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
          const contentLengthHeader = `content-length: ${responseBody.length}`;

          clientSocket.write(`${statusLine}${filteredHeaders}\r\n${contentLengthHeader}\r\n\r\n`);
          clientSocket.write(responseBody);

          this.activeConnections.delete(entry.id);
          resolve();
        });
      });

      proxyReq.on('error', (error) => {
        entry.status = 'error';
        entry.error = error.message;
        this.emit('traffic:update', entry);
        clientSocket.end();
        this.activeConnections.delete(entry.id);
        reject(error);
      });

      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  }

  private async handleMockResponse(
    entry: TrafficEntry,
    ruleResult: any,
    res: http.ServerResponse
  ): Promise<void> {
    entry.status = 'mocked';
    entry.matchedRule = ruleResult.rule?.id;

    const mockRes = ruleResult.mockResponse;
    if (mockRes.delay) {
      await new Promise((r) => setTimeout(r, mockRes.delay));
    }

    res.writeHead(mockRes.statusCode, mockRes.statusMessage || 'OK', mockRes.headers);
    res.end(mockRes.body || '');

    entry.response = {
      statusCode: mockRes.statusCode,
      statusMessage: mockRes.statusMessage || 'OK',
      headers: mockRes.headers,
      body: mockRes.body || null,
      endTime: Date.now(),
    };
    entry.timing = {
      start: entry.request.startTime,
      end: entry.response.endTime,
      total: entry.response.endTime - entry.request.startTime,
    };
    this.emit('traffic:update', entry);
  }

  private async handleBreakpoint(
    entry: TrafficEntry,
    ruleResult: any,
    type: 'request' | 'response'
  ): Promise<any> {
    const breakpointId = uuid();
    const pause: BreakpointPause = {
      id: breakpointId,
      trafficId: entry.id,
      ruleId: ruleResult.rule?.id || '',
      type,
      data: type === 'request' ? entry.request : entry.response!,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const pending: PendingBreakpoint = {
        ...pause,
        resolve,
        reject,
      };
      this.pendingBreakpoints.set(breakpointId, pending);
      this.emit('breakpoint:paused', pause);
    });
  }

  private applyRequestRewrite(
    request: RequestData,
    modifications?: any
  ): RequestData {
    if (!modifications) return request;

    const modified = { ...request };

    if (modifications.url) {
      modified.url = modifications.url;
    }
    if (modifications.method) {
      modified.method = modifications.method;
    }
    if (modifications.headers) {
      modified.headers = { ...modified.headers };
      for (const [key, value] of Object.entries(modifications.headers)) {
        if (value === null) {
          delete modified.headers[key];
        } else {
          modified.headers[key] = value as string;
        }
      }
    }
    if (modifications.body !== undefined) {
      modified.body = modifications.body;
    }

    return modified;
  }

  private async forwardRequest(
    entry: TrafficEntry,
    request: RequestData,
    targetUrl: URL,
    res: http.ServerResponse
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Filter out hop-by-hop headers
      const filteredHeaders = this.filterHopByHopHeaders(request.headers);

      const options: http.RequestOptions = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 80,
        path: targetUrl.pathname + targetUrl.search,
        method: request.method,
        headers: filteredHeaders,
      };

      const proxyReq = http.request(options, (proxyRes) => {
        entry.status = 'active';
        this.emit('traffic:update', entry);

        const responseChunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => responseChunks.push(chunk));

        proxyRes.on('end', () => {
          const responseBody = Buffer.concat(responseChunks);

          entry.response = {
            statusCode: proxyRes.statusCode || 0,
            statusMessage: proxyRes.statusMessage || '',
            headers: proxyRes.headers as Record<string, string>,
            body: responseBody,
            endTime: Date.now(),
          };
          entry.status = 'complete';
          entry.timing = {
            start: entry.request.startTime,
            end: entry.response.endTime,
            total: entry.response.endTime - entry.request.startTime,
          };
          this.emit('traffic:update', entry);

          // Forward response to client
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          res.end(responseBody);

          this.activeConnections.delete(entry.id);
          resolve();
        });
      });

      proxyReq.on('error', (error) => {
        entry.status = 'error';
        entry.error = error.message;
        this.emit('traffic:update', entry);
        this.activeConnections.delete(entry.id);
        reject(error);
      });

      if (request.body) {
        proxyReq.write(request.body);
      }
      proxyReq.end();
    });
  }
}
