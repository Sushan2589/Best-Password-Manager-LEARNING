import { encrypt } from "./encryption";
import { decrypt } from "./encryption";

async function testencryption ()
{
    const base64VaultKey = "z35L1F2nIL+JBGOjHRbEIQ=="
    const vaultKey = Uint8Array.from(Buffer.from(base64VaultKey, 'base64'));

    const data = await encrypt("securePassword",vaultKey)

    console.log(data)

    // const tampered = new Uint8Array(data.ciphertext);
    // tampered[0] ^= 1

    const decrypted = await decrypt(data.ciphertext,data.nonce,vaultKey)
    console.log("TEXT:")
    
    console.log(decrypted)
}



testencryption()

