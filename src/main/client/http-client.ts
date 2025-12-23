import https from 'https';
import http from 'http';
import { URL } from 'url';
import { v4 as uuid } from 'uuid';
import type { ClientRequest, ClientResponse, TimingData } from '../../shared/types';

interface ActiveRequest {
  id: string;
  controller: AbortController;
}

export class HttpClient {
  private activeRequests: Map<string, ActiveRequest> = new Map();

  async send(request: ClientRequest): Promise<ClientResponse> {
    const id = request.id || uuid();
    const controller = new AbortController();

    this.activeRequests.set(id, { id, controller });

    try {
      const response = await this.executeRequest(request, id);
      return response;
    } finally {
      this.activeRequests.delete(id);
    }
  }

  cancel(id: string): void {
    const request = this.activeRequests.get(id);
    if (request) {
      request.controller.abort();
      this.activeRequests.delete(id);
    }
  }

  cancelAll(): void {
    for (const request of this.activeRequests.values()) {
      request.controller.abort();
    }
    this.activeRequests.clear();
  }

  private async executeRequest(
    request: ClientRequest,
    id: string
  ): Promise<ClientResponse> {
    return new Promise((resolve, reject) => {
      const timing: Partial<TimingData> = {
        start: Date.now(),
      };

      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        reject(new Error(`Invalid URL: ${request.url}`));
        return;
      }

      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions | https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: request.method,
        headers: {
          ...request.headers,
          // Set Content-Length if body is provided
          ...(request.body
            ? { 'Content-Length': Buffer.byteLength(request.body) }
            : {}),
        },
        timeout: request.timeout || 30000,
      };

      if (isHttps) {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = lib.request(options, (res) => {
        timing.firstByte = Date.now() - timing.start!;

        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          timing.end = Date.now();
          timing.download = timing.end - timing.start! - (timing.firstByte || 0);
          timing.total = timing.end - timing.start!;

          const body = Buffer.concat(chunks);

          resolve({
            id,
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers as Record<string, string | string[] | undefined>,
            body,
            timing: timing as TimingData,
            size: body.length,
          });
        });
      });

      req.on('error', (error) => {
        timing.end = Date.now();
        timing.total = timing.end - timing.start!;
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${request.timeout || 30000}ms`));
      });

      // Handle redirect manually if not following
      if (request.followRedirects === false) {
        req.on('response', (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            // Don't follow, just return the redirect response
          }
        });
      }

      // Write body if present
      if (request.body) {
        req.write(request.body);
      }

      req.end();
    });
  }
}
