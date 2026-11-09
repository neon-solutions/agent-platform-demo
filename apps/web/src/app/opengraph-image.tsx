import { ImageResponse } from "next/og";

export const alt =
  "Vibe: describe an app and a coding agent builds it on its own Neon Postgres database";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKGROUND = "#0c0d0d";
const FOREGROUND = "#f3f4f6";
const MUTED = "#9ca3af";
const PRIMARY = "#00e599";
const BORDER = "#262727";

/** A halftone field fading up from the bottom edge, echoing the landing page. */
function Dots() {
  const rows = 7;
  const cols = 48;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={{ display: "flex", gap: 12, opacity: 0.12 + (row / rows) * 0.5 }}>
          {Array.from({ length: cols }, (_, col) => (
            <div
              key={col}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: col < cols * 0.55 ? PRIMARY : "#d9a066",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BACKGROUND,
        color: FOREGROUND,
        padding: "64px 72px 0",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}
      >
        <svg fill={PRIMARY} height="22" viewBox="0 0 12 12" width="22">
          <path d="M6 0 12 6 6 12 0 6Z" />
        </svg>
        Vibe
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
          What should we build?
        </div>
        <div style={{ fontSize: 34, color: MUTED, lineHeight: 1.35, maxWidth: 1000 }}>
          Describe an app. A coding agent builds it live on its own Neon Postgres database, with
          checkpoints for code and data.
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 22, color: MUTED }}>
          {["Neon Postgres", "AI Gateway", "Neon Functions", "Vercel Sandbox"].map((chip) => (
            <div
              key={chip}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 16px" }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
      <Dots />
    </div>,
    size,
  );
}
