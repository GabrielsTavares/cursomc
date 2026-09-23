import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SocialCredentialSecrets } from "../../domain/models.js";
import { ValidationError } from "../../domain/errors.js";
import type { CredentialVault } from "../../application/ports.js";

/**
 * MVP credential vault: AES-256-GCM with a key derived from CREDENTIALS_ENCRYPTION_KEY.
 *
 * Limitations (document in README):
 * - Single shared key from env (not per-tenant KMS / HashiCorp Vault)
 * - Key rotation requires re-encrypting all rows
 * - Compromised .env exposes all stored social credentials
 */
export class AesGcmCredentialVault implements CredentialVault {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 32) {
      throw new Error("CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters");
    }
    this.key = createHash("sha256").update(secret, "utf8").digest();
  }

  encrypt(secrets: SocialCredentialSecrets): string {
    const plaintext = JSON.stringify(secrets);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
  }

  decrypt(ciphertext: string): SocialCredentialSecrets {
    try {
      const buf = Buffer.from(ciphertext, "base64url");
      if (buf.length < 12 + 16 + 1) {
        throw new Error("ciphertext too short");
      }
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const data = buf.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
      const parsed = JSON.parse(plaintext) as SocialCredentialSecrets;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("invalid payload");
      }
      return parsed;
    } catch {
      throw new ValidationError("Stored credentials could not be decrypted");
    }
  }
}
