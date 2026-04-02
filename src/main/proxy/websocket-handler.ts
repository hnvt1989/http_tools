import http from 'http';
import https from 'https';
import tls from 'tls';
import stream from 'stream';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type {
  RequestData,
  WebSocketMessage,
  WebSocketEntry,
} from '../../shared/types';

// WebSocket opcodes per RFC 6455
const OPCODE_TEXT = 0x1;
const OPCODE_BINARY = 0x2;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

interface ParsedFrame {
  fin: boolean;
  opcode: number;
  masked: boolean;
  payloadLength: number;
  maskKey: Buffer | null;
  payload: Buffer;
  totalLength: number; // total bytes consumed from the buffer
}

/**
 * Parse a single WebSocket frame from a buffer.
 * Returns null if the buffer does not contain a complete frame.
 */
function parseFrame(buffer: Buffer): ParsedFrame | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;

  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    // Read 64-bit length. JavaScript numbers can safely represent up to 2^53,
    // so we read the high and low 32-bit parts separately.
    const high = buffer.readUInt32BE(2);
    const low = buffer.readUInt32BE(6);
    payloadLength = high * 0x100000000 + low;
    offset = 10;
  }

  let maskKey: Buffer | null = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;

  let payload = buffer.slice(offset, offset + payloadLength);

  // Unmask if needed (for reading purposes; the raw frame is relayed as-is)
  if (masked && maskKey) {
    payload = Buffer.from(payload); // copy so we don't mutate the original buffer
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return {
    fin,
    opcode,
    masked,
    payloadLength,
    maskKey,
    payload,
    totalLength: offset + payloadLength,
  };
}

export class WebSocketHandler extends EventEmitter {
  private connections: Map<string, WebSocketEntry> = new Map();

  constructor() {
    super();
  }

  /**
   * Handle a WebSocket upgrade request arriving on a plain HTTP connection.
   * The proxy server should call this when it detects an `Upgrade: websocket` header
   * on an `upgrade` event.
   */
  handleUpgrade(
    req: http.IncomingMessage,
    socket: stream.Duplex,
    head: Buffer
  ): void {
    const wsId = uuid();
    const url = req.url || '/';
    const host = req.headers.host || 'localhost';
    const fullUrl = `ws://${host}${url}`;
    const port = parseInt((host.split(':')[1]) || '80', 10);
    const hostname = host.split(':')[0];

    const requestData: RequestData = {
      method: req.method || 'GET',
      url: fullUrl,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: null,
      startTime: Date.now(),
    };

    const entry: WebSocketEntry = {
      id: wsId,
      url: fullUrl,
      protocol: 'ws',
      status: 'connecting',
      request: requestData,
      messages: [],
      startTime: Date.now(),
    };

    this.connections.set(wsId, entry);
    this.emit('websocket:new', entry);

    // Build the upgrade request to the target server
    const targetOptions: http.RequestOptions = {
      hostname,
      port,
      path: url,
      method: 'GET',
      headers: { ...req.headers } as Record<string, string>,
    };

    const proxyReq = http.request(targetOptions);

    proxyReq.on('upgrade', (proxyRes, serverSocket, serverHead) => {
      this.completeUpgrade(
        wsId,
        entry,
        socket,
        serverSocket,
        proxyRes,
        head,
        serverHead
      );
    });

    proxyReq.on('error', (err) => {
      entry.status = 'error';
      entry.error = err.message;
      entry.endTime = Date.now();
      this.emit('websocket:error', wsId, err.message);
      socket.destroy();
    });

    proxyReq.end();
  }

  /**
   * Handle a WebSocket upgrade request that arrived over an HTTPS (TLS) connection.
   * Called after the proxy has already performed the MITM TLS unwrap, so `socket`
   * is the decrypted TLS socket talking to the client.
   *
   * We need to establish a new TLS connection to the real server and relay the
   * WebSocket handshake + frames.
   */
  handleSecureUpgrade(
    hostname: string,
    port: number,
    method: string,
    path: string,
    headers: Record<string, string>,
    socket: tls.TLSSocket
  ): void {
    const wsId = uuid();
    const fullUrl = `wss://${hostname}${port !== 443 ? `:${port}` : ''}${path}`;

    const requestData: RequestData = {
      method,
      url: fullUrl,
      headers,
      body: null,
      startTime: Date.now(),
    };

    const entry: WebSocketEntry = {
      id: wsId,
      url: fullUrl,
      protocol: 'wss',
      status: 'connecting',
      request: requestData,
      messages: [],
      startTime: Date.now(),
    };

    this.connections.set(wsId, entry);
    this.emit('websocket:new', entry);

    // Connect to the real server over TLS
    const targetOptions: https.RequestOptions = {
      hostname,
      port,
      path,
      method: 'GET',
      headers: { ...headers },
      rejectUnauthorized: false,
      servername: hostname,
    };

    const proxyReq = https.request(targetOptions);

    proxyReq.on('upgrade', (proxyRes, serverSocket, serverHead) => {
      // Build the 101 response to send back to the client
      const statusLine = `HTTP/1.1 101 Switching Protocols\r\n`;
      const responseHeaders = Object.entries(proxyRes.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n');
      const handshakeResponse = `${statusLine}${responseHeaders}\r\n\r\n`;

      socket.write(handshakeResponse);

      entry.status = 'open';
      this.emit('websocket:new', entry);

      if (serverHead && serverHead.length > 0) {
        socket.write(serverHead);
      }

      this.bridgeSockets(wsId, entry, socket, serverSocket);
    });

    proxyReq.on('response', (res) => {
      // The server rejected the upgrade; forward the HTTP response back to the client
      const statusLine = `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`;
      const responseHeaders = Object.entries(res.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n');

      socket.write(`${statusLine}${responseHeaders}\r\n\r\n`);
      res.pipe(socket);

      entry.status = 'error';
      entry.error = `Server rejected upgrade with status ${res.statusCode}`;
      entry.endTime = Date.now();
      this.emit('websocket:error', wsId, entry.error);
    });

    proxyReq.on('error', (err) => {
      entry.status = 'error';
      entry.error = err.message;
      entry.endTime = Date.now();
      this.emit('websocket:error', wsId, err.message);
      socket.destroy();
    });

    proxyReq.end();
  }

  /**
   * Get all tracked WebSocket connections (both active and closed).
   */
  getConnections(): WebSocketEntry[] {
    return Array.from(this.connections.values());
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Complete the upgrade handshake for plain HTTP WebSocket connections.
   * Forwards the 101 response from the server back to the client, then
   * bridges the two sockets.
   */
  private completeUpgrade(
    wsId: string,
    entry: WebSocketEntry,
    clientSocket: stream.Duplex,
    serverSocket: stream.Duplex,
    proxyRes: http.IncomingMessage,
    clientHead: Buffer,
    serverHead: Buffer
  ): void {
    // Forward the 101 response to the client
    const statusLine = `HTTP/1.1 101 Switching Protocols\r\n`;
    const responseHeaders = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    const handshakeResponse = `${statusLine}${responseHeaders}\r\n\r\n`;

    clientSocket.write(handshakeResponse);

    entry.status = 'open';

    // Write any buffered data
    if (serverHead && serverHead.length > 0) {
      clientSocket.write(serverHead);
    }
    if (clientHead && clientHead.length > 0) {
      serverSocket.write(clientHead);
    }

    this.bridgeSockets(wsId, entry, clientSocket, serverSocket);
  }

  /**
   * Bridge two sockets bidirectionally, parsing WebSocket frames as they
   * pass through in order to capture messages and emit events.
   * The raw bytes are always relayed without modification.
   */
  private bridgeSockets(
    wsId: string,
    entry: WebSocketEntry,
    clientSocket: stream.Duplex,
    serverSocket: stream.Duplex
  ): void {
    let clientBuffer: Buffer = Buffer.alloc(0);
    let serverBuffer: Buffer = Buffer.alloc(0);

    // Client -> Server (direction: 'sent')
    clientSocket.on('data', (data) => {
      // Relay raw bytes immediately
      serverSocket.write(data);

      // Parse frames for capture
      clientBuffer = Buffer.concat([clientBuffer, data as any]) as Buffer;
      clientBuffer = this.extractFrames(clientBuffer, wsId, entry, 'sent');
    });

    // Server -> Client (direction: 'received')
    serverSocket.on('data', (data) => {
      // Relay raw bytes immediately
      clientSocket.write(data);

      // Parse frames for capture
      serverBuffer = Buffer.concat([serverBuffer, data as any]) as Buffer;
      serverBuffer = this.extractFrames(serverBuffer, wsId, entry, 'received');
    });

    // Handle close and error events
    const cleanup = (code?: number, reason?: string) => {
      if (entry.status === 'closed' || entry.status === 'error') return;

      entry.status = 'closed';
      entry.endTime = Date.now();
      entry.closeCode = code;
      entry.closeReason = reason;

      this.emit('websocket:closed', wsId, code, reason);

      clientSocket.destroy();
      serverSocket.destroy();
    };

    clientSocket.on('close', () => cleanup());
    serverSocket.on('close', () => cleanup());

    clientSocket.on('error', (err) => {
      if (entry.status !== 'closed') {
        entry.status = 'error';
        entry.error = `Client error: ${err.message}`;
        entry.endTime = Date.now();
        this.emit('websocket:error', wsId, entry.error);
      }
      serverSocket.destroy();
    });

    serverSocket.on('error', (err) => {
      if (entry.status !== 'closed') {
        entry.status = 'error';
        entry.error = `Server error: ${err.message}`;
        entry.endTime = Date.now();
        this.emit('websocket:error', wsId, entry.error);
      }
      clientSocket.destroy();
    });
  }

  /**
   * Extract complete WebSocket frames from a buffer, emitting message events
   * for data frames. Returns the remaining (incomplete) buffer.
   */
  private extractFrames(
    buffer: Buffer,
    wsId: string,
    entry: WebSocketEntry,
    direction: 'sent' | 'received'
  ): Buffer {
    while (buffer.length > 0) {
      const frame = parseFrame(buffer);
      if (!frame) break;

      // Advance the buffer past this frame
      buffer = buffer.slice(frame.totalLength);

      // Handle close frames to capture close code/reason
      if (frame.opcode === OPCODE_CLOSE) {
        let code: number | undefined;
        let reason: string | undefined;

        if (frame.payload.length >= 2) {
          code = frame.payload.readUInt16BE(0);
          if (frame.payload.length > 2) {
            reason = frame.payload.slice(2).toString('utf-8');
          }
        }

        // Record close info on the entry
        if (code !== undefined) {
          entry.closeCode = code;
          entry.closeReason = reason;
        }
      }

      // Capture data frames and control frames as messages
      if (
        frame.opcode === OPCODE_TEXT ||
        frame.opcode === OPCODE_BINARY ||
        frame.opcode === OPCODE_CLOSE ||
        frame.opcode === OPCODE_PING ||
        frame.opcode === OPCODE_PONG
      ) {
        const message: WebSocketMessage = {
          id: uuid(),
          direction,
          opcode: frame.opcode,
          data:
            frame.opcode === OPCODE_TEXT
              ? frame.payload.toString('utf-8')
              : frame.payload,
          timestamp: Date.now(),
          size: frame.payloadLength,
        };

        entry.messages.push(message);
        this.emit('websocket:message', wsId, message);
      }
    }

    return buffer;
  }
}
