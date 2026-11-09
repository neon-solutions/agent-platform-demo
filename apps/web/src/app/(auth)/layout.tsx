import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "@/lib/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Signed-in shell: everything under here requires a session. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return children;
}
