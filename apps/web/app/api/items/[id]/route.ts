import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { Item } from "@/lib/models";

/** Soft delete: the tombstone reaches the phone on its next sync. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return fail("Sign in to delete items", 401);
  const { id } = await params;

  await connectDb();
  const now = new Date();
  const result = await Item.updateOne(
    { userId, clientId: id, deletedAt: null },
    { deletedAt: now, clientUpdatedAt: now, syncedAt: now },
  );
  if (result.matchedCount === 0) return fail("Item not found", 404);
  return NextResponse.json({ ok: true });
}
