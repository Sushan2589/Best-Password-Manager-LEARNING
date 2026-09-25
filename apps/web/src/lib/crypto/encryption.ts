function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBuffer(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}


export async function encrypt(plaintext: string, vaultKey: CryptoKey) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  // const keyBuffer = new Uint8Array(vaultKey).buffer; //ArrayBufferLike basically means: "This typed array could be backed by an ArrayBuffer or another compatible buffer type." Web Crypto's TypeScript definition you're hitting is being stricter and wants: "Give me an ArrayBuffer."

  // const cryptoKey = await crypto.subtle.importKey(
  //   //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
  //   "raw",
  //   keyBuffer,
  //   { name: "AES-GCM" },
  //   false,
  //   ["encrypt"],
  // );

  const cipherText = await crypto.subtle.encrypt(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
    { name: "AES-GCM", iv: nonce },
    vaultKey,
    new TextEncoder().encode(plaintext),
  );

  return {
    cipherText: bufferToBase64(cipherText),
    nonce: bufferToBase64(nonce),
  };
}

export async function decrypt(
  ciphertextBase64: string,
  nonceBase64: string,
  vaultKey: CryptoKey,
) {
  // const keyBuffer = new Uint8Array(vaultKey).buffer;

  // const cryptoKey = await crypto.subtle.importKey(
  //   //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
  //   "raw",
  //   keyBuffer,
  //   { name: "AES-GCM" },
  //   false,
  //   ["decrypt"],
  // );

   const cipherText = base64ToBuffer(ciphertextBase64);
   const iv = base64ToBuffer(nonceBase64);       

   //nonce is Uint8Array while web crypto wants a BufferSource so changed
  const plainText = await crypto.subtle.decrypt(
    //https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt

    { name: "AES-GCM", iv },
    vaultKey,
    cipherText,
  );

  return new TextDecoder().decode(plainText);
}
