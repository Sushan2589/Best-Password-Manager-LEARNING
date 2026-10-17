import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { createVaultVerifier, decrypt, deriveCryptoKey, encrypt, verifyVaultKey } from "@password-manager/crypto";
import { vaultRotationSchema, vaultRotationSnapshotSchema, type VaultRotation } from "@password-manager/shared/vault";
import { sessionsTable, usersTable, vaultItemsTable } from "../src/db/schema.js";

const fixture = vi.hoisted(() => ({ db: undefined as unknown, notice: vi.fn() }));
vi.mock("../src/db/client.js", () => ({ get db() { return fixture.db; } }));
vi.mock("../src/services/email.js", () => ({ sendSecurityNotice: fixture.notice.mockResolvedValue(undefined), sendVerificationEmail: vi.fn() }));
vi.mock("../src/services/password.js", () => ({ verifyPassword: async (_hash: string, password: string) => password === "public-account-password", hashPassword: vi.fn(), passwordCompromised: vi.fn() }));
import { commitRotation, rotationSnapshot } from "../src/services/vaultRotation.js";
import { initializeVaultVerifier, mutateVault } from "../src/services/vaultMutation.js";
import { createApp } from "../src/app.js";
import { enableMfa, prepareMfa, totp } from "../src/services/mfa.js";

const pg = new PGlite(); const db = drizzle({ client: pg });
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000010";
const actor = { userId: owner, sessionId, sessionVersion: 0 };
const salt = btoa("0123456789abcdef"); const newSalt = btoa("fedcba9876543210");
const plain = JSON.stringify({ title: "Public fixture", username: "fixture", password: "public-fixture-only", approvedOrigins: ["https://accounts.example.com"], futureMetadata: { preserve: true } });
let oldKey: CryptoKey; let newKey: CryptoKey;
let oldEnvelope: { cipherText: string; nonce: string }; let newEnvelope: typeof oldEnvelope;
let oldVerifier: typeof oldEnvelope; let newVerifier: typeof oldEnvelope;
beforeAll(async () => {
  fixture.db = db; process.env.MFA_ENCRYPTION_KEY = "01".repeat(32);
  await pg.exec("SET TIME ZONE 'UTC'");
  await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(255) NOT NULL,email text NOT NULL UNIQUE,password_hash varchar(255) NOT NULL,vault_salt text NOT NULL,email_verified boolean NOT NULL DEFAULT false,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,session_token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE vault_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,cipher_text text NOT NULL,nonce text NOT NULL,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE email_verification_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());`);
  for (const migration of ["20261012_security.sql", "20261017_vault_password_rotation.sql"]) await pg.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  oldKey = await deriveCryptoKey("public old master password", salt);
  newKey = await deriveCryptoKey("public new master password", newSalt);
  oldEnvelope = await encrypt(plain, oldKey); newEnvelope = await encrypt(plain, newKey);
  oldVerifier = await createVaultVerifier(oldKey, owner); newVerifier = await createVaultVerifier(newKey, owner);
}, 60000);
afterAll(async () => { await pg.close(); delete process.env.MFA_ENCRYPTION_KEY; });
beforeEach(async () => {
  await pg.exec("DROP TRIGGER IF EXISTS rotation_failure ON vault_items; TRUNCATE users CASCADE");
  await db.insert(usersTable).values([
    { id: owner, name: "Fixture", email: "fixture@example.com", passwordHash: "fixture-hash", vaultSalt: salt, emailVerified: true, vaultVerifierCipher: oldVerifier.cipherText, vaultVerifierNonce: oldVerifier.nonce },
    { id: other, name: "Other", email: "other@example.com", passwordHash: "other-hash", vaultSalt: salt, emailVerified: true },
  ]);
  await addSession();
  await db.insert(vaultItemsTable).values([
    { id: "aaaaaaaa-0000-4000-8000-000000000020", userId: owner, ...oldEnvelope },
    { id: "00000000-0000-4000-8000-000000000021", userId: owner, ...oldEnvelope },
    { id: "00000000-0000-4000-8000-000000000022", userId: other, ...oldEnvelope },
  ]);
});
async function addSession(version = 0) {
  await db.insert(sessionsTable).values({ id: sessionId, userId: owner, sessionVersion: version, sessionTokenHash: createHash("sha256").update("public-session-fixture").digest("hex"), expiresAt: new Date(Date.now() + 3600000), lastUsedAt: new Date() });
}
async function rotation() {
  const snapshot = vaultRotationSnapshotSchema.parse(await rotationSnapshot(actor));
  return vaultRotationSchema.parse({ expectedSalt: salt, expectedRevision: snapshot.revision, newSalt, verifier: newVerifier, items: snapshot.items.map(row => ({ id: row.id, ...newEnvelope })) });
}
async function state() { return { users: await db.select().from(usersTable), items: await db.select().from(vaultItemsTable), sessions: await db.select().from(sessionsTable) }; }
async function assertRejected(change: (value: VaultRotation) => void, hash = "fixture-hash") {
  const request = await rotation(); change(request); const before = await state();
  expect(await commitRotation(actor, hash, request)).toBeUndefined(); expect(await state()).toEqual(before);
}
describe("atomic vault master-password rotation on PostgreSQL", () => {
  it("rotates all owned entries, preserves IDs/timestamps/metadata, leaves other users alone and revokes every owner session", async () => {
    await db.insert(sessionsTable).values({ userId: owner, sessionTokenHash: "another-session", expiresAt: new Date(Date.now() + 3600000) });
    const before = await state(); const request = await rotation();
    expect(await commitRotation(actor, "fixture-hash", request)).toEqual({ id: owner, count: 2 });
    const after = await state(); const user = after.users.find(row => row.id === owner)!;
    expect(user.vaultSalt).toBe(newSalt); expect(user.sessionVersion).toBe(1); expect(user.vaultRevision).toBe(1); expect(user.vaultKeyVersion).toBe(1);
    expect(user.passwordHash).toBe("fixture-hash"); expect(user.emailVerified).toBe(true);
    expect(after.sessions).toHaveLength(0);
    await verifyVaultKey(newKey, owner, { cipherText: user.vaultVerifierCipher!, nonce: user.vaultVerifierNonce! });
    for (const row of after.items.filter(row => row.userId === owner)) {
      expect(row.createdAt).toEqual(before.items.find(old => old.id === row.id)!.createdAt);
      expect(row.updatedAt).toEqual(before.items.find(old => old.id === row.id)!.updatedAt);
      expect(await decrypt(row.cipherText, row.nonce, newKey)).toBe(plain);
      await expect(decrypt(row.cipherText, row.nonce, oldKey)).rejects.toThrow();
    }
    expect(after.items.find(row => row.userId === other)).toEqual(before.items.find(row => row.userId === other));
    expect(after.users.find(row => row.id === other)).toEqual(before.users.find(row => row.id === other));
    expect(await rotationSnapshot(actor)).toBeUndefined();
  });
  it("rolls back salt, verifier, ciphertexts and session revocation if any entry update fails", async () => {
    const request = await rotation(); const before = await state();
    await pg.exec(`CREATE OR REPLACE FUNCTION fail_rotation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='00000000-0000-4000-8000-000000000021' THEN RAISE EXCEPTION 'public test failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER rotation_failure BEFORE UPDATE ON vault_items FOR EACH ROW EXECUTE FUNCTION fail_rotation();`);
    await expect(commitRotation(actor, "fixture-hash", request)).rejects.toThrow();
    expect(await state()).toEqual(before);
  });
  it.each(["create", "update", "delete"] as const)("rejects a stale snapshot after a concurrent %s", async kind => {
    const request = await rotation();
    const result = await mutateVault(actor, salt, { kind, id: request.items[0]!.id, ...oldEnvelope });
    expect(result.admitted).toBe(1); const before = await state();
    expect(await commitRotation(actor, "fixture-hash", request)).toBeUndefined(); expect(await state()).toEqual(before);
  });
  it("rejects a wrong salt, revision, changed password hash, omitted entry or foreign entry without side effects", async () => {
    await assertRejected(value => { value.expectedSalt = newSalt; });
    await assertRejected(value => { value.expectedRevision++; });
    await assertRejected(() => {}, "outdated-hash");
    await assertRejected(value => { value.items.pop(); });
    await assertRejected(value => { value.items[0]!.id = "00000000-0000-4000-8000-000000000022"; });
    await assertRejected(value => { value.items[1] = { ...value.items[0]!, id: value.items[0]!.id.toUpperCase() }; });
  });
  it("rejects replay, stale writers and headerless writers after rotation, including after a fresh sign-in", async () => {
    const request = await rotation(); await commitRotation(actor, "fixture-hash", request);
    expect(await commitRotation(actor, "fixture-hash", request)).toBeUndefined();
    await addSession(1); const freshActor = { ...actor, sessionVersion: 1 };
    for (const version of [salt, undefined]) {
      expect((await mutateVault(freshActor, version, { kind: "create", ...oldEnvelope })).admitted).toBe(0);
      expect((await mutateVault(freshActor, version, { kind: "delete", id: request.items[0]!.id })).admitted).toBe(0);
    }
    expect((await mutateVault(actor, newSalt, { kind: "create", ...newEnvelope })).admitted).toBe(0);
    const saved = await mutateVault(freshActor, newSalt, { kind: "create", ...newEnvelope });
    expect(saved.admitted).toBe(1); expect(saved.item).toBeTruthy();
    const after = vaultRotationSnapshotSchema.parse(await rotationSnapshot(freshActor)); expect(after.items).toHaveLength(3);
    await verifyVaultKey(newKey, owner, after.verifier!);
  });
  it("allows pre-rotation clients and safely initializes an empty legacy vault only once", async () => {
    expect((await mutateVault(actor, undefined, { kind: "create", ...oldEnvelope })).admitted).toBe(1);
    await db.delete(vaultItemsTable).where(eq(vaultItemsTable.userId, owner));
    await db.update(usersTable).set({ vaultVerifierCipher: null, vaultVerifierNonce: null }).where(eq(usersTable.id, owner));
    expect(await initializeVaultVerifier(actor, salt, oldVerifier)).toBe(true);
    expect(await initializeVaultVerifier(actor, salt, oldVerifier)).toBe(false);
    const request = await rotation(); expect(request.items).toHaveLength(0);
    expect(await commitRotation(actor, "fixture-hash", request)).toEqual({ id: owner, count: 0 });
  });
  it("rejects expired, idle, revoked and superseded sessions at the write itself", async () => {
    const request = await rotation();
    for (const changes of [{ expiresAt: new Date(Date.now()-1000) }, { expiresAt: new Date(Date.now()+3600000), lastUsedAt: new Date(Date.now()-31*60000) }, { lastUsedAt: new Date(), sessionVersion: 1 }]) {
      await db.update(sessionsTable).set(changes); const before = await state();
      expect(await commitRotation(actor, "fixture-hash", request)).toBeUndefined();
      expect((await mutateVault(actor, salt, { kind: "create", ...oldEnvelope })).admitted).toBe(0);
      expect(await state()).toEqual(before);
    }
    await db.delete(sessionsTable); expect(await rotationSnapshot(actor)).toBeUndefined();
    expect(await commitRotation(actor, "fixture-hash", request)).toBeUndefined();
  });
  it("keeps ciphertext comparison and ownership inside the atomic ordinary update", async () => {
    const request = await rotation();
    expect((await mutateVault(actor, salt, { kind: "update", id: request.items[0]!.id, ...newEnvelope, expectedCipherText: "wrong" })).item).toBeNull();
    expect((await mutateVault(actor, salt, { kind: "update", id: "00000000-0000-4000-8000-000000000022", ...newEnvelope })).item).toBeNull();
    expect((await mutateVault(actor, salt, { kind: "update", id: request.items[0]!.id, ...newEnvelope, expectedCipherText: oldEnvelope.cipherText })).item).toMatchObject(newEnvelope);
  });
});

async function post(body: unknown, origin = "http://localhost:3000") {
  return createApp().request("/vault/change-password", { method: "POST",
    headers: { Origin: origin, Cookie: "session=public-session-fixture", "Content-Type": "application/json", "X-Vault-Account": owner },
    body: JSON.stringify(body) });
}

describe("password-change authentication integration", () => {
  it("serves a coherent HTTP snapshot and keeps create/edit/delete working after rotation and fresh sign-in", async () => {
    const app = createApp(); const headers = { Cookie: "session=public-session-fixture", Origin: "http://localhost:3000", "Content-Type": "application/json", "X-Vault-Account": owner };
    const response = await app.request("/vault/rotation-snapshot", { headers });
    expect(response.status).toBe(200); expect(vaultRotationSnapshotSchema.parse(await response.json()).items).toHaveLength(2);
    expect((await post({ accountPassword: "public-account-password", rotation: await rotation() })).status).toBe(200);
    await addSession(1);
    for (const old of [{}, { "X-Vault-Salt": salt }]) {
      expect((await app.request("/vault", { method: "POST", headers: { ...headers, ...old }, body: JSON.stringify(oldEnvelope) })).status).toBe(409);
    }
    const currentHeaders = { ...headers, "X-Vault-Salt": newSalt };
    const created = await app.request("/vault", { method: "POST", headers: currentHeaders, body: JSON.stringify(newEnvelope) });
    expect(created.status).toBe(201); const row = await created.json(); expect(row.userId).toBe(owner);
    const edited = await app.request(`/vault/${row.id}`, { method: "PATCH", headers: currentHeaders, body: JSON.stringify({ ...newEnvelope, expectedCipherText: newEnvelope.cipherText }) });
    expect(edited.status).toBe(200); expect((await edited.json()).id).toBe(row.id);
    expect((await app.request(`/vault/${row.id}`, { method: "DELETE", headers: currentHeaders })).status).toBe(200);
    expect((await app.request(`/vault/${row.id}`, { headers })).status).toBe(404);
  });
  it("requires verified login, account reauthentication and valid encrypted input", async () => {
    const request = await rotation(); const before = await state();
    expect((await post({ accountPassword: "wrong-account-password", rotation: request })).status).toBe(401);
    expect((await post({ accountPassword: "public-account-password", rotation: request }, "https://evil.example")).status).toBe(403);
    expect((await post({ accountPassword: "public-account-password", rotation: { ...request, items: [request.items[0], request.items[0]] } })).status).toBe(400);
    expect((await post({ accountPassword: "public-account-password", rotation: { ...request, items: [request.items[0], { ...request.items[0], id: request.items[0]!.id.toUpperCase() }] } })).status).toBe(400);
    expect((await post({ accountPassword: "public-account-password", rotation: request, newMasterPassword: "must-not-be-sent" })).status).toBe(400);
    // Auth middleware updates last-used time; vault data stays unchanged.
    expect((await state()).items).toEqual(before.items); expect((await state()).users).toEqual(before.users);
    await db.update(usersTable).set({ emailVerified: false }).where(eq(usersTable.id, owner));
    expect((await post({ accountPassword: "public-account-password", rotation: request })).status).toBe(403);
  });
  it("requires a fresh MFA proof even for a recently authenticated session, then invalidates cookies and rejects replay", async () => {
    const secret = await prepareMfa(owner); const step = Math.floor(Date.now()/30000);
    const codes = await enableMfa(owner, totp(secret, step)); expect(codes).toHaveLength(8);
    await addSession(1); const updatedActor = { ...actor, sessionVersion: 1 };
    const snapshot = vaultRotationSnapshotSchema.parse(await rotationSnapshot(updatedActor));
    const request = { expectedSalt: salt, expectedRevision: snapshot.revision, newSalt, verifier: newVerifier, items: snapshot.items.map(row => ({ id: row.id, ...newEnvelope })) };
    await db.update(sessionsTable).set({ mfaVerifiedAt: new Date() });
    expect((await post({ accountPassword: "public-account-password", rotation: request })).status).toBe(401);
    const response = await post({ accountPassword: "public-account-password", code: codes![0], rotation: request });
    expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await db.select().from(sessionsTable)).toHaveLength(0);
    expect((await post({ accountPassword: "public-account-password", code: codes![0], rotation: request })).status).toBe(401);
    expect(fixture.notice).toHaveBeenCalledWith("fixture@example.com");
  });
});
