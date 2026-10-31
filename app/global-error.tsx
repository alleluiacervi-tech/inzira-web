"use client";
import { useEffect } from "react";

/** Independent of the root layout, translations, navigation, fonts and application providers. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { window.__inziraClientRecovery?.recover(error); }, [error]);
  return (
    <html lang="en" translate="no" className="notranslate">
      <head><meta name="google" content="notranslate" /></head>
      <body style={{ margin: 0, background: "#f4f7fb", color: "#17365e", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box" }}>
          <section role="alert" style={{ width: "100%", maxWidth: 460, padding: 32, background: "white", border: "1px solid #dde6f2", borderRadius: 18, boxSizing: "border-box" }}>
            <p style={{ margin: "0 0 24px", fontWeight: 700, letterSpacing: "-.03em", fontSize: 24 }}>Inzira</p>
            <h1 style={{ fontSize: 25, lineHeight: 1.25, letterSpacing: "-.03em" }}>Let’s load that page again.</h1>
            <p style={{ color: "#586c86", lineHeight: 1.7 }}>Part of this page could not load. Check your connection, then refresh. Unsaved entries may need to be entered again.</p>
            <p lang="rw" style={{ color: "#586c86", fontSize: 13, lineHeight: 1.7 }}>Ntitwashoboye gufungura uru rupapuro. Ongera ugerageze.</p>
            {error.digest && <p style={{ fontSize: 12 }}>Reference: {error.digest}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
              <button type="button" onClick={() => window.location.reload()} style={{ background: "#173f79", color: "white", padding: "12px 18px", border: 0, borderRadius: 8, font: "inherit", cursor: "pointer" }}>Refresh page</button>
              {/* This fallback must work without the failed App Router or its providers. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={{ color: "#173f79", padding: "12px 0", fontSize: 14 }}>Return home</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
