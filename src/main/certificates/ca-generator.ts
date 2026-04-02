import forge from 'node-forge';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CACertificate } from '../../shared/types';

const execAsync = promisify(exec);

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

  /**
   * Get the path to the CA certificate file
   */
  getCertPath(): string {
    return this.caCertPath;
  }

  /**
   * Check if the CA certificate is installed and trusted in the login keychain (macOS)
   */
  async isCAInstalledInKeychain(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      // Search for our CA in the login keychain by name
      const { stdout } = await execAsync(
        `security find-certificate -c "HTTP Tools Proxy CA" ~/Library/Keychains/login.keychain-db 2>/dev/null || true`
      );
      return stdout.includes('HTTP Tools Proxy CA');
    } catch {
      return false;
    }
  }

  /**
   * Install the CA certificate in the user's login keychain (macOS)
   * This doesn't require admin privileges
   */
  async installCAInKeychain(): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' };
    }

    try {
      // First, remove any existing HTTP Tools CA certificates to avoid duplicates
      try {
        await execAsync(
          `security delete-certificate -c "HTTP Tools Proxy CA" ~/Library/Keychains/login.keychain-db 2>/dev/null || true`
        );
      } catch {
        // Ignore errors if certificate doesn't exist
      }

      // Add the certificate to the user's login keychain
      await execAsync(
        `security add-certificates -k ~/Library/Keychains/login.keychain-db "${this.caCertPath}"`
      );

      // Trust the certificate for SSL - this will show a macOS prompt asking user to trust
      // Using add-trusted-cert with user keychain
      await execAsync(
        `security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "${this.caCertPath}"`
      );

      console.log('CA certificate installed in login keychain');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to install CA in keychain:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove the CA certificate from the login keychain (macOS)
   */
  async removeCAFromKeychain(): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Only supported on macOS' };
    }

    try {
      await execAsync(
        `security delete-certificate -c "HTTP Tools Proxy CA" ~/Library/Keychains/login.keychain-db`
      );

      console.log('CA certificate removed from login keychain');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
