import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/server";

import { LoginClient } from "./login-client";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : undefined;

  const session = await getSession();
  if (session) {
    redirect(next ?? "/app");
  }

  return <LoginClient next={next} />;
}
