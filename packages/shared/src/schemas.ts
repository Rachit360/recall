import { z } from "zod";

/**
 * The single source of truth for data shapes. The server validates requests
 * with these schemas, and both apps import the inferred types, so a change
 * here shows up as a type error everywhere it matters.
 */

export const itemKindSchema = z.enum(["link", "note"]);
export const aiStatusSchema = z.enum(["pending", "done", "failed", "skipped"]);

export const credentialsSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

/** An item as the server returns it. `id` is generated on the client (UUID). */
export const itemSchema = z.object({
  id: z.uuid(),
  kind: itemKindSchema,
  content: z.string(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  aiStatus: aiStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

/** One offline change pushed by the mobile app during sync. */
export const itemChangeSchema = z.object({
  id: z.uuid(),
  kind: itemKindSchema,
  content: z.string().min(1).max(10_000),
  // Deliberately lenient: a URL the phone extracted with a regex must never
  // make the whole sync batch fail validation.
  url: z.string().max(2048).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export const syncRequestSchema = z.object({
  /** serverTime from the previous sync, or null on the first sync. */
  since: z.iso.datetime().nullable(),
  changes: z.array(itemChangeSchema).max(200),
});

export const createItemSchema = z.object({
  content: z.string().trim().min(1, "Write something to save").max(10_000),
});

export type ItemKind = z.infer<typeof itemKindSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type Credentials = z.infer<typeof credentialsSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemChange = z.infer<typeof itemChangeSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;

export type SyncResponse = { items: Item[]; serverTime: string };
export type AuthResponse = { token: string; user: { id: string; email: string } };
export type TagCount = { tag: string; count: number };
