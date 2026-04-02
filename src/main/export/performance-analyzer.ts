import { PerformanceAnalysis, TrafficEntry } from '../../shared/types';

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  // Case-insensitive header lookup
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return undefined;
}

function getBodySize(body: Buffer | string | null): number {
  if (body === null) return 0;
  if (Buffer.isBuffer(body)) return body.length;
  return Buffer.byteLength(body, 'utf-8');
}

interface CompressionResult {
  isCompressed: boolean;
  encoding: string | null;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
  suggestions: string[];
}

function analyzeCompression(entry: TrafficEntry): CompressionResult {
  const result: CompressionResult = {
    isCompressed: false,
    encoding: null,
    originalSize: 0,
    compressedSize: 0,
    savingsPercent: 0,
    suggestions: [],
  };

  if (!entry.response) return result;

  const contentEncoding = getHeaderValue(entry.response.headers, 'content-encoding');
  const bodySize = getBodySize(entry.response.body);
  result.compressedSize = bodySize;

  if (contentEncoding) {
    result.isCompressed = true;
    result.encoding = contentEncoding;

    // Try to estimate original size from content-length if available
    const contentLength = getHeaderValue(entry.response.headers, 'content-length');
    if (contentLength) {
      const declaredSize = parseInt(contentLength, 10);
      if (!isNaN(declaredSize) && declaredSize > 0) {
        result.compressedSize = declaredSize;
      }
    }

    // We can't perfectly determine original size from compressed data,
    // but we know compression is active
    result.originalSize = bodySize;
  } else {
    result.originalSize = bodySize;
    result.compressedSize = bodySize;

    // Suggest compression for uncompressed responses > 1KB
    if (bodySize > 1024) {
      const contentType = getHeaderValue(entry.response.headers, 'content-type') ?? '';
      const compressibleTypes = [
        'text/',
        'application/json',
        'application/javascript',
        'application/xml',
        'application/xhtml',
        'application/rss',
        'application/atom',
        'image/svg',
        'application/wasm',
      ];

      const isCompressible = compressibleTypes.some((type) =>
        contentType.toLowerCase().includes(type)
      );

      if (isCompressible) {
        result.suggestions.push(
          `Response body is ${bodySize} bytes and not compressed. Enable gzip or brotli compression to reduce transfer size (typically 60-80% savings for text content).`
        );
      }
    }
  }

  if (result.originalSize > 0 && result.compressedSize > 0 && result.isCompressed) {
    // If we have transfer-encoding info we can estimate savings
    // Otherwise just note that compression is active
    result.savingsPercent = 0; // Cannot determine without both original and compressed sizes
  }

  return result;
}

interface CacheResult {
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
}

function parseCacheControl(value: string): Record<string, string | true> {
  const directives: Record<string, string | true> = {};
  const parts = value.split(',').map((p) => p.trim());
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex >= 0) {
      const key = part.substring(0, eqIndex).trim().toLowerCase();
      const val = part.substring(eqIndex + 1).trim();
      directives[key] = val;
    } else {
      directives[part.trim().toLowerCase()] = true;
    }
  }
  return directives;
}

function analyzeCaching(entry: TrafficEntry): CacheResult {
  const result: CacheResult = {
    isCacheable: false,
    cacheControl: null,
    maxAge: null,
    expires: null,
    etag: null,
    lastModified: null,
    isPublic: false,
    isPrivate: false,
    noStore: false,
    noCache: false,
    mustRevalidate: false,
    suggestions: [],
  };

  if (!entry.response) return result;

  const cacheControl = getHeaderValue(entry.response.headers, 'cache-control');
  result.cacheControl = cacheControl ?? null;
  result.expires = getHeaderValue(entry.response.headers, 'expires') ?? null;
  result.etag = getHeaderValue(entry.response.headers, 'etag') ?? null;
  result.lastModified = getHeaderValue(entry.response.headers, 'last-modified') ?? null;

  if (cacheControl) {
    const directives = parseCacheControl(cacheControl);

    result.isPublic = directives['public'] === true;
    result.isPrivate = directives['private'] === true;
    result.noStore = directives['no-store'] === true;
    result.noCache = directives['no-cache'] === true;
    result.mustRevalidate = directives['must-revalidate'] === true;

    if (typeof directives['max-age'] === 'string') {
      const maxAge = parseInt(directives['max-age'], 10);
      if (!isNaN(maxAge)) {
        result.maxAge = maxAge;
      }
    }

    if (typeof directives['s-maxage'] === 'string' && result.maxAge === null) {
      const sMaxAge = parseInt(directives['s-maxage'], 10);
      if (!isNaN(sMaxAge)) {
        result.maxAge = sMaxAge;
      }
    }
  }

  // Determine cacheability
  if (result.noStore) {
    result.isCacheable = false;
  } else if (result.maxAge !== null && result.maxAge > 0) {
    result.isCacheable = true;
  } else if (result.expires) {
    try {
      const expiresDate = new Date(result.expires);
      result.isCacheable = expiresDate.getTime() > Date.now();
    } catch {
      result.isCacheable = false;
    }
  } else if (result.etag || result.lastModified) {
    // Conditionally cacheable (revalidation required)
    result.isCacheable = true;
  }

  // Suggestions for static content
  const contentType = getHeaderValue(entry.response.headers, 'content-type') ?? '';
  const staticTypes = [
    'image/',
    'font/',
    'application/javascript',
    'text/css',
    'application/wasm',
    'video/',
    'audio/',
  ];

  const isStaticContent = staticTypes.some((type) =>
    contentType.toLowerCase().includes(type)
  );

  if (isStaticContent && !result.isCacheable) {
    result.suggestions.push(
      'This appears to be static content but is not cacheable. Consider adding a Cache-Control header with an appropriate max-age (e.g., Cache-Control: public, max-age=31536000, immutable for versioned assets).'
    );
  }

  if (isStaticContent && result.maxAge !== null && result.maxAge < 86400) {
    result.suggestions.push(
      `Static content has a short max-age of ${result.maxAge} seconds. Consider increasing it for versioned/fingerprinted assets.`
    );
  }

  if (!result.etag && !result.lastModified && result.isCacheable) {
    result.suggestions.push(
      'Response is cacheable but lacks ETag and Last-Modified headers. Adding these enables conditional requests (304 Not Modified) and reduces bandwidth.'
    );
  }

  return result;
}

interface SecurityResult {
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
}

function analyzeSecurity(entry: TrafficEntry): SecurityResult {
  const result: SecurityResult = {
    isHttps: false,
    hasHsts: false,
    hstsMaxAge: null,
    hstsIncludesSubdomains: false,
    hstsPreload: false,
    hasCsp: false,
    csp: null,
    hasXFrameOptions: false,
    xFrameOptions: null,
    hasXContentTypeOptions: false,
    hasReferrerPolicy: false,
    referrerPolicy: null,
    suggestions: [],
  };

  result.isHttps = entry.protocol === 'https' || entry.protocol === 'wss';

  if (!result.isHttps) {
    result.suggestions.push(
      'Request is using HTTP instead of HTTPS. All traffic should be served over HTTPS to prevent eavesdropping and tampering.'
    );
  }

  if (!entry.response) return result;

  // HSTS
  const hsts = getHeaderValue(entry.response.headers, 'strict-transport-security');
  if (hsts) {
    result.hasHsts = true;
    const parts = hsts.toLowerCase().split(';').map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith('max-age=')) {
        const maxAge = parseInt(part.substring(8), 10);
        if (!isNaN(maxAge)) {
          result.hstsMaxAge = maxAge;
        }
      } else if (part === 'includesubdomains') {
        result.hstsIncludesSubdomains = true;
      } else if (part === 'preload') {
        result.hstsPreload = true;
      }
    }

    if (result.hstsMaxAge !== null && result.hstsMaxAge < 31536000) {
      result.suggestions.push(
        `HSTS max-age is ${result.hstsMaxAge} seconds (${Math.round(result.hstsMaxAge / 86400)} days). Consider setting it to at least 31536000 (1 year).`
      );
    }
  } else if (result.isHttps) {
    result.suggestions.push(
      'HTTPS is used but Strict-Transport-Security (HSTS) header is missing. Add HSTS to prevent protocol downgrade attacks (e.g., Strict-Transport-Security: max-age=31536000; includeSubDomains).'
    );
  }

  // CSP
  const csp = getHeaderValue(entry.response.headers, 'content-security-policy');
  if (csp) {
    result.hasCsp = true;
    result.csp = csp;
  } else {
    const contentType = getHeaderValue(entry.response.headers, 'content-type') ?? '';
    if (contentType.includes('text/html')) {
      result.suggestions.push(
        'Content-Security-Policy header is missing for HTML content. CSP helps prevent XSS attacks by controlling which resources the browser can load.'
      );
    }
  }

  // X-Frame-Options
  const xfo = getHeaderValue(entry.response.headers, 'x-frame-options');
  if (xfo) {
    result.hasXFrameOptions = true;
    result.xFrameOptions = xfo;
  } else {
    const contentType = getHeaderValue(entry.response.headers, 'content-type') ?? '';
    if (contentType.includes('text/html')) {
      result.suggestions.push(
        'X-Frame-Options header is missing for HTML content. Consider adding X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking attacks.'
      );
    }
  }

  // X-Content-Type-Options
  const xcto = getHeaderValue(entry.response.headers, 'x-content-type-options');
  if (xcto) {
    result.hasXContentTypeOptions = true;
  } else {
    result.suggestions.push(
      'X-Content-Type-Options header is missing. Add X-Content-Type-Options: nosniff to prevent MIME type sniffing.'
    );
  }

  // Referrer-Policy
  const referrerPolicy = getHeaderValue(entry.response.headers, 'referrer-policy');
  if (referrerPolicy) {
    result.hasReferrerPolicy = true;
    result.referrerPolicy = referrerPolicy;
  } else {
    result.suggestions.push(
      'Referrer-Policy header is missing. Consider adding a Referrer-Policy (e.g., strict-origin-when-cross-origin) to control referrer information leakage.'
    );
  }

  return result;
}

export function analyzePerformance(entry: TrafficEntry): PerformanceAnalysis {
  const compression = analyzeCompression(entry);
  const caching = analyzeCaching(entry);
  const security = analyzeSecurity(entry);

  const allSuggestions = [
    ...compression.suggestions,
    ...caching.suggestions,
    ...security.suggestions,
  ];

  return {
    compression: {
      isCompressed: compression.isCompressed,
      encoding: compression.encoding,
      originalSize: compression.originalSize,
      compressedSize: compression.compressedSize,
      savingsPercent: compression.savingsPercent,
      suggestions: compression.suggestions,
    },
    caching: {
      isCacheable: caching.isCacheable,
      cacheControl: caching.cacheControl,
      maxAge: caching.maxAge,
      expires: caching.expires,
      etag: caching.etag,
      lastModified: caching.lastModified,
      isPublic: caching.isPublic,
      isPrivate: caching.isPrivate,
      noStore: caching.noStore,
      noCache: caching.noCache,
      mustRevalidate: caching.mustRevalidate,
      suggestions: caching.suggestions,
    },
    security: {
      isHttps: security.isHttps,
      hasHsts: security.hasHsts,
      hstsMaxAge: security.hstsMaxAge,
      hstsIncludesSubdomains: security.hstsIncludesSubdomains,
      hstsPreload: security.hstsPreload,
      hasCsp: security.hasCsp,
      csp: security.csp,
      hasXFrameOptions: security.hasXFrameOptions,
      xFrameOptions: security.xFrameOptions,
      hasXContentTypeOptions: security.hasXContentTypeOptions,
      hasReferrerPolicy: security.hasReferrerPolicy,
      referrerPolicy: security.referrerPolicy,
      suggestions: security.suggestions,
    },
    suggestions: allSuggestions,
  };
}
