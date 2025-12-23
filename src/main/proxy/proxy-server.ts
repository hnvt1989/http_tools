import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import stream from 'stream';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { CertGenerator } from '../certificates/cert-generator';
import { RuleEngine } from '../rules/rule-engine';
import type {
  CACertificate,
  TrafficEntry,
  RequestData,
  ResponseData,
  ProxyStatus,
  BreakpointPause,
} from '../../shared/types';

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

  constructor(options: ProxyServerOptions) {
    super();
    this.options = options;
    this.certGenerator = new CertGenerator(options.ca);
    this.ruleEngine = options.ruleEngine;
  }

  async start(): Promise<void> {
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

  // Domains that should bypass MITM (passthrough mode) due to TLS fingerprinting
  // These domains use aggressive bot detection that detects Node.js TLS fingerprints
  private static readonly PASSTHROUGH_DOMAINS = [
    // ID.me domains
    'idmelabs.com',
    'id.me',
    // VA authentication domains
    'eauth.va.gov',
    'sqa.eauth.va.gov',
    // VA website and API domains
    'staging.va.gov',
    'staging-api.va.gov',
    'va.gov',
    'api.va.gov',
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
    const id = uuid();
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
    initialData: Buffer
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
        const [method, path, httpVersion] = requestLine.split(' ');

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
    return new Promise((resolve, reject) => {
      // Filter out hop-by-hop headers that shouldn't be forwarded
      const filteredRequestHeaders = this.filterHopByHopHeaders(headers);

      const options: https.RequestOptions = {
        hostname,
        port,
        path,
        method,
        headers: filteredRequestHeaders,
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
          // Remove transfer-encoding and content-length since we've de-chunked the response
          // We'll set our own content-length based on actual body size
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
