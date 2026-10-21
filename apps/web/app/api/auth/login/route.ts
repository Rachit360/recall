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
  const user = await User.findOne({ email });
  // Same message for unknown email and wrong password, so emails can't be probed.
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail("Email or password is incorrect", 401);
  }

  const token = signToken(user.id);
  const res = NextResponse.json<AuthResponse>({ token, user: { id: user.id, email } });
  res.cookies.set(TOKEN_COOKIE, token, authCookie);
  return res;
}
