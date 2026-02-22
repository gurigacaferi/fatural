/**
 * TOTP Two-Factor Authentication helpers.
 * Uses otplib (speakeasy-compatible) for TOTP generation and verification.
 */
import { authenticator } from "otplib";
import QRCode from "qrcode";

const SERVICE_NAME = "Fatural";

/**
 * Generate a new TOTP secret and QR-code data-URL.
 */
export async function generateTotpSecret(
  userEmail: string
): Promise<{ secret: string; uri: string; qrCodeUrl: string }> {
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(userEmail, SERVICE_NAME, secret);
  const qrCodeUrl = await QRCode.toDataURL(uri);
  return { secret, uri, qrCodeUrl };
}

/**
 * Verify a 6-digit TOTP token against a stored secret.
 */
export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}
