import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, siteUrl } from "@/lib/site";

// Route segment config
export const alt = `${SITE_NAME} | ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens mirrored from globals.css (the editorial "paper" theme).
const PAPER = "#f3f0e8";
const INK = "#111815";
const INK_MUTED = "#4d5b56";
const SIGNAL = "#d9ff3f";
const DOT = "#ff5e52";

export default function OpenGraphImage() {
  const host = siteUrl().replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              background: DOT,
              borderRadius: 2,
              boxShadow: `0 0 0 8px rgba(255,94,82,0.14)`,
            }}
          />
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        {/* headline = the tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -2,
              maxWidth: 960,
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div style={{ display: "flex", width: 180, height: 12, background: SIGNAL }} />
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.5,
              color: INK_MUTED,
              maxWidth: 900,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: INK_MUTED,
          }}
        >
          <div style={{ display: "flex" }}>Policy gates · Human approvals · Immutable audit</div>
          <div style={{ display: "flex", fontWeight: 700, color: INK }}>{host}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
