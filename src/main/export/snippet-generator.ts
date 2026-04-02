import { SnippetLanguage } from '../../shared/types';

interface SnippetRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | string | null;
}

function getBodyString(body: Buffer | string | null): string | null {
  if (body === null) return null;
  if (Buffer.isBuffer(body)) return body.toString('utf-8');
  return body;
}

function flattenHeaders(
  headers: Record<string, string | string[] | undefined>
): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        result.push([name, v]);
      }
    } else {
      result.push([name, value]);
    }
  }
  return result;
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:@=&?%+-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function jsonStringEscape(s: string): string {
  return JSON.stringify(s);
}

function generateCurl(request: SnippetRequest): string {
  const parts: string[] = ['curl'];
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);

  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  parts.push(shellEscape(request.url));

  for (const [name, value] of headers) {
    parts.push(`-H ${shellEscape(`${name}: ${value}`)}`);
  }

  if (body) {
    parts.push(`-d ${shellEscape(body)}`);
  }

  return parts.join(' \\\n  ');
}

function generatePython(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('import requests');
  lines.push('');

  lines.push(`url = ${jsonStringEscape(request.url)}`);

  if (headers.length > 0) {
    lines.push('headers = {');
    for (const [name, value] of headers) {
      lines.push(`    ${jsonStringEscape(name)}: ${jsonStringEscape(value)},`);
    }
    lines.push('}');
  }

  if (body) {
    lines.push(`data = ${jsonStringEscape(body)}`);
  }

  lines.push('');

  const args: string[] = ['url'];
  if (headers.length > 0) args.push('headers=headers');
  if (body) args.push('data=data');

  lines.push(`response = requests.${request.method.toLowerCase()}(${args.join(', ')})`);
  lines.push('');
  lines.push('print(response.status_code)');
  lines.push('print(response.text)');

  return lines.join('\n');
}

function generateJavaScript(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push(`const response = await fetch(${jsonStringEscape(request.url)}, {`);
  lines.push(`  method: ${jsonStringEscape(request.method)},`);

  if (headers.length > 0) {
    lines.push('  headers: {');
    for (const [name, value] of headers) {
      lines.push(`    ${jsonStringEscape(name)}: ${jsonStringEscape(value)},`);
    }
    lines.push('  },');
  }

  if (body) {
    lines.push(`  body: ${jsonStringEscape(body)},`);
  }

  lines.push('});');
  lines.push('');
  lines.push('const data = await response.text();');
  lines.push('console.log(response.status);');
  lines.push('console.log(data);');

  return lines.join('\n');
}

function generateGo(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('\t"fmt"');
  lines.push('\t"io"');
  lines.push('\t"net/http"');
  if (body) {
    lines.push('\t"strings"');
  }
  lines.push(')');
  lines.push('');
  lines.push('func main() {');

  if (body) {
    lines.push(`\tbody := strings.NewReader(${jsonStringEscape(body)})`);
    lines.push(`\treq, err := http.NewRequest(${jsonStringEscape(request.method)}, ${jsonStringEscape(request.url)}, body)`);
  } else {
    lines.push(`\treq, err := http.NewRequest(${jsonStringEscape(request.method)}, ${jsonStringEscape(request.url)}, nil)`);
  }

  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');

  for (const [name, value] of headers) {
    lines.push(`\treq.Header.Set(${jsonStringEscape(name)}, ${jsonStringEscape(value)})`);
  }

  lines.push('');
  lines.push('\tclient := &http.Client{}');
  lines.push('\tresp, err := client.Do(req)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('');
  lines.push('\trespBody, err := io.ReadAll(resp.Body)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('');
  lines.push('\tfmt.Println(resp.StatusCode)');
  lines.push('\tfmt.Println(string(respBody))');
  lines.push('}');

  return lines.join('\n');
}

function generateRuby(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push("require 'net/http'");
  lines.push("require 'uri'");
  lines.push('');
  lines.push(`uri = URI.parse(${jsonStringEscape(request.url)})`);
  lines.push('http = Net::HTTP.new(uri.host, uri.port)');
  lines.push('');

  lines.push('if uri.scheme == "https"');
  lines.push('  http.use_ssl = true');
  lines.push('end');
  lines.push('');

  const rubyMethodMap: Record<string, string> = {
    GET: 'Net::HTTP::Get',
    POST: 'Net::HTTP::Post',
    PUT: 'Net::HTTP::Put',
    DELETE: 'Net::HTTP::Delete',
    PATCH: 'Net::HTTP::Patch',
    HEAD: 'Net::HTTP::Head',
    OPTIONS: 'Net::HTTP::Options',
  };

  const methodClass = rubyMethodMap[request.method.toUpperCase()] ?? 'Net::HTTP::Get';
  lines.push(`request = ${methodClass}.new(uri.request_uri)`);

  for (const [name, value] of headers) {
    lines.push(`request[${jsonStringEscape(name)}] = ${jsonStringEscape(value)}`);
  }

  if (body) {
    lines.push(`request.body = ${jsonStringEscape(body)}`);
  }

  lines.push('');
  lines.push('response = http.request(request)');
  lines.push('');
  lines.push('puts response.code');
  lines.push('puts response.body');

  return lines.join('\n');
}

function generatePhp(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('<?php');
  lines.push('');
  lines.push('$ch = curl_init();');
  lines.push('');
  lines.push(`curl_setopt($ch, CURLOPT_URL, ${jsonStringEscape(request.url)});`);
  lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');

  if (request.method !== 'GET') {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${jsonStringEscape(request.method)});`);
  }

  if (headers.length > 0) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    for (const [name, value] of headers) {
      lines.push(`    ${jsonStringEscape(`${name}: ${value}`)},`);
    }
    lines.push(']);');
  }

  if (body) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${jsonStringEscape(body)});`);
  }

  lines.push('');
  lines.push('$response = curl_exec($ch);');
  lines.push('$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
  lines.push('');
  lines.push('if (curl_errno($ch)) {');
  lines.push('    echo "Error: " . curl_error($ch) . "\\n";');
  lines.push('}');
  lines.push('');
  lines.push('curl_close($ch);');
  lines.push('');
  lines.push('echo $httpCode . "\\n";');
  lines.push('echo $response . "\\n";');

  return lines.join('\n');
}

function generateJava(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('import java.io.BufferedReader;');
  lines.push('import java.io.InputStreamReader;');
  if (body) {
    lines.push('import java.io.OutputStream;');
  }
  lines.push('import java.net.HttpURLConnection;');
  lines.push('import java.net.URL;');
  lines.push('');
  lines.push('public class Request {');
  lines.push('    public static void main(String[] args) throws Exception {');
  lines.push(`        URL url = new URL(${jsonStringEscape(request.url)});`);
  lines.push('        HttpURLConnection conn = (HttpURLConnection) url.openConnection();');
  lines.push(`        conn.setRequestMethod(${jsonStringEscape(request.method)});`);

  for (const [name, value] of headers) {
    lines.push(`        conn.setRequestProperty(${jsonStringEscape(name)}, ${jsonStringEscape(value)});`);
  }

  if (body) {
    lines.push('        conn.setDoOutput(true);');
    lines.push('        try (OutputStream os = conn.getOutputStream()) {');
    lines.push(`            byte[] input = ${jsonStringEscape(body)}.getBytes("utf-8");`);
    lines.push('            os.write(input, 0, input.length);');
    lines.push('        }');
  }

  lines.push('');
  lines.push('        int responseCode = conn.getResponseCode();');
  lines.push('        System.out.println(responseCode);');
  lines.push('');
  lines.push('        try (BufferedReader br = new BufferedReader(');
  lines.push('                new InputStreamReader(conn.getInputStream(), "utf-8"))) {');
  lines.push('            StringBuilder response = new StringBuilder();');
  lines.push('            String line;');
  lines.push('            while ((line = br.readLine()) != null) {');
  lines.push('                response.append(line.trim());');
  lines.push('            }');
  lines.push('            System.out.println(response.toString());');
  lines.push('        }');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

function generateCsharp(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('using System;');
  lines.push('using System.Net.Http;');
  lines.push('using System.Text;');
  lines.push('using System.Threading.Tasks;');
  lines.push('');
  lines.push('class Program');
  lines.push('{');
  lines.push('    static async Task Main(string[] args)');
  lines.push('    {');
  lines.push('        using var client = new HttpClient();');

  const contentHeaders = ['content-type', 'content-length', 'content-encoding'];
  const nonContentHeaders = headers.filter(
    ([name]) => !contentHeaders.includes(name.toLowerCase())
  );

  for (const [name, value] of nonContentHeaders) {
    lines.push(`        client.DefaultRequestHeaders.Add(${jsonStringEscape(name)}, ${jsonStringEscape(value)});`);
  }

  lines.push('');

  const methodMap: Record<string, string> = {
    GET: 'HttpMethod.Get',
    POST: 'HttpMethod.Post',
    PUT: 'HttpMethod.Put',
    DELETE: 'HttpMethod.Delete',
    PATCH: 'HttpMethod.Patch',
    HEAD: 'HttpMethod.Head',
    OPTIONS: 'HttpMethod.Options',
  };

  const httpMethod = methodMap[request.method.toUpperCase()] ?? `new HttpMethod(${jsonStringEscape(request.method)})`;

  lines.push(`        var request = new HttpRequestMessage(${httpMethod}, ${jsonStringEscape(request.url)});`);

  if (body) {
    const contentType = headers.find(([name]) => name.toLowerCase() === 'content-type');
    const mediaType = contentType ? contentType[1] : 'application/json';
    lines.push(`        request.Content = new StringContent(${jsonStringEscape(body)}, Encoding.UTF8, ${jsonStringEscape(mediaType)});`);
  }

  lines.push('');
  lines.push('        var response = await client.SendAsync(request);');
  lines.push('        var responseBody = await response.Content.ReadAsStringAsync();');
  lines.push('');
  lines.push('        Console.WriteLine((int)response.StatusCode);');
  lines.push('        Console.WriteLine(responseBody);');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

function generateRust(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const lines: string[] = [];

  lines.push('// Add to Cargo.toml:');
  lines.push('// [dependencies]');
  lines.push('// reqwest = { version = "0.11", features = ["blocking"] }');
  lines.push('');
  lines.push('use reqwest::blocking::Client;');
  lines.push('use reqwest::header::{HeaderMap, HeaderName, HeaderValue};');
  lines.push('');
  lines.push('fn main() -> Result<(), Box<dyn std::error::Error>> {');
  lines.push('    let client = Client::new();');
  lines.push('');
  lines.push('    let mut headers = HeaderMap::new();');

  for (const [name, value] of headers) {
    lines.push(`    headers.insert(${jsonStringEscape(name)}.parse::<HeaderName>()?, ${jsonStringEscape(value)}.parse::<HeaderValue>()?);`);
  }

  lines.push('');

  const rustMethod = request.method.toLowerCase();
  if (body) {
    lines.push(`    let response = client.${rustMethod}(${jsonStringEscape(request.url)})`);
    lines.push('        .headers(headers)');
    lines.push(`        .body(${jsonStringEscape(body)})`);
    lines.push('        .send()?;');
  } else {
    lines.push(`    let response = client.${rustMethod}(${jsonStringEscape(request.url)})`);
    lines.push('        .headers(headers)');
    lines.push('        .send()?;');
  }

  lines.push('');
  lines.push('    println!("{}", response.status());');
  lines.push('    println!("{}", response.text()?);');
  lines.push('');
  lines.push('    Ok(())');
  lines.push('}');

  return lines.join('\n');
}

function generateHttpie(request: SnippetRequest): string {
  const headers = flattenHeaders(request.headers);
  const body = getBodyString(request.body);
  const parts: string[] = ['http'];

  if (request.method !== 'GET') {
    parts.push(request.method);
  }

  parts.push(shellEscape(request.url));

  for (const [name, value] of headers) {
    parts.push(`${shellEscape(name)}:${shellEscape(value)}`);
  }

  if (body) {
    // Try to parse as JSON for HTTPie's JSON syntax
    try {
      JSON.parse(body);
      // If valid JSON, pipe it via echo
      return `echo ${shellEscape(body)} | ${parts.join(' \\\n  ')}`;
    } catch {
      // Use raw body via stdin
      return `echo ${shellEscape(body)} | ${parts.join(' \\\n  ')}`;
    }
  }

  return parts.join(' \\\n  ');
}

export function generateSnippet(
  language: SnippetLanguage,
  request: {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer | string | null;
  }
): string {
  switch (language) {
    case 'curl':
      return generateCurl(request);
    case 'python':
      return generatePython(request);
    case 'javascript':
      return generateJavaScript(request);
    case 'go':
      return generateGo(request);
    case 'ruby':
      return generateRuby(request);
    case 'php':
      return generatePhp(request);
    case 'java':
      return generateJava(request);
    case 'csharp':
      return generateCsharp(request);
    case 'rust':
      return generateRust(request);
    case 'httpie':
      return generateHttpie(request);
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}
