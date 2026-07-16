"use client";
import { createAuthClient } from "better-auth/react";
import { jwtClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3040",
  plugins: [jwtClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
