import { isValidObjectId, Types } from "mongoose";
import { NextResponse } from "next/server";
import type { TagCount } from "@recall/shared";
import { getUserId } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { Item } from "@/lib/models";

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId || !isValidObjectId(userId)) return fail("Sign in to see your tags", 401);

  await connectDb();
  // aggregate() skips Mongoose's casting, so the id has to be an ObjectId here.
  const rows = await Item.aggregate<{ _id: string; count: number }>([
    { $match: { userId: new Types.ObjectId(userId), deletedAt: null } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 60 },
  ]);
  return NextResponse.json<{ tags: TagCount[] }>({
    tags: rows.map((r) => ({ tag: r._id, count: r.count })),
  });
}
