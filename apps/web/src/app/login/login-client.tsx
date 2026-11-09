"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthForm, type AuthFormValues, type AuthMode } from "@/components/auth-form/auth-form";
import { BrandMark } from "@/components/brand-mark";
import { authClient } from "@/lib/auth-client";

export function LoginClient({ next }: { next?: string }) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit({ email, password, name }: AuthFormValues) {
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              password,
              name: name || email.split("@")[0] || email,
            })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message || "Something went wrong");
        return;
      }
      // Full reload so the fresh session cookie reaches server components.
      window.location.assign(next ?? "/app");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center px-6">
        <Link
          aria-label="Vibe home"
          className="rounded-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          href="/"
        >
          <BrandMark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-14">
        <AuthForm
          className="w-full max-w-sm"
          description={
            mode === "sign-up"
              ? "Build full-stack apps on Neon by describing them."
              : "Sign in to pick up where your apps left off."
          }
          error={error}
          isBusy={busy}
          mode={mode}
          onModeChange={setMode}
          onSubmit={onSubmit}
        />
      </main>
    </div>
  );
}
