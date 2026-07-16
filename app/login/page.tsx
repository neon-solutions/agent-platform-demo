import { Suspense } from "react";
import { redirect } from "next/navigation";
import { maybeUser } from "@/lib/session";
import { AuthForm } from "@/app/(auth)/auth-form";

export default async function LoginPage() {
  if (await maybeUser()) redirect("/app");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
