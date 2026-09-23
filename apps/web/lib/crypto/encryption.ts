export async function encrypt(plaintext: string, vaultKey: Uint8Array) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const keyBuffer = new Uint8Array(vaultKey).buffer; //ArrayBufferLike basically means: "This typed array could be backed by an ArrayBuffer or another compatible buffer type." Web Crypto's TypeScript definition you're hitting is being stricter and wants: "Give me an ArrayBuffer."

  const cryptoKey = await crypto.subtle.importKey(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const ciphertext = await crypto.subtle.encrypt(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );

  return {
    ciphertext,
    nonce,
  };
}

export async function decrypt(
  ciphertext: ArrayBuffer,
  nonce: Uint8Array,
  vaultKey: Uint8Array,
) {
  const keyBuffer = new Uint8Array(vaultKey).buffer;

  const cryptoKey = await crypto.subtle.importKey(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const iv = new Uint8Array(nonce).buffer; //nonce is Uint8Array while web crypto wants a BufferSource so changed
  const plainText = await crypto.subtle.decrypt(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt

    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext,
  );

  return new TextDecoder().decode(plainText);
}
