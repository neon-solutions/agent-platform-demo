import { redirect } from "next/navigation";
import { maybeUser } from "@/lib/session";

export default async function Home() {
  const session = await maybeUser();
  redirect(session ? "/app" : "/login");
}
