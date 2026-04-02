import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../src/main/rules/rule-engine';
import { RuleMatcherEngine } from '../src/main/rules/rule-matcher';
import type {
  Rule,
  MockRule,
  RewriteRule,
  BreakpointRule,
  BlockRule,
  TrafficEntry,
  RuleMatcher,
} from '../src/shared/types';

const now = Date.now();

function makeEntry(overrides: Partial<TrafficEntry> = {}): TrafficEntry {
  return {
    id: 'traffic-1',
    request: {
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: null,
      startTime: now,
    },
    response: null,
    protocol: 'https',
    status: 'pending',
    ...overrides,
  };
}

function makeMockRule(overrides: Partial<MockRule> = {}): MockRule {
  return {
    id: 'rule-mock-1',
    name: 'Mock Users',
    type: 'mock',
    enabled: true,
    priority: 10,
    matcher: {
      urlPattern: '**/users',
    },
    createdAt: now,
    updatedAt: now,
    response: {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"users":[]}',
    },
    ...overrides,
  };
}

function makeBlockRule(overrides: Partial<BlockRule> = {}): BlockRule {
  return {
    id: 'rule-block-1',
    name: 'Block Ads',
    type: 'block',
    enabled: true,
    priority: 10,
    matcher: {
      urlPattern: '**/ads/**',
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRewriteRule(overrides: Partial<RewriteRule> = {}): RewriteRule {
  return {
    id: 'rule-rewrite-1',
    name: 'Rewrite Headers',
    type: 'rewrite',
    enabled: true,
    priority: 10,
    matcher: {
      urlPattern: '**/api/**',
    },
    createdAt: now,
    updatedAt: now,
    modifications: {
      request: {
        headers: { 'x-custom': 'injected' },
      },
      response: {
        headers: { 'x-modified': 'true' },
      },
    },
    ...overrides,
  };
}

function makeBreakpointRule(overrides: Partial<BreakpointRule> = {}): BreakpointRule {
  return {
    id: 'rule-bp-1',
    name: 'Breakpoint Users',
    type: 'breakpoint',
    enabled: true,
    priority: 10,
    matcher: {
      urlPattern: '**/users',
    },
    createdAt: now,
    updatedAt: now,
    breakOn: 'request',
    ...overrides,
  };
}

// ---------- RuleEngine tests ----------

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('rule matching by URL pattern (glob)', () => {
    it('should match a URL using glob pattern with **', () => {
      engine.setRules([makeMockRule({ matcher: { urlPattern: '**/users' } })]);
      const entry = makeEntry({ request: { ...makeEntry().request, url: 'https://api.example.com/users' } });
      const result = engine.processRequest(entry);

      expect(result.action).toBe('mock');
    });

    it('should match wildcard * pattern', () => {
      engine.setRules([makeMockRule({ matcher: { urlPattern: '*' } })]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should match ** wildcard (match all)', () => {
      engine.setRules([makeMockRule({ matcher: { urlPattern: '**' } })]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should match by substring when no glob characters', () => {
      engine.setRules([makeMockRule({ matcher: { urlPattern: '/users' } })]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should not match when URL does not match pattern', () => {
      engine.setRules([makeMockRule({ matcher: { urlPattern: '**/products' } })]);
      const entry = makeEntry({ request: { ...makeEntry().request, url: 'https://api.example.com/users' } });
      const result = engine.processRequest(entry);

      expect(result.action).toBe('passthrough');
    });
  });

  describe('rule matching by method', () => {
    it('should match when method is in the allowed list', () => {
      engine.setRules([
        makeMockRule({
          matcher: { urlPattern: '*', methods: ['GET', 'POST'] },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should not match when method is not in the allowed list', () => {
      engine.setRules([
        makeMockRule({
          matcher: { urlPattern: '*', methods: ['POST', 'PUT'] },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });

    it('should match any method when methods array is empty', () => {
      engine.setRules([
        makeMockRule({
          matcher: { urlPattern: '*', methods: [] },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should match case-insensitively', () => {
      engine.setRules([
        makeMockRule({
          matcher: { urlPattern: '*', methods: ['get'] },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });
  });

  describe('mock rule processing', () => {
    it('should return mock response with status, headers, and body', () => {
      engine.setRules([makeMockRule()]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
      expect(result.mockResponse).toBeDefined();
      expect(result.mockResponse!.statusCode).toBe(200);
      expect(result.mockResponse!.statusMessage).toBe('OK');
      expect(result.mockResponse!.headers['content-type']).toBe('application/json');
      expect(result.mockResponse!.body).toBe('{"users":[]}');
    });

    it('should include delay in mock response', () => {
      engine.setRules([
        makeMockRule({
          response: {
            statusCode: 200,
            headers: {},
            body: '{}',
            delay: 500,
          },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.mockResponse!.delay).toBe(500);
    });

    it('should decode base64 encoded body', () => {
      const base64Body = Buffer.from('Hello World').toString('base64');
      engine.setRules([
        makeMockRule({
          response: {
            statusCode: 200,
            headers: {},
            body: base64Body,
            bodyEncoding: 'base64',
          },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.mockResponse!.body).toBe('Hello World');
    });
  });

  describe('block rule processing', () => {
    it('should return block action', () => {
      engine.setRules([makeBlockRule({ matcher: { urlPattern: '*' } })]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('block');
      expect(result.rule).toBeDefined();
      expect(result.rule!.type).toBe('block');
    });
  });

  describe('rewrite rule processing', () => {
    it('should return rewrite action for request', () => {
      engine.setRules([makeRewriteRule({ matcher: { urlPattern: '*' } })]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('rewrite');
      expect(result.rule).toBeDefined();
      expect(result.rule!.type).toBe('rewrite');
    });

    it('should return rewrite action for response when response modifications exist', () => {
      engine.setRules([makeRewriteRule({ matcher: { urlPattern: '*' } })]);
      const entry = makeEntry({
        response: {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          body: '{}',
          endTime: now + 100,
        },
      });
      const result = engine.processResponse(entry);

      expect(result.action).toBe('rewrite');
    });

    it('should passthrough response when no response modifications', () => {
      engine.setRules([
        makeRewriteRule({
          matcher: { urlPattern: '*' },
          modifications: {
            request: { headers: { 'x-added': 'yes' } },
            // no response modifications
          },
        }),
      ]);
      const entry = makeEntry({
        response: {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          body: '{}',
          endTime: now + 100,
        },
      });
      const result = engine.processResponse(entry);

      expect(result.action).toBe('passthrough');
    });
  });

  describe('rule priority ordering', () => {
    it('should apply higher priority rule first', () => {
      const lowPriority = makeBlockRule({
        id: 'low',
        priority: 1,
        matcher: { urlPattern: '*' },
      });
      const highPriority = makeMockRule({
        id: 'high',
        priority: 100,
        matcher: { urlPattern: '*' },
      });

      engine.setRules([lowPriority, highPriority]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
      expect(result.rule!.id).toBe('high');
    });

    it('should respect priority even when rules are added in reverse order', () => {
      const highPriority = makeMockRule({
        id: 'high',
        priority: 100,
        matcher: { urlPattern: '*' },
      });
      const lowPriority = makeBlockRule({
        id: 'low',
        priority: 1,
        matcher: { urlPattern: '*' },
      });

      engine.setRules([highPriority, lowPriority]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
      expect(result.rule!.id).toBe('high');
    });
  });

  describe('disabled rules are skipped', () => {
    it('should skip disabled rules', () => {
      engine.setRules([
        makeMockRule({ enabled: false, matcher: { urlPattern: '*' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });

    it('should fall through to enabled rule after skipping disabled', () => {
      engine.setRules([
        makeMockRule({ id: 'disabled', enabled: false, priority: 100, matcher: { urlPattern: '*' } }),
        makeBlockRule({ id: 'enabled', enabled: true, priority: 1, matcher: { urlPattern: '*' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('block');
      expect(result.rule!.id).toBe('enabled');
    });
  });

  describe('breakpoint rule processing', () => {
    it('should return breakpoint action when breakOn is request', () => {
      engine.setRules([
        makeBreakpointRule({ breakOn: 'request', matcher: { urlPattern: '*' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('breakpoint');
    });

    it('should return breakpoint action when breakOn is both', () => {
      engine.setRules([
        makeBreakpointRule({ breakOn: 'both', matcher: { urlPattern: '*' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('breakpoint');
    });

    it('should passthrough request when breakOn is response only', () => {
      engine.setRules([
        makeBreakpointRule({ breakOn: 'response', matcher: { urlPattern: '*' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });

    it('should break on response when breakOn is response', () => {
      engine.setRules([
        makeBreakpointRule({ breakOn: 'response', matcher: { urlPattern: '*' } }),
      ]);
      const entry = makeEntry({
        response: {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          body: '{}',
          endTime: now + 100,
        },
      });
      const result = engine.processResponse(entry);

      expect(result.action).toBe('breakpoint');
    });

    it('should break on response when breakOn is both', () => {
      engine.setRules([
        makeBreakpointRule({ breakOn: 'both', matcher: { urlPattern: '*' } }),
      ]);
      const entry = makeEntry({
        response: {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          body: '{}',
          endTime: now + 100,
        },
      });
      const result = engine.processResponse(entry);

      expect(result.action).toBe('breakpoint');
    });
  });

  describe('no matching rules', () => {
    it('should return passthrough when no rules are set', () => {
      engine.setRules([]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });

    it('should return passthrough when no rules match', () => {
      engine.setRules([
        makeMockRule({ matcher: { urlPattern: '**/nonexistent' } }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });
  });

  describe('header matching', () => {
    it('should match when required headers are present', () => {
      engine.setRules([
        makeMockRule({
          matcher: {
            urlPattern: '*',
            headers: { 'content-type': 'application/json' },
          },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('mock');
    });

    it('should not match when required header is missing', () => {
      engine.setRules([
        makeMockRule({
          matcher: {
            urlPattern: '*',
            headers: { 'x-missing': 'value' },
          },
        }),
      ]);
      const result = engine.processRequest(makeEntry());

      expect(result.action).toBe('passthrough');
    });
  });

  describe('body contains matching', () => {
    it('should match when body contains the string', () => {
      engine.setRules([
        makeMockRule({
          matcher: {
            urlPattern: '*',
            bodyContains: 'search-term',
          },
        }),
      ]);
      const entry = makeEntry({
        request: {
          method: 'POST',
          url: 'https://api.example.com/search',
          headers: {},
          body: '{"query":"search-term"}',
          startTime: now,
        },
      });
      const result = engine.processRequest(entry);

      expect(result.action).toBe('mock');
    });

    it('should not match when body does not contain the string', () => {
      engine.setRules([
        makeMockRule({
          matcher: {
            urlPattern: '*',
            bodyContains: 'not-present',
          },
        }),
      ]);
      const entry = makeEntry({
        request: {
          method: 'POST',
          url: 'https://api.example.com/search',
          headers: {},
          body: '{"query":"something-else"}',
          startTime: now,
        },
      });
      const result = engine.processRequest(entry);

      expect(result.action).toBe('passthrough');
    });
  });
});

// ---------- RuleMatcherEngine tests ----------

describe('RuleMatcherEngine', () => {
  let matcher: RuleMatcherEngine;

  beforeEach(() => {
    matcher = new RuleMatcherEngine();
  });

  it('should match wildcard pattern *', () => {
    const result = matcher.matches(
      { urlPattern: '*' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should match wildcard pattern **', () => {
    const result = matcher.matches(
      { urlPattern: '**' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should match glob pattern with **', () => {
    const result = matcher.matches(
      { urlPattern: '**/users' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should match by substring', () => {
    const result = matcher.matches(
      { urlPattern: 'example.com' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should not match unrelated URL', () => {
    const result = matcher.matches(
      { urlPattern: '**/products' },
      makeEntry(),
    );
    expect(result).toBe(false);
  });

  it('should filter by method', () => {
    const result = matcher.matches(
      { urlPattern: '*', methods: ['POST'] },
      makeEntry(),
    );
    expect(result).toBe(false);
  });

  it('should allow any method when methods is undefined', () => {
    const result = matcher.matches(
      { urlPattern: '*' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should match headers case-insensitively', () => {
    const result = matcher.matches(
      { urlPattern: '*', headers: { 'Accept': 'application/json' } },
      makeEntry({
        request: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: { 'accept': 'application/json' },
          body: null,
          startTime: now,
        },
      }),
    );
    expect(result).toBe(true);
  });

  it('should match header values with regex pattern', () => {
    const result = matcher.matches(
      { urlPattern: '*', headers: { 'content-type': '/json/' } },
      makeEntry(),
    );
    expect(result).toBe(true);
  });

  it('should match body contains', () => {
    const entry = makeEntry({
      request: {
        method: 'POST',
        url: 'https://api.example.com/data',
        headers: {},
        body: '{"key":"value"}',
        startTime: now,
      },
    });
    const result = matcher.matches(
      { urlPattern: '*', bodyContains: 'key' },
      entry,
    );
    expect(result).toBe(true);
  });

  it('should not match body contains when body is null', () => {
    const result = matcher.matches(
      { urlPattern: '*', bodyContains: 'something' },
      makeEntry(),
    );
    expect(result).toBe(false);
  });

  it('should match regex URL pattern enclosed in slashes', () => {
    const result = matcher.matches(
      { urlPattern: '/\\/users$/' },
      makeEntry(),
    );
    expect(result).toBe(true);
  });
});
