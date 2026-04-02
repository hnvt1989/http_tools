import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportToHar,
  importFromHar,
  exportToHarString,
  importFromHarString,
} from '../src/main/export/har-converter';
import type { TrafficEntry, HarLog } from '../src/shared/types';

function makeEntry(overrides: Partial<TrafficEntry> = {}): TrafficEntry {
  return {
    id: 'entry-1',
    request: {
      method: 'GET',
      url: 'https://api.example.com/users?page=1&limit=10',
      headers: {
        'accept': 'application/json',
        'user-agent': 'HTTPTools/1.0',
      },
      body: null,
      startTime: 1700000000000,
    },
    response: {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'abc-123',
      },
      body: '{"users":[]}',
      endTime: 1700000000500,
    },
    protocol: 'https',
    status: 'complete',
    timing: {
      start: 1700000000000,
      dns: 10,
      tcp: 20,
      tls: 30,
      firstByte: 100,
      download: 50,
      end: 1700000000500,
      total: 500,
    },
    ...overrides,
  };
}

function makePostEntry(): TrafficEntry {
  return makeEntry({
    id: 'entry-post',
    request: {
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer token123',
      },
      body: '{"name":"Alice","email":"alice@example.com"}',
      startTime: 1700000001000,
    },
    response: {
      statusCode: 201,
      statusMessage: 'Created',
      headers: {
        'content-type': 'application/json',
        'location': '/users/42',
      },
      body: '{"id":42,"name":"Alice"}',
      endTime: 1700000001300,
    },
    timing: {
      start: 1700000001000,
      dns: 5,
      tcp: 15,
      tls: 25,
      firstByte: 80,
      download: 30,
      end: 1700000001300,
      total: 300,
    },
  });
}

describe('exportToHar', () => {
  it('should produce valid HAR structure', () => {
    const har = exportToHar([makeEntry()]);

    expect(har.log.version).toBe('1.2');
    expect(har.log.creator.name).toBe('HTTP Tools');
    expect(har.log.creator.version).toBe('1.0.0');
    expect(har.log.entries).toHaveLength(1);
  });

  it('should convert a complete entry with method, url, headers, body, response, and timing', () => {
    const entry = makeEntry();
    const har = exportToHar([entry]);
    const harEntry = har.log.entries[0];

    expect(harEntry.request.method).toBe('GET');
    expect(harEntry.request.url).toBe('https://api.example.com/users?page=1&limit=10');
    expect(harEntry.response.status).toBe(200);
    expect(harEntry.response.statusText).toBe('OK');
    expect(harEntry.response.content.text).toBe('{"users":[]}');
    expect(harEntry.time).toBe(500);
    expect(harEntry.startedDateTime).toBe(new Date(1700000000000).toISOString());
  });

  it('should handle an entry with no response', () => {
    const entry = makeEntry({
      response: null,
      status: 'pending',
    });
    const har = exportToHar([entry]);
    const harEntry = har.log.entries[0];

    expect(harEntry.response.status).toBe(0);
    expect(harEntry.response.statusText).toBe('');
    expect(harEntry.response.headers).toEqual([]);
    expect(harEntry.response.content.size).toBe(0);
    expect(harEntry.response.content.text).toBe('');
  });

  it('should handle multiple entries', () => {
    const entries = [makeEntry(), makePostEntry()];
    const har = exportToHar(entries);

    expect(har.log.entries).toHaveLength(2);
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[1].request.method).toBe('POST');
  });

  it('should flatten request headers into name/value pairs', () => {
    const entry = makeEntry({
      request: {
        method: 'GET',
        url: 'https://example.com/',
        headers: {
          'accept': 'application/json',
          'x-custom': ['value1', 'value2'],
        },
        body: null,
        startTime: 1700000000000,
      },
    });
    const har = exportToHar([entry]);
    const headers = har.log.entries[0].request.headers;

    expect(headers).toContainEqual({ name: 'accept', value: 'application/json' });
    expect(headers).toContainEqual({ name: 'x-custom', value: 'value1' });
    expect(headers).toContainEqual({ name: 'x-custom', value: 'value2' });
  });

  it('should parse query string from URL', () => {
    const entry = makeEntry();
    const har = exportToHar([entry]);
    const qs = har.log.entries[0].request.queryString;

    expect(qs).toContainEqual({ name: 'page', value: '1' });
    expect(qs).toContainEqual({ name: 'limit', value: '10' });
  });

  it('should include POST data', () => {
    const entry = makePostEntry();
    const har = exportToHar([entry]);
    const postData = har.log.entries[0].request.postData;

    expect(postData).toBeDefined();
    expect(postData!.mimeType).toBe('application/json');
    expect(postData!.text).toBe('{"name":"Alice","email":"alice@example.com"}');
  });

  it('should map timing data correctly', () => {
    const entry = makeEntry();
    const har = exportToHar([entry]);
    const timings = har.log.entries[0].timings;

    expect(timings.wait).toBe(100);   // firstByte
    expect(timings.receive).toBe(50); // download
    expect(timings.dns).toBe(10);
    expect(timings.connect).toBe(20); // tcp
    expect(timings.ssl).toBe(30);     // tls
    expect(timings.send).toBe(0);
  });

  it('should set timing to -1 when timing data is undefined', () => {
    const entry = makeEntry({ timing: undefined });
    const har = exportToHar([entry]);
    const timings = har.log.entries[0].timings;

    expect(timings.dns).toBe(-1);
    expect(timings.connect).toBe(-1);
    expect(timings.ssl).toBe(-1);
    expect(timings.wait).toBe(0);
    expect(timings.receive).toBe(0);
  });

  it('should include error as comment', () => {
    const entry = makeEntry({ error: 'Connection refused' });
    const har = exportToHar([entry]);

    expect(har.log.entries[0].comment).toBe('Connection refused');
  });

  it('should include form-urlencoded params', () => {
    const entry = makeEntry({
      request: {
        method: 'POST',
        url: 'https://example.com/form',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'username=alice&password=secret',
        startTime: 1700000000000,
      },
    });
    const har = exportToHar([entry]);
    const postData = har.log.entries[0].request.postData;

    expect(postData).toBeDefined();
    expect(postData!.params).toContainEqual({ name: 'username', value: 'alice' });
    expect(postData!.params).toContainEqual({ name: 'password', value: 'secret' });
  });
});

describe('importFromHar', () => {
  it('should roundtrip: export then import produces equivalent data', () => {
    const original = [makeEntry(), makePostEntry()];
    const har = exportToHar(original);
    const imported = importFromHar(har);

    expect(imported).toHaveLength(2);

    // First entry
    expect(imported[0].request.method).toBe('GET');
    expect(imported[0].request.url).toBe(original[0].request.url);
    expect(imported[0].response).not.toBeNull();
    expect(imported[0].response!.statusCode).toBe(200);
    expect(imported[0].protocol).toBe('https');
    expect(imported[0].status).toBe('complete');

    // Second entry
    expect(imported[1].request.method).toBe('POST');
    expect(imported[1].response!.statusCode).toBe(201);
  });

  it('should detect https protocol', () => {
    const entries = [makeEntry({ protocol: 'https' })];
    const har = exportToHar(entries);
    const imported = importFromHar(har);

    expect(imported[0].protocol).toBe('https');
  });

  it('should detect http protocol', () => {
    const entry = makeEntry({
      request: {
        method: 'GET',
        url: 'http://example.com/api',
        headers: {},
        body: null,
        startTime: 1700000000000,
      },
      protocol: 'http',
    });
    const har = exportToHar([entry]);
    const imported = importFromHar(har);

    expect(imported[0].protocol).toBe('http');
  });

  it('should set status to error when response status is 0', () => {
    const entry = makeEntry({ response: null, status: 'error' });
    const har = exportToHar([entry]);
    const imported = importFromHar(har);

    expect(imported[0].status).toBe('error');
    expect(imported[0].response).toBeNull();
  });

  it('should handle various status codes', () => {
    const codes = [200, 301, 404, 500];
    for (const code of codes) {
      const entry = makeEntry({
        response: {
          statusCode: code,
          statusMessage: `Status ${code}`,
          headers: { 'content-type': 'text/plain' },
          body: 'body',
          endTime: 1700000000500,
        },
      });
      const har = exportToHar([entry]);
      const imported = importFromHar(har);

      expect(imported[0].response!.statusCode).toBe(code);
    }
  });

  it('should restore timing data', () => {
    const entry = makeEntry();
    const har = exportToHar([entry]);
    const imported = importFromHar(har);

    expect(imported[0].timing).toBeDefined();
    expect(imported[0].timing!.dns).toBe(10);
    expect(imported[0].timing!.tcp).toBe(20);
    expect(imported[0].timing!.tls).toBe(30);
    expect(imported[0].timing!.firstByte).toBe(100);
    expect(imported[0].timing!.download).toBe(50);
    expect(imported[0].timing!.total).toBe(500);
  });

  it('should restore error from comment', () => {
    const entry = makeEntry({ error: 'Timeout exceeded' });
    const har = exportToHar([entry]);
    const imported = importFromHar(har);

    expect(imported[0].error).toBe('Timeout exceeded');
  });

  it('should assign unique ids to imported entries', () => {
    const entries = [makeEntry(), makePostEntry()];
    const har = exportToHar(entries);
    const imported = importFromHar(har);

    expect(imported[0].id).toBeTruthy();
    expect(imported[1].id).toBeTruthy();
    expect(imported[0].id).not.toBe(imported[1].id);
  });
});

describe('exportToHarString / importFromHarString', () => {
  it('should serialize to valid JSON', () => {
    const str = exportToHarString([makeEntry()]);
    const parsed = JSON.parse(str);

    expect(parsed.log).toBeDefined();
    expect(parsed.log.version).toBe('1.2');
    expect(parsed.log.entries).toHaveLength(1);
  });

  it('should roundtrip through string serialization', () => {
    const original = [makeEntry(), makePostEntry()];
    const str = exportToHarString(original);
    const imported = importFromHarString(str);

    expect(imported).toHaveLength(2);
    expect(imported[0].request.method).toBe('GET');
    expect(imported[1].request.method).toBe('POST');
    expect(imported[0].response!.statusCode).toBe(200);
    expect(imported[1].response!.statusCode).toBe(201);
  });

  it('should produce pretty-printed JSON', () => {
    const str = exportToHarString([makeEntry()]);
    // Pretty-printed JSON has newlines and indentation
    expect(str).toContain('\n');
    expect(str).toContain('  ');
  });
});
