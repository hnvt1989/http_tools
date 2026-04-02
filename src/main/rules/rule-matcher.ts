import type { RuleMatcher, TrafficEntry } from '../../shared/types';

export class RuleMatcherEngine {
  /**
   * Check if a traffic entry matches the given rule matcher
   */
  matches(matcher: RuleMatcher, entry: TrafficEntry): boolean {
    // URL pattern matching
    if (!this.matchesUrl(matcher.urlPattern, entry.request.url)) {
      return false;
    }

    // Method matching
    if (!this.matchesMethods(matcher.methods, entry.request.method)) {
      return false;
    }

    // Header matching
    if (!this.matchesHeaders(matcher.headers, entry.request.headers)) {
      return false;
    }

    // Body contains matching
    if (!this.matchesBody(matcher.bodyContains, entry.request.body)) {
      return false;
    }

    return true;
  }

  private matchesUrl(pattern: string, url: string): boolean {
    if (!pattern || pattern === '*' || pattern === '**') {
      return true;
    }

    // Try regex match (pattern enclosed in slashes)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.slice(1, -1), 'i');
        if (regex.test(url)) {
          return true;
        }
      } catch {
        // Ignore regex errors
      }
      return false;
    }

    // Try glob/wildcard match
    if (pattern.includes('*') || pattern.includes('?')) {
      try {
        // For URL matching, wildcards must cross path separators.
        // Convert glob wildcards to a regex where *, **, and ? match across '/'.
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        if (new RegExp(`^${regexStr}$`, 'i').test(url)) {
          return true;
        }
      } catch {
        // Ignore errors
      }
    }

    // Try exact match
    if (url === pattern) {
      return true;
    }

    // Try contains match
    if (url.includes(pattern)) {
      return true;
    }

    return false;
  }

  private matchesMethods(
    allowedMethods: string[] | undefined,
    requestMethod: string
  ): boolean {
    if (!allowedMethods || allowedMethods.length === 0) {
      return true;
    }

    const normalizedMethod = requestMethod.toUpperCase();
    const normalizedAllowed = allowedMethods.map((m) => m.toUpperCase());

    return normalizedAllowed.includes(normalizedMethod);
  }

  private matchesHeaders(
    requiredHeaders: Record<string, string> | undefined,
    requestHeaders: Record<string, string | string[] | undefined>
  ): boolean {
    if (!requiredHeaders || Object.keys(requiredHeaders).length === 0) {
      return true;
    }

    for (const [key, expectedValue] of Object.entries(requiredHeaders)) {
      const actualValue = requestHeaders[key.toLowerCase()];

      if (actualValue === undefined) {
        return false;
      }

      const actualStr = Array.isArray(actualValue)
        ? actualValue.join(', ')
        : String(actualValue);

      // Support regex matching for header values
      if (expectedValue.startsWith('/') && expectedValue.endsWith('/')) {
        try {
          const regex = new RegExp(expectedValue.slice(1, -1), 'i');
          if (!regex.test(actualStr)) {
            return false;
          }
        } catch {
          // Invalid regex, fall back to exact match
          if (actualStr.toLowerCase() !== expectedValue.toLowerCase()) {
            return false;
          }
        }
      } else {
        // Case-insensitive exact match
        if (actualStr.toLowerCase() !== expectedValue.toLowerCase()) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesBody(
    contains: string | undefined,
    body: Buffer | string | null
  ): boolean {
    if (!contains) {
      return true;
    }

    if (!body) {
      return false;
    }

    const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');

    return bodyStr.includes(contains);
  }
}
