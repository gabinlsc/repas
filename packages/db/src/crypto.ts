import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement applicatif AES-256-GCM des données de santé (D-013).
 * Trousseau : DATA_ENCRYPTION_KEYS="k2:<base64 32 octets>,k1:<ancienne>" — la première clé
 * chiffre, toutes déchiffrent (rotation sans interruption, voir RUNBOOK).
 * Format : 0x01 | len(keyId) | keyId | iv(12) | tag(16) | ciphertext
 */
export interface Keyring {
  readonly currentId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

export class CryptoConfigError extends Error {}

export function parseKeyring(spec: string): Keyring {
  const entries = spec.split(",").map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0) throw new CryptoConfigError("DATA_ENCRYPTION_KEYS vide");
  const keys = new Map<string, Buffer>();
  for (const e of entries) {
    const [id, b64] = e.split(":");
    if (!id || !b64 || !/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new CryptoConfigError("Entrée de clé invalide (attendu id:base64)");
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new CryptoConfigError(`La clé ${id} doit faire 32 octets`);
    keys.set(id, key);
  }
  return { currentId: entries[0]!.split(":")[0]!, keys };
}

export function encryptJson(value: unknown, ring: Keyring): Buffer {
  const key = ring.keys.get(ring.currentId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const id = Buffer.from(ring.currentId, "utf8");
  return Buffer.concat([Buffer.from([1, id.length]), id, iv, cipher.getAuthTag(), ct]);
}

export function decryptJson<T>(buf: Buffer, ring: Keyring): T {
  if (buf[0] !== 1) throw new CryptoConfigError("Version de chiffrement inconnue");
  const idLen = buf[1]!;
  const id = buf.subarray(2, 2 + idLen).toString("utf8");
  const key = ring.keys.get(id);
  if (!key) throw new CryptoConfigError(`Clé ${id} absente du trousseau`);
  const off = 2 + idLen;
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(off, off + 12));
  decipher.setAuthTag(buf.subarray(off + 12, off + 28));
  const pt = Buffer.concat([decipher.update(buf.subarray(off + 28)), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/** Vrai si la donnée doit être rechiffrée avec la clé courante (rotation). */
export function needsRotation(buf: Buffer, ring: Keyring): boolean {
  const id = buf.subarray(2, 2 + buf[1]!).toString("utf8");
  return id !== ring.currentId;
}
