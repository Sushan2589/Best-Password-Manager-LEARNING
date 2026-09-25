import { argon2id } from "hash-wasm";



export async function deriveVaultKey(
  masterPassword: string,
  vaultSalt: string,
)
{
  const key = await argon2id({
  password: masterPassword,
  salt: vaultSalt,
  iterations: 3,
  memorySize: 65536,
  parallelism: 1,
  hashLength: 32,
  outputType: "binary",
});

  return new Uint8Array(key);
}


