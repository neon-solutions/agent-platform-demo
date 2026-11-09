import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";
import { Providers } from "./providers";

const DESCRIPTION =
  "Describe an app and a coding agent builds it live, on its own Neon Postgres database, with checkpoints that version code and data together.";

export const metadata: Metadata = {
  title: { default: "Vibe: build apps on Neon by describing them", template: "%s · Vibe" },
  description: DESCRIPTION,
  applicationName: "Vibe",
  openGraph: {
    type: "website",
    siteName: "Vibe",
    title: "Vibe: build apps on Neon by describing them",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibe: build apps on Neon by describing them",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c0d0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
