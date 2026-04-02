import { describe, it, expect } from 'vitest';
import { generateSnippet } from '../src/main/export/snippet-generator';
import type { SnippetLanguage } from '../src/shared/types';

interface TestRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | string | null;
}

function makeGetRequest(): TestRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: {
      'accept': 'application/json',
    },
    body: null,
  };
}

function makePostRequest(): TestRequest {
  return {
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer token123',
    },
    body: '{"name":"Alice","email":"alice@example.com"}',
  };
}

const allLanguages: SnippetLanguage[] = [
  'curl', 'python', 'javascript', 'go', 'ruby', 'php', 'java', 'csharp', 'rust', 'httpie',
];

describe('generateSnippet', () => {
  describe('GET request for each language', () => {
    const req = makeGetRequest();

    for (const lang of allLanguages) {
      it(`should generate valid ${lang} snippet for GET`, () => {
        const snippet = generateSnippet(lang, req);
        expect(snippet).toBeTruthy();
        expect(snippet.length).toBeGreaterThan(0);
        // URL should appear in every snippet
        expect(snippet).toContain('https://api.example.com/users');
      });
    }
  });

  describe('POST request with JSON body and headers for each language', () => {
    const req = makePostRequest();

    for (const lang of allLanguages) {
      it(`should generate valid ${lang} snippet for POST with body`, () => {
        const snippet = generateSnippet(lang, req);
        expect(snippet).toBeTruthy();
        expect(snippet).toContain('https://api.example.com/users');
        // Body content or reference should be present
        expect(snippet).toContain('Alice');
      });
    }
  });

  describe('headers are included in all languages', () => {
    const req = makePostRequest();

    for (const lang of allLanguages) {
      it(`should include headers in ${lang} snippet`, () => {
        const snippet = generateSnippet(lang, req);
        // All languages should reference the authorization header
        // (content-type may be handled specially, e.g. C# puts it on StringContent)
        expect(snippet.toLowerCase()).toContain('authorization');
      });
    }
  });
});

describe('curl generation', () => {
  it('should not include -X flag for GET requests', () => {
    const snippet = generateSnippet('curl', makeGetRequest());
    expect(snippet).not.toContain('-X GET');
  });

  it('should include -X flag for non-GET requests', () => {
    const snippet = generateSnippet('curl', makePostRequest());
    expect(snippet).toContain('-X POST');
  });

  it('should include -H flags for headers', () => {
    const snippet = generateSnippet('curl', makePostRequest());
    expect(snippet).toContain('-H');
    expect(snippet).toContain('content-type: application/json');
  });

  it('should include -d flag for request body', () => {
    const snippet = generateSnippet('curl', makePostRequest());
    expect(snippet).toContain('-d');
  });

  it('should escape special characters in shell arguments', () => {
    const req: TestRequest = {
      method: 'POST',
      url: 'https://example.com/search',
      headers: {
        'x-custom': "value with 'quotes' and spaces",
      },
      body: '{"query":"hello world"}',
    };
    const snippet = generateSnippet('curl', req);
    // The URL and header values should be properly escaped
    expect(snippet).toBeTruthy();
    // Single quotes in values should be escaped
    expect(snippet).toContain("'\\''");
  });

  it('should not quote simple URLs that need no escaping', () => {
    const req: TestRequest = {
      method: 'GET',
      url: 'https://example.com/api/v1/data?key=value',
      headers: {},
      body: null,
    };
    const snippet = generateSnippet('curl', req);
    // URL with only safe chars should not be quoted
    expect(snippet).toContain('https://example.com/api/v1/data?key=value');
  });
});

describe('python generation', () => {
  it('should contain import requests', () => {
    const snippet = generateSnippet('python', makeGetRequest());
    expect(snippet).toContain('import requests');
  });

  it('should use requests.get for GET', () => {
    const snippet = generateSnippet('python', makeGetRequest());
    expect(snippet).toContain('requests.get(');
  });

  it('should use requests.post for POST', () => {
    const snippet = generateSnippet('python', makePostRequest());
    expect(snippet).toContain('requests.post(');
  });

  it('should include headers dict', () => {
    const snippet = generateSnippet('python', makePostRequest());
    expect(snippet).toContain('headers = {');
    expect(snippet).toContain('headers=headers');
  });

  it('should include data for body', () => {
    const snippet = generateSnippet('python', makePostRequest());
    expect(snippet).toContain('data =');
    expect(snippet).toContain('data=data');
  });
});

describe('javascript generation', () => {
  it('should use fetch API', () => {
    const snippet = generateSnippet('javascript', makeGetRequest());
    expect(snippet).toContain('fetch(');
  });

  it('should include method in options', () => {
    const snippet = generateSnippet('javascript', makePostRequest());
    expect(snippet).toContain('method: "POST"');
  });

  it('should include headers object', () => {
    const snippet = generateSnippet('javascript', makePostRequest());
    expect(snippet).toContain('headers: {');
    expect(snippet).toContain('"content-type"');
  });

  it('should include body for POST', () => {
    const snippet = generateSnippet('javascript', makePostRequest());
    expect(snippet).toContain('body:');
  });

  it('should include response handling', () => {
    const snippet = generateSnippet('javascript', makeGetRequest());
    expect(snippet).toContain('response.text()');
    expect(snippet).toContain('response.status');
  });
});

describe('go generation', () => {
  it('should have package main', () => {
    const snippet = generateSnippet('go', makeGetRequest());
    expect(snippet).toContain('package main');
  });

  it('should import net/http', () => {
    const snippet = generateSnippet('go', makeGetRequest());
    expect(snippet).toContain('"net/http"');
  });

  it('should import strings package when body is present', () => {
    const snippet = generateSnippet('go', makePostRequest());
    expect(snippet).toContain('"strings"');
  });

  it('should not import strings package when no body', () => {
    const snippet = generateSnippet('go', makeGetRequest());
    expect(snippet).not.toContain('"strings"');
  });

  it('should use http.NewRequest', () => {
    const snippet = generateSnippet('go', makeGetRequest());
    expect(snippet).toContain('http.NewRequest(');
  });

  it('should set headers with Header.Set', () => {
    const snippet = generateSnippet('go', makePostRequest());
    expect(snippet).toContain('req.Header.Set(');
  });

  it('should use strings.NewReader for body', () => {
    const snippet = generateSnippet('go', makePostRequest());
    expect(snippet).toContain('strings.NewReader(');
  });

  it('should pass nil body for GET', () => {
    const snippet = generateSnippet('go', makeGetRequest());
    expect(snippet).toContain(', nil)');
  });
});

describe('unsupported language', () => {
  it('should throw for an unknown language', () => {
    expect(() => {
      generateSnippet('brainfuck' as SnippetLanguage, makeGetRequest());
    }).toThrow('Unsupported language');
  });
});

describe('Buffer body handling', () => {
  it('should handle Buffer body', () => {
    const req: TestRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('binary data here'),
    };
    const snippet = generateSnippet('curl', req);
    expect(snippet).toContain('binary data here');
  });
});

describe('multi-value headers', () => {
  it('should flatten array headers in curl', () => {
    const req: TestRequest = {
      method: 'GET',
      url: 'https://example.com/',
      headers: {
        'x-multi': ['value1', 'value2'],
      },
      body: null,
    };
    const snippet = generateSnippet('curl', req);
    expect(snippet).toContain('x-multi: value1');
    expect(snippet).toContain('x-multi: value2');
  });
});
