import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { credentialsSchema, type AuthResponse } from "@recall/shared";
import { authCookie, signToken, TOKEN_COOKIE } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, parseBody } from "@/lib/http";
import { User } from "@/lib/models";

export async function POST(req: Request) {
  const parsed = await parseBody(req, credentialsSchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.toLowerCase().trim();

  await connectDb();
  if (await User.exists({ email })) return fail("An account with this email already exists", 409);

  const user = await User.create({ email, passwordHash: await bcrypt.hash(parsed.data.password, 10) });
  const token = signToken(user.id);

  const res = NextResponse.json<AuthResponse>({ token, user: { id: user.id, email } }, { status: 201 });
  res.cookies.set(TOKEN_COOKIE, token, authCookie);
  return res;
}
