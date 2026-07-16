"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        toast.error(res.error.message || "Something went wrong");
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {mode === "signup"
            ? "Start vibe-coding full-stack apps on Neon."
            : "Sign in to your vibe workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "…" : mode === "signup" ? "Sign up" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link></>
          ) : (
            <>New here? <Link href="/signup" className="text-primary hover:underline">Create an account</Link></>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
