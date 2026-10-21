import { after, NextResponse } from "next/server";
import { syncRequestSchema, type SyncResponse } from "@recall/shared";
import { enrichItems } from "@/lib/ai";
import { getUserId } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, parseBody } from "@/lib/http";
import { Item, toApiItem } from "@/lib/models";

/**
 * Two-way sync in one round trip.
 *
 * Push: the phone sends every item it changed while offline. Items are keyed
 * by a client-generated UUID, so retrying a batch is safe (idempotent).
 * Conflicts resolve last-write-wins on the client's updatedAt.
 *
 * Pull: the server returns everything that changed since the phone's last
 * sync, judged by the server's own clock (syncedAt), never the phone's,
 * because phone clocks drift.
 */

// The returned cursor is moved back slightly, so a write that committed while
// this query was running is picked up next time. Clients upsert by id, so
// seeing an item twice is harmless; missing one would not be.
const OVERLAP_MS = 5_000;

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return fail("Sign in to sync", 401);
  const parsed = await parseBody(req, syncRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { since, changes } = parsed.data;

  await connectDb();
  const writeTime = new Date();
  const touched: string[] = [];
  const toEnrich: string[] = [];

  for (const change of changes) {
    const updatedAt = new Date(change.updatedAt);
    const deletedAt = change.deletedAt ? new Date(change.deletedAt) : null;
    const existing = await Item.findOne({ userId, clientId: change.id });

    if (!existing) {
      const doc = await Item.create({
        userId,
        clientId: change.id,
        kind: change.kind,
        content: change.content,
        url: change.url,
        clientCreatedAt: new Date(change.createdAt),
        clientUpdatedAt: updatedAt,
        deletedAt,
        syncedAt: writeTime,
        aiStatus: deletedAt ? "skipped" : "pending",
      });
      if (!deletedAt) toEnrich.push(doc.id);
    } else if (updatedAt > existing.clientUpdatedAt) {
      const contentChanged = existing.content !== change.content;
      existing.set({
        content: change.content,
        url: change.url,
        clientUpdatedAt: updatedAt,
        deletedAt,
        syncedAt: writeTime,
      });
      if (contentChanged && !deletedAt) {
        existing.set({ aiStatus: "pending" });
        toEnrich.push(existing.id);
      }
      await existing.save();
    }
    // An older change loses to the server copy; the pull below sends the winner back.
    touched.push(change.id);
  }

  const queryTime = new Date();
  // First sync: everything live. Later syncs: every change, including deletions.
  const changedFilter = since ? { userId, syncedAt: { $gt: new Date(since) } } : { userId, deletedAt: null };
  const [changed, pushed] = await Promise.all([
    Item.find(changedFilter).lean(),
    touched.length ? Item.find({ userId, clientId: { $in: touched } }).lean() : Promise.resolve([]),
  ]);

  // Always return what was just pushed, so the phone can clear its dirty flags.
  const byId = new Map(changed.map((d) => [d.clientId, d]));
  for (const d of pushed) byId.set(d.clientId, d);

  if (toEnrich.length) after(() => enrichItems(toEnrich));

  return NextResponse.json<SyncResponse>({
    items: [...byId.values()].map(toApiItem),
    serverTime: new Date(queryTime.getTime() - OVERLAP_MS).toISOString(),
  });
}
