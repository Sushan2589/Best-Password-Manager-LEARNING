

import { deriveVaultKey } from "./key";

async function testDeriveVaultKey() {
  const masterPassword = "myPassword";
  const vaultSalt = "z35L1F2nIL+JBGOjHRbEIQ=";
  await deriveVaultKey(masterPassword, vaultSalt);
  console.log("Vault key derivation test completed.");
}

testDeriveVaultKey();
