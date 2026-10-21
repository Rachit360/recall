import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { TOKEN_COOKIE, verifyToken } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";

export default async function Home() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const userId = token ? verifyToken(token) : null;
  if (!userId) redirect("/login");

  await connectDb();
  const user = await User.findById(userId).select("email").lean();
  if (!user) redirect("/login");

  return <Dashboard email={user.email} />;
}
