"use client";

import { useState } from "react";
import { AuthForm, type AuthFormValues, type AuthMode } from "@/components/auth-form/auth-form";
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
    <main className="flex min-h-svh items-center justify-center p-6">
      <AuthForm
        className="w-full max-w-sm"
        description={
          mode === "sign-up"
            ? "Start vibe-coding full-stack apps on Neon."
            : "Sign in to your vibe workspace."
        }
        error={error}
        isBusy={busy}
        mode={mode}
        onModeChange={setMode}
        onSubmit={onSubmit}
        variant="bare"
      />
    </main>
  );
}
