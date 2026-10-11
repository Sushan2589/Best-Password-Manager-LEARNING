import { argon2id } from "hash-wasm";

// Compatibility: the existing vault uses the Base64 salt TEXT as Argon2's salt.
// Decoding that string would derive a different key and strand existing entries.
export async function deriveVaultKey(password: string, salt: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await argon2id({ password, salt, iterations: 3, memorySize: 65536,
    parallelism: 1, hashLength: 32, outputType: "binary" });
  try { return new Uint8Array(bytes); }
  finally { bytes.fill(0); }
}

export async function deriveCryptoKey(password: string, salt: string): Promise<CryptoKey> {
  const bytes = await deriveVaultKey(password, salt);
  try {
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally { bytes.fill(0); }
}

function encode(bytes: Uint8Array): string {
  let result = "";
  // Avoid spreading potentially large credentials onto the JS call stack.
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid encrypted data.");
  }
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error("Invalid encrypted data.");
  return bytes;
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<{ cipherText: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(plaintext);
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, bytes);
    return { cipherText: encode(new Uint8Array(ciphertext)), nonce: encode(nonce) };
  } finally { bytes.fill(0); }
}

export async function decrypt(ciphertext: string, nonce: string, key: CryptoKey): Promise<string> {
  const bytes = decode(ciphertext);
  const iv = decode(nonce);
  if (iv.length !== 12 || bytes.length < 16) throw new Error("Invalid encrypted data.");
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, bytes));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(plaintext); }
  finally { plaintext.fill(0); }
}
