"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtLong, fmtWhen, shortName } from "@/lib/format";
import { stageLabel } from "@/lib/status";
import type { RequestView, Staff } from "@/lib/types";
import { RequestStatusBadge } from "./StatusBadge";
import { SidePanel } from "./SidePanel";
import { StatCard } from "./StatCard";

export interface MyDayData {
  todayFollowUps: RequestView[];
  slaCases: Array<{
    case: RequestView;
    hoursElapsed: number;
    targetHours: number;
    breached: boolean;
  }>;
  clientReplies: RequestView[];
  pendingDocs: Array<{
    case: RequestView;
    doc: { id: string; name: string; status: string; uploadedAt?: string };
  }>;
  openCasesCount: number;
}

type Tone = "red" | "blue" | "amber" | "green";

/** 26 → "1d 2h", 5 → "5h". */
const fmtHours = (h: number) => (h < 24 ? `${h}h` : `${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ""}`);

function Section({ id, icon, tone, title, caption, count, empty, children }: {
  id: string; icon: string; tone: Tone; title: string; caption: string; count: number;
  empty: { title: string; body: string }; children: ReactNode;
}) {
  return (
    <section id={id} className="console-panel c-section" aria-labelledby={`${id}-title`}>
      <header className="console-panel-header">
        <div className="row g10" style={{ minWidth: 0 }}>
          <span className={`c-ico-tile c-tone-${tone}`}><Icon name={icon} size={16} /></span>
          <div className="stack" style={{ gap: 1, minWidth: 0 }}>
            <h2 id={`${id}-title`} className="console-section-title">{title}</h2>
            <span className="c-caption">{caption}</span>
          </div>
        </div>
        <span className={`c-count ${count ? `c-tone-${tone}` : "c-tone-neutral"}`} aria-label={`${count} items`}>{count}</span>
      </header>
      {count === 0 ? (
        <div className="c-empty">
          <Icon name="check-circle" size={22} />
          <strong>{empty.title}</strong>
          <span className="c-caption">{empty.body}</span>
        </div>
      ) : (
        <ul className="c-list">{children}</ul>
      )}
    </section>
  );
}

function CaseLine({ c, badge = true }: { c: RequestView; badge?: boolean }) {
  return (
    <div className="row g8 wrapx" style={{ rowGap: 4 }}>
      <Link href={`/console/requests/${c.ref}`} className="c-mono-ref c-ref-link">{c.ref}</Link>
      <strong className="c-list-name">{c.profile.name}</strong>
      {badge && <RequestStatusBadge r={c} viewer="staff" />}
    </div>
  );
}

export function MyDayView({ staff, data, now }: { staff: Staff; data: MyDayData; now: string }) {
  const [preview, setPreview] = useState<RequestView | null>(null);
  const overdue = data.slaCases.filter((x) => x.breached).length;
  const sla = [...data.slaCases].sort((a, b) => (b.hoursElapsed - b.targetHours) - (a.hoursElapsed - a.targetHours));
  const waiting = data.slaCases.length + data.clientReplies.length + data.todayFollowUps.length + data.pendingDocs.length;

  return (
    <div className="stack g24">
      <div className="c-page-head">
        <div className="stack g4">
          <span className="c-eyebrow">My day · {fmtLong(now)}</span>
          <h1 className="console-page-title">Good day, {shortName(staff.name)}</h1>
          <p className="c-caption" style={{ fontSize: 13.5 }}>
            {waiting === 0
              ? `Nothing is waiting on you. You have ${data.openCasesCount} open ${data.openCasesCount === 1 ? "case" : "cases"}.`
              : overdue > 0
                ? `${overdue} ${overdue === 1 ? "case is" : "cases are"} past target time — start there.`
                : `${waiting} ${waiting === 1 ? "item needs" : "items need"} you today.`}
          </p>
        </div>
        <div className="row g8 wrapx">
          <Link href="/console/inbox" className="c-btn c-btn-secondary"><Icon name="inbox" size={15} />Inbox</Link>
          <Link href="/console/requests?view=my_open" className="c-btn c-btn-primary"><Icon name="briefcase" size={15} />My open cases ({data.openCasesCount})</Link>
        </div>
      </div>

      <div className="c-grid-stats">
        <StatCard title="SLA Attention" value={data.slaCases.length} icon="alert" href="#sla"
          subtext={`${overdue} overdue · ${data.slaCases.length - overdue} near limit`} tone={overdue ? "red" : undefined} />
        <StatCard title="Client Replies" value={data.clientReplies.length} icon="msg" href="#replies" subtext="Waiting for your answer" />
        <StatCard title="Follow-ups Today" value={data.todayFollowUps.length} icon="clock" href="#follow-ups" subtext="Calls and reminders due" />
        <StatCard title="Documents to Review" value={data.pendingDocs.length} icon="file-text" href="#documents" subtext="Uploaded by clients" />
      </div>

      <div className="c-grid-2">
        <Section id="sla" icon="alert" tone="red" title="Past or near target time" caption="Cases that have stayed too long in their current stage"
          count={sla.length} empty={{ title: "Everything is on schedule", body: "No case is close to its stage target." }}>
          {sla.map(({ case: c, hoursElapsed, targetHours, breached }) => (
            <li key={c.ref} className={`c-list-row ${breached ? "c-list-row-alert" : ""}`}>
              <div className="stack g6 grow">
                <CaseLine c={c} />
                <div className="row g8 wrapx">
                  <span className={`c-badge ${breached ? "c-badge-red" : "c-badge-amber"}`}>
                    {breached ? `Overdue by ${fmtHours(hoursElapsed - targetHours)}` : `${fmtHours(hoursElapsed)} of ${fmtHours(targetHours)}`}
                  </span>
                  <span className="c-caption">{stageLabel(c, c.stage)} for {fmtHours(hoursElapsed)} · {c.service.name}</span>
                </div>
              </div>
              <Link href={`/console/requests/${c.ref}`} className="c-btn c-btn-secondary c-btn-sm">Open case</Link>
            </li>
          ))}
        </Section>

        <Section id="replies" icon="msg" tone="blue" title="Client replies" caption="Clients who wrote back and are waiting for you"
          count={data.clientReplies.length} empty={{ title: "All caught up", body: "No unanswered customer messages." }}>
          {data.clientReplies.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <li key={c.ref} className="c-list-row">
                <div className="stack g6 grow">
                  <CaseLine c={c} badge={false} />
                  {last && <p className="c-quote">“{last.body}”</p>}
                  <span className="c-caption">{c.service.name}{last?.at ? ` · ${fmtAgo(last.at, now)}` : ""}</span>
                </div>
                <div className="row g6">
                  <button type="button" className="c-btn c-btn-ghost c-btn-sm" onClick={() => setPreview(c)}>Preview</button>
                  <Link href={`/console/requests/${c.ref}#messages`} className="c-btn c-btn-primary c-btn-sm">Reply</Link>
                </div>
              </li>
            );
          })}
        </Section>

        <Section id="follow-ups" icon="clock" tone="amber" title="Follow-ups due today" caption="Reminders you set on your cases"
          count={data.todayFollowUps.length} empty={{ title: "No follow-ups due today", body: "Reminders you schedule on a case appear here on the day." }}>
          {data.todayFollowUps.map((c) => (
            <li key={c.ref} className="c-list-row">
              <div className="stack g6 grow">
                <CaseLine c={c} />
                {c.followUp && <p className="c-quote c-quote-amber"><strong>Reminder:</strong> {c.followUp.what}</p>}
                <span className="c-caption">{c.profile.phone || c.account.phone} · {c.service.name}</span>
              </div>
              <Link href={`/console/requests/${c.ref}`} className="c-btn c-btn-secondary c-btn-sm">Open case</Link>
            </li>
          ))}
        </Section>

        <Section id="documents" icon="file-text" tone="green" title="Documents to review" caption="Files clients uploaded that need checking"
          count={data.pendingDocs.length} empty={{ title: "No documents waiting", body: "New uploads from your clients appear here." }}>
          {data.pendingDocs.map(({ case: c, doc }) => (
            <li key={`${c.ref}-${doc.id}`} className="c-list-row">
              <div className="stack g6 grow">
                <div className="row g8"><Icon name="file" size={15} /><strong className="c-list-name">{doc.name}</strong></div>
                <span className="c-caption">
                  <Link href={`/console/requests/${c.ref}`} className="c-mono-ref c-ref-link">{c.ref}</Link> · {c.profile.name} · {c.service.name}
                </span>
              </div>
              <Link href={`/console/requests/${c.ref}#documents`} className="c-btn c-btn-secondary c-btn-sm">Review</Link>
            </li>
          ))}
        </Section>
      </div>

      <SidePanel
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Case ${preview.ref}` : ""}
        subtitle={preview ? `${preview.profile.name} · ${preview.service.name}` : ""}
        width={540}
        footer={preview ? (
          <div className="row between" style={{ width: "100%" }}>
            <button type="button" className="c-btn c-btn-secondary" onClick={() => setPreview(null)}>Close</button>
            <Link href={`/console/requests/${preview.ref}#messages`} className="c-btn c-btn-primary">Open and reply</Link>
          </div>
        ) : undefined}
      >
        {preview && (
          <div className="stack g16">
            <div className="stack g6"><span className="c-caption">Status</span><RequestStatusBadge r={preview} viewer="staff" /></div>
            <div className="stack g4">
              <span className="c-caption">Client</span>
              <strong>{preview.profile.name}</strong>
              <span className="c-caption">{preview.profile.phone || preview.account.phone}</span>
            </div>
            <div className="stack g6">
              <span className="c-caption">Conversation</span>
              <div className="stack g8" style={{ maxHeight: 320, overflowY: "auto" }}>
                {preview.messages.map((m, i) => (
                  <div key={i} className={`c-bubble ${m.by === "customer" ? "" : "c-bubble-me"}`}>
                    <span className="c-caption">{m.by === "customer" ? preview.profile.name : "Inzira"} · {fmtWhen(m.at, now)}</span>
                    <span>{m.body}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
