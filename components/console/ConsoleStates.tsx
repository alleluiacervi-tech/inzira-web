"use client";
import Link from "next/link";
import { Icon } from "@/components/ui";

/** Same outline as a console dashboard (title, four tiles, two panels) so nothing jumps when data lands. */
export function ConsoleSkeleton() {
  return (
    <div className="stack g20" aria-busy="true" aria-label="Loading">
      <div className="stack g8"><span className="skel" style={{ width: 120, height: 11 }} /><span className="skel" style={{ width: 220, height: 22 }} /></div>
      <div className="c-grid-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="console-panel c-stat"><span className="skel" style={{ width: "55%", height: 12 }} /><span className="skel" style={{ width: "40%", height: 24 }} /><span className="skel" style={{ width: "65%", height: 10 }} /></div>
        ))}
      </div>
      <div className="c-grid-main">
        {[0, 1].map((i) => (
          <div key={i} className="console-panel console-panel-body stack g16">
            {[0, 1, 2, 3].map((j) => <div key={j} className="stack g8"><span className="skel" style={{ width: "35%", height: 12 }} /><span className="skel" style={{ width: "80%", height: 14 }} /></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatePanel({ icon, tone, title, body, children, alert }: { icon: string; tone: string; title: string; body: string; children: React.ReactNode; alert?: boolean }) {
  return (
    <div className="console-panel c-empty" style={{ padding: "48px 24px" }} role={alert ? "alert" : undefined}>
      <span className={`c-ico-tile c-tone-${tone}`} style={{ width: 44, height: 44, marginBottom: 6 }}><Icon name={icon} size={20} /></span>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <span className="c-caption" style={{ maxWidth: 420, fontSize: 13.5 }}>{body}</span>
      <div className="row g8 wrapx" style={{ justifyContent: "center", marginTop: 10 }}>{children}</div>
    </div>
  );
}

export function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatePanel alert icon="alert" tone="red" title="This page didn’t load"
      body={`We couldn’t load the latest information. Check your connection and try again.${error.digest ? ` If it keeps happening, send IT this code: ${error.digest}.` : ""}`}>
      <button type="button" className="c-btn c-btn-primary" onClick={reset}><Icon name="refresh" size={15} />Try again</button>
      <Link href="/console/my-day" className="c-btn c-btn-secondary">Go to My day</Link>
    </StatePanel>
  );
}

export function ConsoleMissing({ what = "page", href = "/console/requests", back = "Back to requests" }: { what?: string; href?: string; back?: string }) {
  return (
    <StatePanel icon="search" tone="neutral" title={`We couldn’t find that ${what}`} body="Check the reference, or open it from the list. Global search (⌘K) finds requests, clients and references.">
      <Link href={href} className="c-btn c-btn-primary">{back}</Link>
    </StatePanel>
  );
}
