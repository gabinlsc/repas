import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionFromCookieHeader } from "@/server/context";

export default async function Home() {
  const jar = await cookies();
  const session = await sessionFromCookieHeader(jar.toString());
  redirect(session ? "/semaine" : "/connexion");
}
