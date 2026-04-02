import type {
  Rule,
  MockRule,
  RewriteRule,
  BreakpointRule,
  BlockRule,
  TrafficEntry,
  RuleMatcher,
} from '../../shared/types';

export interface RuleProcessResult {
  action: 'passthrough' | 'mock' | 'rewrite' | 'breakpoint' | 'block';
  rule?: Rule;
  mockResponse?: {
    statusCode: number;
    statusMessage?: string;
    headers: Record<string, string>;
    body?: string;
    delay?: number;
  };
}

export class RuleEngine {
  private rules: Rule[] = [];

  setRules(rules: Rule[]): void {
    // Sort by priority (higher first) and filter enabled only
    this.rules = rules
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  getRules(): Rule[] {
    return this.rules;
  }

  processRequest(entry: TrafficEntry): RuleProcessResult {
    for (const rule of this.rules) {
      if (this.matchesRule(rule.matcher, entry)) {
        switch (rule.type) {
          case 'mock':
            return this.processMockRule(rule as MockRule);
          case 'rewrite':
            return this.processRewriteRule(rule as RewriteRule);
          case 'breakpoint':
            return this.processBreakpointRule(rule as BreakpointRule);
          case 'block':
            return this.processBlockRule(rule as BlockRule);
        }
      }
    }

    return { action: 'passthrough' };
  }

  processResponse(entry: TrafficEntry): RuleProcessResult {
    for (const rule of this.rules) {
      if (this.matchesRule(rule.matcher, entry)) {
        if (rule.type === 'rewrite') {
          const rewriteRule = rule as RewriteRule;
          if (rewriteRule.modifications.response) {
            return {
              action: 'rewrite',
              rule,
            };
          }
        }
        if (rule.type === 'breakpoint') {
          const bpRule = rule as BreakpointRule;
          if (bpRule.breakOn === 'response' || bpRule.breakOn === 'both') {
            return {
              action: 'breakpoint',
              rule,
            };
          }
        }
      }
    }

    return { action: 'passthrough' };
  }

  private matchesRule(matcher: RuleMatcher, entry: TrafficEntry): boolean {
    // URL pattern matching
    const url = entry.request.url;

    // Try glob pattern first
    let urlMatches = false;
    try {
      // Handle special patterns
      if (!matcher.urlPattern || matcher.urlPattern === '*' || matcher.urlPattern === '**') {
        urlMatches = true;
      } else if (matcher.urlPattern.startsWith('/') && matcher.urlPattern.endsWith('/')) {
        // Regex pattern enclosed in slashes
        const regexStr = matcher.urlPattern.slice(1, -1);
        urlMatches = new RegExp(regexStr, 'i').test(url);
      } else if (matcher.urlPattern.includes('*')) {
        // For URL matching, wildcards must cross path separators.
        // Convert glob wildcards to a regex where both * and ** match any character
        // sequence including '/' — more intuitive for URL patterns.
        const escaped = matcher.urlPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '.*');
        urlMatches = new RegExp(`^${regexStr}$`, 'i').test(url);
      } else {
        // Exact match or contains
        urlMatches =
          url === matcher.urlPattern ||
          url.includes(matcher.urlPattern);
      }
    } catch {
      // If pattern is invalid, try simple includes
      urlMatches = url.includes(matcher.urlPattern);
    }

    if (!urlMatches) {
      return false;
    }

    // Method matching
    if (matcher.methods && matcher.methods.length > 0) {
      const requestMethod = entry.request.method.toUpperCase();
      const allowedMethods = matcher.methods.map((m) => m.toUpperCase());
      if (!allowedMethods.includes(requestMethod)) {
        return false;
      }
    }

    // Header matching
    if (matcher.headers) {
      for (const [key, value] of Object.entries(matcher.headers)) {
        const headerValue = entry.request.headers[key.toLowerCase()];
        if (headerValue === undefined) {
          return false;
        }
        // Support regex in header value
        if (value.startsWith('/') && value.endsWith('/')) {
          const regex = new RegExp(value.slice(1, -1), 'i');
          if (!regex.test(String(headerValue))) {
            return false;
          }
        } else if (String(headerValue).toLowerCase() !== value.toLowerCase()) {
          return false;
        }
      }
    }

    // Body contains matching
    if (matcher.bodyContains && entry.request.body) {
      const bodyStr =
        typeof entry.request.body === 'string'
          ? entry.request.body
          : entry.request.body.toString('utf-8');
      if (!bodyStr.includes(matcher.bodyContains)) {
        return false;
      }
    }

    return true;
  }

  private processMockRule(rule: MockRule): RuleProcessResult {
    return {
      action: 'mock',
      rule,
      mockResponse: {
        statusCode: rule.response.statusCode,
        statusMessage: rule.response.statusMessage,
        headers: rule.response.headers,
        body: this.decodeBody(rule.response.body, rule.response.bodyEncoding),
        delay: rule.response.delay,
      },
    };
  }

  private processRewriteRule(rule: RewriteRule): RuleProcessResult {
    return {
      action: 'rewrite',
      rule,
    };
  }

  private processBreakpointRule(rule: BreakpointRule): RuleProcessResult {
    if (rule.breakOn === 'request' || rule.breakOn === 'both') {
      return {
        action: 'breakpoint',
        rule,
      };
    }
    return { action: 'passthrough' };
  }

  private processBlockRule(rule: BlockRule): RuleProcessResult {
    return {
      action: 'block',
      rule,
    };
  }

  private decodeBody(body: string, encoding?: string): string {
    if (!encoding || encoding === 'text') {
      return body;
    }
    if (encoding === 'base64') {
      return Buffer.from(body, 'base64').toString('utf-8');
    }
    if (encoding === 'json') {
      // Already a string, just return
      return body;
    }
    return body;
  }
}
