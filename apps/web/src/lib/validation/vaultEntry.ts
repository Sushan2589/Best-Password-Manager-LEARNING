import * as z from "zod";

export const vaultEntrySchema = z.object({
  title: z.string().min(1).max(100),
  username: z.string().max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
  website: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
}).refine(
  (data) => Boolean(data.username) || Boolean(data.email),
  {
    message: "Username or email is required",
  }
);

export type VaultEntry = z.infer<typeof vaultEntrySchema>;