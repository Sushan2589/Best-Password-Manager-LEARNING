export function revocationDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env.REVOCATION_DATABASE_URL;
  if (!value) {
    if (env.VERCEL === "1") throw new Error("Vercel requires REVOCATION_DATABASE_URL for shared logout protection.");
    return undefined;
  }
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
    // Reject the same Neon endpoint even when one URL uses its pooler alias.
    // A separate project avoids sharing the main database's failure domain.
    if (env.DATABASE_URL) {
      const main = new URL(env.DATABASE_URL);
      if (main.hostname.replace(/-pooler(?=\.)/, "") === url.hostname.replace(/-pooler(?=\.)/, "")) throw new Error();
    }
    return value;
  } catch {
    throw new Error("REVOCATION_DATABASE_URL must reference an independent PostgreSQL primary endpoint.");
  }
}
