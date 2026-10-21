import { NextResponse } from "next/server";
import type { z } from "zod";

export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: fail("Request body must be JSON", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: fail(result.error.issues[0]?.message ?? "Invalid request", 400) };
  }
  return { ok: true, data: result.data };
}
