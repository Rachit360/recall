import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const TOKEN_COOKIE = "recall_token";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  return s;
}

export function signToken(userId: string): string {
  return jwt.sign({}, secret(), { subject: userId, expiresIn: THIRTY_DAYS });
}

export function verifyToken(token: string): string | null {
  const key = secret(); // outside the try: a missing secret is a config error, not a bad token
  try {
    const payload = jwt.verify(token, key);
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Mobile sends `Authorization: Bearer <token>` (stored in SecureStore).
 * The web dashboard uses an httpOnly cookie so the token is never readable by JS.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return verifyToken(header.slice(7));
  const cookie = (await cookies()).get(TOKEN_COOKIE)?.value;
  return cookie ? verifyToken(cookie) : null;
}

export const authCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: THIRTY_DAYS,
};
