

import { deriveVaultKey } from "./key";

async function testDeriveVaultKey() {
  const masterPassword = "myPassword";
  const vaultSalt = "z35L1F2nIL+JBGOjHRbEIQ=";
  const vaultKey = await deriveVaultKey(masterPassword, vaultSalt);
  console.log(vaultKey);
}

testDeriveVaultKey();