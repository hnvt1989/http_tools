import { describe, it, expect } from 'vitest';
import { analyzePerformance } from '../src/main/export/performance-analyzer';
import type { TrafficEntry } from '../src/shared/types';

function makeEntry(overrides: Partial<TrafficEntry> = {}): TrafficEntry {
  return {
    id: 'perf-entry-1',
    request: {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: { 'accept': 'application/json' },
      body: null,
      startTime: 1700000000000,
    },
    response: {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': 'application/json',
      },
      body: '{"data":"value"}',
      endTime: 1700000000200,
    },
    protocol: 'https',
    status: 'complete',
    ...overrides,
  };
}

function largeTextBody(sizeBytes: number): string {
  return 'x'.repeat(sizeBytes);
}

// ---------- Compression Analysis ----------

describe('compression analysis', () => {
  it('should detect compressed response with content-encoding gzip', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
        body: 'compressed-data',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.compression.isCompressed).toBe(true);
    expect(result.compression.encoding).toBe('gzip');
  });

  it('should suggest compression for uncompressed large text response', () => {
    const body = largeTextBody(2048);
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        body,
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.compression.isCompressed).toBe(false);
    expect(result.compression.suggestions.length).toBeGreaterThan(0);
    expect(result.compression.suggestions[0]).toContain('not compressed');
    expect(result.compression.suggestions[0]).toContain('gzip');
  });

  it('should not suggest compression for small uncompressed response', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        body: '{"ok":true}', // small body, under 1024 bytes
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.compression.isCompressed).toBe(false);
    expect(result.compression.suggestions).toHaveLength(0);
  });

  it('should not suggest compression for non-compressible content types like image/png', () => {
    const body = largeTextBody(5000);
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'image/png',
        },
        body,
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.compression.suggestions).toHaveLength(0);
  });

  it('should suggest compression for text/html content over 1KB', () => {
    const body = largeTextBody(2000);
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body,
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.compression.suggestions.length).toBeGreaterThan(0);
  });

  it('should handle entry with no response', () => {
    const entry = makeEntry({ response: null });
    const result = analyzePerformance(entry);

    expect(result.compression.isCompressed).toBe(false);
    expect(result.compression.originalSize).toBe(0);
  });
});

// ---------- Caching Analysis ----------

describe('caching analysis', () => {
  it('should detect Cache-Control: max-age=3600 as cacheable', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=3600',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.isCacheable).toBe(true);
    expect(result.caching.maxAge).toBe(3600);
    expect(result.caching.isPublic).toBe(true);
    expect(result.caching.noStore).toBe(false);
  });

  it('should detect Cache-Control: no-store as not cacheable', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.isCacheable).toBe(false);
    expect(result.caching.noStore).toBe(true);
  });

  it('should detect ETag without Cache-Control as conditionally cacheable', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'etag': '"abc123"',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.isCacheable).toBe(true);
    expect(result.caching.etag).toBe('"abc123"');
    expect(result.caching.cacheControl).toBeNull();
  });

  it('should suggest caching for static content without cache headers', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/javascript',
        },
        body: 'var x = 1;',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.isCacheable).toBe(false);
    expect(result.caching.suggestions.length).toBeGreaterThan(0);
    expect(result.caching.suggestions[0]).toContain('static content');
  });

  it('should suggest longer max-age for static content with short max-age', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'text/css',
          'cache-control': 'public, max-age=60',
        },
        body: 'body { color: red; }',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.maxAge).toBe(60);
    const shortMaxAgeSuggestion = result.caching.suggestions.find(s =>
      s.includes('short max-age')
    );
    expect(shortMaxAgeSuggestion).toBeDefined();
  });

  it('should suggest ETag/Last-Modified for cacheable content without them', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=3600',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    const etagSuggestion = result.caching.suggestions.find(s =>
      s.includes('ETag')
    );
    expect(etagSuggestion).toBeDefined();
  });

  it('should parse private and must-revalidate directives', () => {
    const entry = makeEntry({
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'private, max-age=300, must-revalidate',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.caching.isPrivate).toBe(true);
    expect(result.caching.mustRevalidate).toBe(true);
    expect(result.caching.maxAge).toBe(300);
    expect(result.caching.isCacheable).toBe(true);
  });

  it('should handle entry with no response', () => {
    const entry = makeEntry({ response: null });
    const result = analyzePerformance(entry);

    expect(result.caching.isCacheable).toBe(false);
    expect(result.caching.cacheControl).toBeNull();
  });
});

// ---------- Security Analysis ----------

describe('security analysis', () => {
  it('should detect HTTPS response with all security headers', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'text/html',
          'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
          'content-security-policy': "default-src 'self'",
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
        },
        body: '<html></html>',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.isHttps).toBe(true);
    expect(result.security.hasHsts).toBe(true);
    expect(result.security.hstsMaxAge).toBe(31536000);
    expect(result.security.hstsIncludesSubdomains).toBe(true);
    expect(result.security.hstsPreload).toBe(true);
    expect(result.security.hasCsp).toBe(true);
    expect(result.security.csp).toBe("default-src 'self'");
    expect(result.security.hasXFrameOptions).toBe(true);
    expect(result.security.xFrameOptions).toBe('DENY');
    expect(result.security.hasXContentTypeOptions).toBe(true);
    expect(result.security.hasReferrerPolicy).toBe(true);
    expect(result.security.referrerPolicy).toBe('strict-origin-when-cross-origin');
    // No suggestions when all headers are present
    expect(result.security.suggestions).toHaveLength(0);
  });

  it('should suggest HTTPS for HTTP responses', () => {
    const entry = makeEntry({
      protocol: 'http',
      request: {
        method: 'GET',
        url: 'http://example.com/api',
        headers: {},
        body: null,
        startTime: 1700000000000,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.isHttps).toBe(false);
    const httpsSuggestion = result.security.suggestions.find(s =>
      s.includes('HTTPS')
    );
    expect(httpsSuggestion).toBeDefined();
  });

  it('should suggest HSTS when missing on HTTPS response', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.isHttps).toBe(true);
    expect(result.security.hasHsts).toBe(false);
    const hstsSuggestion = result.security.suggestions.find(s =>
      s.includes('HSTS') || s.includes('Strict-Transport-Security')
    );
    expect(hstsSuggestion).toBeDefined();
  });

  it('should suggest CSP for HTML response without it', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'strict-transport-security': 'max-age=31536000',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'x-frame-options': 'DENY',
        },
        body: '<html></html>',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.hasCsp).toBe(false);
    const cspSuggestion = result.security.suggestions.find(s =>
      s.includes('Content-Security-Policy')
    );
    expect(cspSuggestion).toBeDefined();
  });

  it('should not suggest CSP for non-HTML responses', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'strict-transport-security': 'max-age=31536000',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    const cspSuggestion = result.security.suggestions.find(s =>
      s.includes('Content-Security-Policy')
    );
    expect(cspSuggestion).toBeUndefined();
  });

  it('should suggest X-Content-Type-Options when missing', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'strict-transport-security': 'max-age=31536000',
          'referrer-policy': 'no-referrer',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.hasXContentTypeOptions).toBe(false);
    const suggestion = result.security.suggestions.find(s =>
      s.includes('X-Content-Type-Options')
    );
    expect(suggestion).toBeDefined();
  });

  it('should suggest Referrer-Policy when missing', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'strict-transport-security': 'max-age=31536000',
          'x-content-type-options': 'nosniff',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.hasReferrerPolicy).toBe(false);
    const suggestion = result.security.suggestions.find(s =>
      s.includes('Referrer-Policy')
    );
    expect(suggestion).toBeDefined();
  });

  it('should warn about short HSTS max-age', () => {
    const entry = makeEntry({
      protocol: 'https',
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/json',
          'strict-transport-security': 'max-age=86400',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
        body: '{}',
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    expect(result.security.hstsMaxAge).toBe(86400);
    const suggestion = result.security.suggestions.find(s =>
      s.includes('HSTS max-age')
    );
    expect(suggestion).toBeDefined();
  });

  it('should aggregate all suggestions into top-level suggestions array', () => {
    // HTTP, no caching on JS, large uncompressed JSON
    const body = largeTextBody(2000);
    const entry = makeEntry({
      protocol: 'http',
      request: {
        method: 'GET',
        url: 'http://example.com/app.js',
        headers: {},
        body: null,
        startTime: 1700000000000,
      },
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'application/javascript',
        },
        body,
        endTime: 1700000000200,
      },
    });

    const result = analyzePerformance(entry);

    // Should have suggestions from compression, caching, and security
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions).toEqual([
      ...result.compression.suggestions,
      ...result.caching.suggestions,
      ...result.security.suggestions,
    ]);
  });
});
