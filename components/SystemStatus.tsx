"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runJobNow, sendTestEmail } from "@/app/actions/admin";
import type { Check, CheckState, JobRun } from "@/lib/system";
import { Icon } from "./ui";

const STATE: Record<CheckState, { label: string; tone: string; icon: string }> = {
  ready: { label: "Live", tone: "green", icon: "check" },
  test: { label: "Test mode", tone: "amber", icon: "clock" },
  missing: { label: "Needs setup", tone: "red", icon: "alert" },
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kigali", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "3 payments settled, 1 summary sent" from a recorded run; zero counts are left out. */
function summary(r: JobRun) {
  if (!r.ok) return String(r.result.error ?? "Failed");
  const get = (k: string, f: string) => Number((r.result[k] as Record<string, unknown> | undefined)?.[f] ?? 0);
  const parts = [
    [get("payments", "settled"), "payment settled", "payments settled"],
    [get("overdue", "held"), "request put on hold", "requests put on hold"],
    [get("retention", "deleted"), "old document deleted", "old documents deleted"],
    [get("digest", "sent"), "staff summary sent", "staff summaries sent"],
  ].filter(([n]) => Number(n) > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return parts.join(", ") || "Nothing to do";
}

export default function SystemStatus({ groups, runs }: { groups: { title: string; checks: Check[] }[]; runs: JobRun[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"email" | "job" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const all = groups.flatMap((g) => g.checks);
  const open = all.filter((c) => c.state !== "ready").length;

  const testEmail = async () => {
    setBusy("email"); setMsg(null);
    const r = await sendTestEmail().catch(() => ({ ok: false as const, error: "The request didn’t finish. Try again." }));
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `Test email sent to ${r.to}. If it doesn’t arrive within a minute, check the spam folder and the server log.` } : { ok: false, text: r.error });
  };
  const runJob = async () => {
    setBusy("job"); setMsg(null);
    const r = await runJobNow().catch(() => ({ ok: false as const, error: "The request didn’t finish. Try again." }));
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `Job finished: ${r.summary}` } : { ok: false, text: r.error });
    router.refresh();
  };

  return (
    <div className="stack g20">
      <section className={`console-panel console-panel-body sys-sum ${open ? "is-open" : ""}`} aria-live="polite">
        <span className={`c-ico-tile ${open ? "c-tone-amber" : "c-tone-green"}`}><Icon name={open ? "alert" : "check"} size={18} /></span>
        <span className="stack" style={{ gap: 2 }}>
          <strong style={{ fontSize: 16 }}>{open ? `${open} of ${all.length} things need attention before launch` : "Everything is connected and live"}</strong>
          <span className="c-caption">Secrets are never shown here, only whether they are set.</span>
        </span>
        <span className="row g8 wrapx sys-actions">
          <button type="button" className="c-btn c-btn-secondary c-btn-sm" onClick={testEmail} disabled={!!busy}>{busy === "email" ? "Sending…" : "Send me a test email"}</button>
          <button type="button" className="c-btn c-btn-primary c-btn-sm" onClick={runJob} disabled={!!busy}>{busy === "job" ? "Running…" : "Run the daily job now"}</button>
        </span>
      </section>
      {msg && <p role="status" className={`sys-msg ${msg.ok ? "is-ok" : "is-err"}`}><Icon name={msg.ok ? "check" : "alert"} size={16} />{msg.text}</p>}

      {groups.map((g) => (
        <section key={g.title} className="console-panel" aria-labelledby={`sys-${g.title}`}>
          <header className="console-panel-header"><h2 id={`sys-${g.title}`} className="console-section-title">{g.title}</h2></header>
          <ul className="c-list">
            {g.checks.map((c) => {
              const st = STATE[c.state];
              return (
                <li key={c.key} className="sys-row">
                  <span className="stack" style={{ gap: 3, minWidth: 0 }}>
                    <strong className="c-list-name">{c.name}</strong>
                    <span className="c-caption" style={{ fontSize: 13.5 }}>{c.detail}</span>
                    {c.fix && <span className="sys-fix">{c.fix}</span>}
                  </span>
                  <span className={`c-badge c-badge-${st.tone}`}><Icon name={st.icon} size={13} />{st.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="console-panel" aria-labelledby="sys-runs">
        <header className="console-panel-header">
          <div className="stack" style={{ gap: 1 }}>
            <h2 id="sys-runs" className="console-section-title">Daily job, last runs</h2>
            <span className="c-caption">Settles payments, puts overdue requests on hold, deletes old documents and texts staff their summary</span>
          </div>
        </header>
        {runs.length ? (
          <ul className="c-list">
            {runs.map((r, i) => (
              <li key={i} className="sys-row">
                <span className="stack" style={{ gap: 2 }}><strong className="c-list-name tnum">{when(r.at)}</strong><span className="c-caption">{summary(r)}</span></span>
                <span className={`c-badge c-badge-${r.ok ? "green" : "red"}`}>{r.ok ? `OK, ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}` : "Failed"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="console-panel-body c-caption">No runs recorded yet. Use “Run the daily job now” to check it works.</p>}
      </section>
    </div>
  );
}
