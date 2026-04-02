import { TrafficEntry, HarLog } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

function formatHeaders(
  headers: Record<string, string | string[] | undefined>
): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        result.push({ name, value: v });
      }
    } else {
      result.push({ name, value });
    }
  }
  return result;
}

function parseHeaders(
  harHeaders: Array<{ name: string; value: string }>
): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const { name, value } of harHeaders) {
    const existing = result[name];
    if (existing === undefined) {
      result[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[name] = [existing, value];
    }
  }
  return result;
}

function getBodySize(body: Buffer | string | null): number {
  if (body === null) return 0;
  if (Buffer.isBuffer(body)) return body.length;
  return Buffer.byteLength(body, 'utf-8');
}

function getBodyText(body: Buffer | string | null): string {
  if (body === null) return '';
  if (Buffer.isBuffer(body)) return body.toString('utf-8');
  return body;
}

function getMimeType(headers: Record<string, string | string[] | undefined>): string {
  const ct = headers['content-type'] ?? headers['Content-Type'];
  if (!ct) return 'application/octet-stream';
  const value = Array.isArray(ct) ? ct[0] : ct;
  return value ?? 'application/octet-stream';
}

function parseQueryString(url: string): Array<{ name: string; value: string }> {
  try {
    const parsed = new URL(url);
    const result: Array<{ name: string; value: string }> = [];
    parsed.searchParams.forEach((value, name) => {
      result.push({ name, value });
    });
    return result;
  } catch {
    return [];
  }
}

function parsePostData(
  body: Buffer | string | null,
  mimeType: string
): { mimeType: string; text: string; params?: Array<{ name: string; value: string }> } | undefined {
  if (body === null) return undefined;
  const text = getBodyText(body);
  if (!text) return undefined;

  const result: { mimeType: string; text: string; params?: Array<{ name: string; value: string }> } = {
    mimeType,
    text,
  };

  if (mimeType === 'application/x-www-form-urlencoded') {
    try {
      const params = new URLSearchParams(text);
      result.params = [];
      params.forEach((value, name) => {
        result.params!.push({ name, value });
      });
    } catch {
      // leave params undefined
    }
  }

  return result;
}

export function exportToHar(entries: TrafficEntry[]): HarLog {
  const harEntries = entries.map((entry) => {
    const requestMimeType = getMimeType(entry.request.headers);
    const startedDateTime = new Date(entry.request.startTime).toISOString();

    const time = entry.timing ? entry.timing.total : 0;

    const harEntry: HarLog['log']['entries'][number] = {
      startedDateTime,
      time,
      request: {
        method: entry.request.method,
        url: entry.request.url,
        httpVersion: entry.protocol.startsWith('https') ? 'HTTP/1.1' : 'HTTP/1.1',
        cookies: [],
        headers: formatHeaders(entry.request.headers),
        queryString: parseQueryString(entry.request.url),
        postData: parsePostData(entry.request.body, requestMimeType),
        headersSize: -1,
        bodySize: getBodySize(entry.request.body),
      },
      response: {
        status: entry.response?.statusCode ?? 0,
        statusText: entry.response?.statusMessage ?? '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: entry.response ? formatHeaders(entry.response.headers) : [],
        content: {
          size: entry.response ? getBodySize(entry.response.body) : 0,
          mimeType: entry.response ? getMimeType(entry.response.headers) : 'application/octet-stream',
          text: entry.response ? getBodyText(entry.response.body) : '',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: entry.response ? getBodySize(entry.response.body) : 0,
      },
      cache: {},
      timings: {
        send: 0,
        wait: entry.timing?.firstByte ?? 0,
        receive: entry.timing?.download ?? 0,
        dns: entry.timing?.dns ?? -1,
        connect: entry.timing?.tcp ?? -1,
        ssl: entry.timing?.tls ?? -1,
        blocked: -1,
      },
      comment: entry.error ?? '',
    };

    return harEntry;
  });

  return {
    log: {
      version: '1.2',
      creator: {
        name: 'HTTP Tools',
        version: '1.0.0',
      },
      entries: harEntries,
    },
  };
}

export function importFromHar(har: HarLog): TrafficEntry[] {
  return har.log.entries.map((harEntry) => {
    const startTime = new Date(harEntry.startedDateTime).getTime();
    const endTime = startTime + (harEntry.time ?? 0);

    const requestHeaders = parseHeaders(harEntry.request.headers);
    const responseHeaders = parseHeaders(harEntry.response.headers);

    const requestBody = harEntry.request.postData?.text ?? null;

    const responseBody = harEntry.response.content.text ?? null;

    const url = harEntry.request.url;
    let protocol: TrafficEntry['protocol'] = 'http';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') protocol = 'https';
      else if (parsed.protocol === 'wss:') protocol = 'wss';
      else if (parsed.protocol === 'ws:') protocol = 'ws';
    } catch {
      // default to http
    }

    let status: TrafficEntry['status'] = 'complete';
    if (harEntry.response.status === 0) {
      status = 'error';
    }

    const timings = harEntry.timings;
    const timing: TrafficEntry['timing'] = {
      start: startTime,
      dns: timings.dns !== undefined && timings.dns >= 0 ? timings.dns : undefined,
      tcp: timings.connect !== undefined && timings.connect >= 0 ? timings.connect : undefined,
      tls: timings.ssl !== undefined && timings.ssl >= 0 ? timings.ssl : undefined,
      firstByte: timings.wait >= 0 ? timings.wait : undefined,
      download: timings.receive >= 0 ? timings.receive : undefined,
      end: endTime,
      total: harEntry.time ?? 0,
    };

    const entry: TrafficEntry = {
      id: uuidv4(),
      request: {
        method: harEntry.request.method,
        url: harEntry.request.url,
        headers: requestHeaders,
        body: requestBody,
        startTime,
      },
      response:
        harEntry.response.status > 0
          ? {
              statusCode: harEntry.response.status,
              statusMessage: harEntry.response.statusText,
              headers: responseHeaders,
              body: responseBody,
              endTime,
            }
          : null,
      protocol,
      status,
      timing,
      ...(harEntry.comment ? { error: harEntry.comment } : {}),
    };

    return entry;
  });
}

export function exportToHarString(entries: TrafficEntry[]): string {
  const har = exportToHar(entries);
  return JSON.stringify(har, null, 2);
}

export function importFromHarString(data: string): TrafficEntry[] {
  const har: HarLog = JSON.parse(data);
  return importFromHar(har);
}
