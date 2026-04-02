import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { CACertificate } from '../../shared/types';

const execAsync = promisify(exec);

interface ProfileSetupResult {
  profileDir: string;
  method: 'nss' | 'policy' | 'fallback';
  success: boolean;
  error?: string;
}

/**
 * Sets up a Chrome profile with the CA certificate properly trusted.
 * This ensures that the launched Chrome browser trusts the proxy's CA
 * without requiring system-wide certificate installation.
 */
export class ChromeProfileSetup {
  private ca: CACertificate;

  constructor(ca: CACertificate) {
    this.ca = ca;
  }

  /**
   * Creates and configures a Chrome profile with CA trust.
   * Tries multiple methods in order of preference:
   * 1. NSS database (certutil) - Best compatibility
   * 2. Chrome policies - Works on some platforms
   * 3. Fallback flags - Last resort
   */
  async setupProfile(baseDir?: string): Promise<ProfileSetupResult> {
    const profileDir = baseDir || `/tmp/http-tools-chrome-${Date.now()}`;

    // Ensure profile directory exists
    await fs.mkdir(profileDir, { recursive: true });

    // Try NSS database method first (works best with Chrome)
    const nssResult = await this.setupNSSDatabase(profileDir);
    if (nssResult.success) {
      return { profileDir, method: 'nss', success: true };
    }

    // Try Chrome policy method
    const policyResult = await this.setupChromePolicy(profileDir);
    if (policyResult.success) {
      return { profileDir, method: 'policy', success: true };
    }

    // Fallback - profile is created but CA not installed
    // Browser will need --ignore-certificate-errors flag
    return {
      profileDir,
      method: 'fallback',
      success: false,
      error: `NSS: ${nssResult.error}, Policy: ${policyResult.error}`,
    };
  }

  /**
   * Sets up NSS database with trusted CA certificate.
   * This is the preferred method as it properly integrates with Chrome's
   * certificate trust system.
   */
  private async setupNSSDatabase(profileDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if certutil is available
      const certutilPath = await this.findCertutil();
      if (!certutilPath) {
        return { success: false, error: 'certutil not found' };
      }

      // Chrome stores NSS database in the profile directory
      const nssDir = profileDir;

      // Write CA certificate to a temp file
      const caCertPath = path.join(profileDir, 'http-tools-ca.crt');
      await fs.writeFile(caCertPath, this.ca.cert, 'utf-8');

      // Create NSS database if it doesn't exist
      // The -d sql: prefix is for the new SQLite format Chrome uses
      const dbPath = `sql:${nssDir}`;

      try {
        // Initialize the NSS database
        await execAsync(`"${certutilPath}" -N -d "${dbPath}" --empty-password`);
      } catch {
        // Database might already exist, continue
      }

      // Add the CA certificate as trusted for SSL
      // -t "C,," means trusted for SSL client auth
      // -t "CT,," means trusted for SSL with trust anchor
      await execAsync(
        `"${certutilPath}" -A -n "HTTP Tools Proxy CA" -t "CT,C,C" -i "${caCertPath}" -d "${dbPath}"`
      );

      // Verify the certificate was added
      const { stdout } = await execAsync(`"${certutilPath}" -L -d "${dbPath}"`);
      if (!stdout.includes('HTTP Tools Proxy CA')) {
        return { success: false, error: 'CA certificate not found after import' };
      }

      console.log('Successfully set up NSS database with CA certificate');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Sets up Chrome policy to trust the CA certificate.
   * This method works by creating a policy file that Chrome reads on startup.
   */
  private async setupChromePolicy(profileDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Write CA certificate to profile
      const caCertPath = path.join(profileDir, 'http-tools-ca.crt');
      await fs.writeFile(caCertPath, this.ca.cert, 'utf-8');

      if (process.platform === 'darwin') {
        // On macOS, Chrome reads policies from specific locations
        // We can try to set up a user-level policy
        const policyDir = path.join(
          process.env.HOME || '',
          'Library/Application Support/Google/Chrome/policies/managed'
        );

        await fs.mkdir(policyDir, { recursive: true });

        // Create policy to add CA certificate
        const policy = {
          // This tells Chrome to not show certificate errors for this CA
          CertificateTransparencyEnforcementDisabledForCas: [
            this.ca.fingerprint.replace(/:/g, ''),
          ],
        };

        await fs.writeFile(
          path.join(policyDir, 'http-tools-policy.json'),
          JSON.stringify(policy, null, 2)
        );

        return { success: true };
      }

      return { success: false, error: 'Policy method not supported on this platform' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Finds the certutil executable on the system.
   */
  private async findCertutil(): Promise<string | null> {
    const possiblePaths = [
      // macOS Homebrew
      '/opt/homebrew/bin/certutil',
      '/usr/local/bin/certutil',
      // Linux
      '/usr/bin/certutil',
      // Windows
      'C:\\Program Files\\Mozilla Firefox\\certutil.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\certutil.exe',
    ];

    // Check PATH first
    try {
      const { stdout } = await execAsync(
        process.platform === 'win32' ? 'where certutil' : 'which certutil'
      );
      const certutilPath = stdout.trim().split('\n')[0];
      if (certutilPath && !certutilPath.includes('System32')) {
        // On Windows, exclude the built-in certutil which is different
        return certutilPath;
      }
    } catch {
      // Not in PATH, try known locations
    }

    // Check known locations
    for (const certutilPath of possiblePaths) {
      try {
        await fs.access(certutilPath);
        return certutilPath;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Returns Chrome launch arguments based on the setup method used.
   *
   * Note: On macOS, Chrome uses the system keychain for certificate trust,
   * not NSS databases. Therefore, we always need --ignore-certificate-errors
   * on macOS for HTTPS interception to work properly.
   */
  /**
   * Returns Chrome launch arguments.
   * @param setupResult - Profile setup result
   * @param proxyPort - Proxy server port
   * @param caInstalledInKeychain - If true, CA is trusted in system keychain, no need for --ignore-certificate-errors
   */
  static getLaunchArgs(setupResult: ProfileSetupResult, proxyPort: number, caInstalledInKeychain = false): string[] {
    const baseArgs = [
      `--proxy-server=http://localhost:${proxyPort}`,
      `--user-data-dir=${setupResult.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Allow localhost connections
      '--allow-insecure-localhost',
      // Disable QUIC/HTTP3 which might bypass our proxy
      '--disable-quic',
    ];

    // If CA is installed in system keychain, Chrome will trust it natively
    // This is the preferred mode - no suspicious flags needed
    if (caInstalledInKeychain) {
      console.log('Using trusted CA mode - no certificate override flags needed');
      return baseArgs;
    }

    // Fallback: On macOS without trusted CA, we need --ignore-certificate-errors
    // Note: This flag can trigger bot detection on some sites
    if (process.platform === 'darwin') {
      console.log('Using untrusted CA mode - adding --ignore-certificate-errors');
      return [
        ...baseArgs,
        '--ignore-certificate-errors',
        // Reduce security warnings
        '--test-type',
      ];
    }

    // On Linux, NSS database works with Chrome
    if (setupResult.method === 'nss' && process.platform === 'linux') {
      return baseArgs;
    }

    // Fallback for all other cases
    return [
      ...baseArgs,
      '--ignore-certificate-errors',
      '--test-type',
    ];
  }
}

/**
 * Cleans up Chrome profile directory when browser exits.
 */
export async function cleanupProfile(profileDir: string): Promise<void> {
  try {
    await fs.rm(profileDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
