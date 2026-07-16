import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe — a demo codegen platform on Neon",
  description:
    "A minimal codegen platform: a Mastra coding agent on Neon Functions vibe-codes apps into Vercel Sandboxes backed by per-app Neon Postgres, with git + snapshot checkpoints.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
