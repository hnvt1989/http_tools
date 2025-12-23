import forge from 'node-forge';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type { CACertificate } from '../../shared/types';

export class CAGenerator {
  private certsDir: string;
  private caKeyPath: string;
  private caCertPath: string;
  private ca: CACertificate | null = null;

  constructor() {
    this.certsDir = path.join(app.getPath('userData'), 'certificates');
    this.caKeyPath = path.join(this.certsDir, 'ca.key');
    this.caCertPath = path.join(this.certsDir, 'ca.crt');
  }

  async initialize(): Promise<CACertificate> {
    await fs.mkdir(this.certsDir, { recursive: true });

    try {
      this.ca = await this.loadExistingCA();

      // Check if CA is expired or will expire soon (within 30 days)
      const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
      if (this.ca.expiresAt < thirtyDaysFromNow) {
        console.log('CA certificate is expiring soon, regenerating...');
        this.ca = await this.generateNewCA();
      }
    } catch {
      this.ca = await this.generateNewCA();
    }

    return this.ca;
  }

  async regenerate(): Promise<CACertificate> {
    this.ca = await this.generateNewCA();
    return this.ca;
  }

  getCA(): CACertificate | null {
    return this.ca;
  }

  private async generateNewCA(): Promise<CACertificate> {
    // Generate RSA key pair (2048 bits for performance, 4096 for security)
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();

    // Set validity (1 year)
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(now.getFullYear() + 1);

    // Set subject and issuer (same for CA, it's self-signed)
    const attrs = [
      { shortName: 'C', value: 'US' },
      { shortName: 'ST', value: 'California' },
      { shortName: 'L', value: 'San Francisco' },
      { shortName: 'O', value: 'HTTP Tools' },
      { shortName: 'OU', value: 'Development' },
      { shortName: 'CN', value: 'HTTP Tools Proxy CA' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Set extensions for CA - using proper format for macOS compatibility
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: true,
        critical: true,
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        cRLSign: true,
        digitalSignature: true,
        critical: true,
      },
      {
        name: 'subjectKeyIdentifier',
      },
    ]);

    // Self-sign with SHA-256
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Calculate fingerprint (SHA-256)
    const fingerprint = forge.md.sha256
      .create()
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
      .digest()
      .toHex()
      .match(/.{2}/g)!
      .join(':')
      .toUpperCase();

    // Save to disk
    await fs.writeFile(this.caCertPath, certPem, 'utf-8');
    await fs.writeFile(this.caKeyPath, keyPem, 'utf-8');

    const ca: CACertificate = {
      cert: certPem,
      key: keyPem,
      fingerprint,
      createdAt: cert.validity.notBefore.getTime(),
      expiresAt: cert.validity.notAfter.getTime(),
    };

    return ca;
  }

  private async loadExistingCA(): Promise<CACertificate> {
    const certPem = await fs.readFile(this.caCertPath, 'utf-8');
    const keyPem = await fs.readFile(this.caKeyPath, 'utf-8');

    const cert = forge.pki.certificateFromPem(certPem);

    const fingerprint = forge.md.sha256
      .create()
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
      .digest()
      .toHex()
      .match(/.{2}/g)!
      .join(':')
      .toUpperCase();

    return {
      cert: certPem,
      key: keyPem,
      fingerprint,
      createdAt: cert.validity.notBefore.getTime(),
      expiresAt: cert.validity.notAfter.getTime(),
    };
  }

  private generateSerialNumber(): string {
    // Generate a random serial number
    const bytes = forge.random.getBytesSync(16);
    return forge.util.bytesToHex(bytes);
  }
}
