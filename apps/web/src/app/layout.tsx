import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Vibe",
  description: "Describe an app. An agent codes it live, on its own Postgres database.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="en">
      <body>
        <Providers>
          <div className="grid h-svh grid-rows-[auto_1fr]">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
