import forge from 'node-forge';
import type { CACertificate } from '../../shared/types';

export interface HostCertificate {
  cert: string;
  key: string;
}

export class CertGenerator {
  private caCert: forge.pki.Certificate;
  private caKey: forge.pki.rsa.PrivateKey;
  private cache: Map<string, { cert: HostCertificate; expiresAt: number }> = new Map();

  constructor(ca: CACertificate) {
    this.caCert = forge.pki.certificateFromPem(ca.cert);
    this.caKey = forge.pki.privateKeyFromPem(ca.key) as forge.pki.rsa.PrivateKey;
  }

  generateForHost(hostname: string): HostCertificate {
    // Check cache first
    const cached = this.cache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.cert;
    }

    // Generate new key pair for this host
    // Using 1024-bit keys for speed (acceptable for local debugging proxy)
    const keys = forge.pki.rsa.generateKeyPair(1024);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();

    // Validity period (7 days for local debugging)
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Set subject
    cert.setSubject([
      { shortName: 'CN', value: hostname },
      { shortName: 'O', value: 'HTTP Tools Generated Certificate' },
    ]);

    // Set issuer (our CA)
    cert.setIssuer(this.caCert.subject.attributes);

    // Determine if hostname is an IP address
    const isIP = this.isIPAddress(hostname);

    // Set extensions
    const altNames: any[] = [];
    if (isIP) {
      altNames.push({ type: 7, ip: hostname }); // IP address
    } else {
      altNames.push({ type: 2, value: hostname }); // DNS name
      // Also add wildcard for subdomains
      if (!hostname.startsWith('*.')) {
        altNames.push({ type: 2, value: `*.${hostname}` });
      }
    }

    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false,
        critical: true,
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        critical: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames,
      },
    ]);

    // Sign with CA private key
    cert.sign(this.caKey, forge.md.sha256.create());

    // Convert to PEM
    const hostCert: HostCertificate = {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };

    // Cache it (expires 1 hour before cert expires for safety)
    this.cache.set(hostname, {
      cert: hostCert,
      expiresAt: cert.validity.notAfter.getTime() - 60 * 60 * 1000,
    });

    return hostCert;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  private generateSerialNumber(): string {
    const bytes = forge.random.getBytesSync(16);
    return forge.util.bytesToHex(bytes);
  }

  private isIPAddress(hostname: string): boolean {
    // IPv4
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return true;
    }
    // IPv6
    if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(hostname)) {
      return true;
    }
    return false;
  }
}
