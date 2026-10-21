import { after, NextResponse } from "next/server";
import { createItemSchema, escapeRegex, extractUrl, type Item as ApiItem } from "@recall/shared";
import { enrichItems } from "@/lib/ai";
import { getUserId } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, parseBody } from "@/lib/http";
import { Item, toApiItem } from "@/lib/models";

/** GET /api/items?q=&tag= — search and filter, newest first. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return fail("Sign in to see your items", 401);

  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim().slice(0, 100);
  const tag = params.get("tag")?.trim();

  const filter: Record<string, unknown> = { userId, deletedAt: null };
  if (tag) filter.tags = tag;
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: re }, { content: re }, { summary: re }, { tags: re }];
  }

  await connectDb();
  const docs = await Item.find(filter).sort({ clientCreatedAt: -1 }).limit(200).lean();
  return NextResponse.json<{ items: ApiItem[] }>({ items: docs.map(toApiItem) });
}

/** POST /api/items — create from the web dashboard. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return fail("Sign in to save items", 401);
  const parsed = await parseBody(req, createItemSchema);
  if (!parsed.ok) return parsed.response;

  const { content } = parsed.data;
  const url = extractUrl(content);
  const now = new Date();

  await connectDb();
  const doc = await Item.create({
    userId,
    clientId: crypto.randomUUID(),
    kind: url ? "link" : "note",
    content,
    url,
    clientCreatedAt: now,
    clientUpdatedAt: now,
    syncedAt: now,
    aiStatus: "pending",
  });

  after(() => enrichItems([doc.id]));
  return NextResponse.json<{ item: ApiItem }>({ item: toApiItem(doc) }, { status: 201 });
}
