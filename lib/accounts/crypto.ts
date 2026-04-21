// AES-256-GCM credential encryption — NST.19.7 r3 §Deliverables.3
// This is the ONLY file permitted to read ACCOUNTS_ENCRYPTION_KEY from env.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const k = process.env.ACCOUNTS_ENCRYPTION_KEY;
  if (!k) throw new Error("ACCOUNTS_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("ACCOUNTS_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  return buf;
}

/** Encrypts plaintext and returns a base64 bundle: `iv:ciphertext:tag` */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

/** Decrypts a bundle produced by `encrypt` back to plaintext. */
export function decrypt(bundle: string): string {
  const key = getKey();
  const parts = bundle.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted bundle format — expected iv:ciphertext:tag");
  const [ivB64, encB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
