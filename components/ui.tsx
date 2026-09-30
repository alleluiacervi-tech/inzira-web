import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ICONS } from "./icons";
import {
  STATUS, STEPS, catById, officialLabel, oursLabel, totalLabel,
  type Service, type StatusKey, type TimelineEvent,
} from "@/lib/data";

export function Icon({ name, size = 20, stroke = 1.8, color, style }: { name: string; size?: number; stroke?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color, ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
  );
}

export function LogoMark({ dark = false }: { dark?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="7" fill={dark ? "#2A2D31" : "#16181B"} />
      <path d="M8.5 20.5L15 9.5l6.5 11" fill="none" stroke="#F08A4B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="21" r="2" fill="#F6F4EF" />
    </svg>
  );
}

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="row g10" style={{ textDecoration: "none", color: dark ? "#F6F4EF" : "#16181B" }} aria-label="Inzira home">
      <LogoMark dark={dark} />
      <span className="d" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>inzira</span>
    </Link>
  );
}

export function Badge({ k, label }: { k: StatusKey; label?: string }) {
  const s = STATUS[k];
  return <span className="b" style={{ background: s.bg, color: s.fg }}>{label ?? s.label}</span>;
}

export function FeeTag({ kind }: { kind: "official" | "ours" }) {
  return kind === "official" ? <span className="fo">Official</span> : <span className="fs">Inzira</span>;
}

/** The core pricing pattern: official fee and our fee are ALWAYS two separate, labelled lines. */
export function FeeBreakdown({ official, officialNote, ours, oursNote = "Paid to Inzira for checking, preparing, submitting and following up.", total, children }:
  { official: string; officialNote: string; ours: string; oursNote?: string; total: string; children?: ReactNode }) {
  return (
    <div className="card card-pad stack g18">
      <div className="row between g16" style={{ alignItems: "flex-start" }}>
        <div className="stack g6">
          <div className="row g8"><FeeTag kind="official" /><strong style={{ fontSize: 15 }}>Official government fee</strong></div>
          <p className="hint" style={{ maxWidth: 360 }}>{officialNote}</p>
        </div>
        <span className="d" style={{ fontSize: 20, whiteSpace: "nowrap" }}>{official}</span>
      </div>
      <div className="divider" />
      <div className="row between g16" style={{ alignItems: "flex-start" }}>
        <div className="stack g6">
          <div className="row g8"><FeeTag kind="ours" /><strong style={{ fontSize: 15 }}>Our service / assistance fee</strong></div>
          <p className="hint" style={{ maxWidth: 360 }}>{oursNote}</p>
        </div>
        <span className="d fee-ours" style={{ fontSize: 20, whiteSpace: "nowrap" }}>{ours}</span>
      </div>
      <div className="total-row"><strong>Total estimated cost</strong><span className="d" style={{ fontSize: 24 }}>{total}</span></div>
      {children}
      <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="#1E6B3A" /><span>You approve every amount before you pay. Nothing is charged without your confirmation.</span></p>
    </div>
  );
}

export function FeeLines({ officialLabel: ol, official, ours, total, totalLabel: tl = "Total" }: { officialLabel: string; official: string; ours: string; total?: string; totalLabel?: string }) {
  return (
    <div className="stack g10" style={{ fontSize: 14.5 }}>
      <div className="row between g12"><span className="row g8"><FeeTag kind="official" /> {ol}</span><strong>{official}</strong></div>
      <div className="row between g12"><span className="row g8"><FeeTag kind="ours" /> Assistance fee</span><strong className="fee-ours">{ours}</strong></div>
      {total && <div className="row between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><strong>{tl}</strong><strong className="d" style={{ fontSize: 18 }}>{total}</strong></div>}
    </div>
  );
}

function FeeMini({ s }: { s: Service }) {
  const cell = (label: string, value: string, color: string, last = false): ReactNode => (
    <div className="stack g4" style={{ padding: "10px 12px", borderRight: last ? 0 : "1px solid var(--line-2)", background: last ? "#FAF8F4" : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: label === "Our fee" ? "var(--ember-deep)" : undefined }}>{value}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: "1px solid var(--line-2)", borderRadius: 6 }}>
      {cell("Official fee", officialLabel(s), "#3A3C40")}
      {cell("Our fee", oursLabel(s), "#A33C0C")}
      {cell("Est. total", totalLabel(s), "#5E5C55", true)}
    </div>
  );
}

export function ServiceCard({ s }: { s: Service }) {
  return (
    <article className="card card-pad stack g16">
      <div className="row between g10"><span className="eb" style={{ fontSize: 11 }}>{catById(s.category).name}</span>{s.popular && <span className="tag" style={{ background: "var(--ember-tint)", color: "var(--ember-deep)" }}>Popular</span>}</div>
      <div className="stack g6">
        <h3 className="d" style={{ fontSize: 19, lineHeight: 1.25 }}><Link href={`/services/${s.slug}`} className="lnk">{s.name}</Link></h3>
        <span className="mut" style={{ fontSize: 13.5 }}>{s.via}</span>
      </div>
      <div className="stack g8" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
        <span className="row g8"><Icon name="clock" size={16} /> {s.time}<span className="mut">· estimate</span></span>
        <span className="row g8" style={{ alignItems: "flex-start" }}><Icon name="file" size={16} /> {s.docsShort}</span>
      </div>
      <FeeMini s={s} />
      <div className="row g8" style={{ marginTop: "auto" }}>
        <Link className="btn btn-p btn-sm grow" href={`/start/${s.slug}`}>Start Request</Link>
        <Link className="btn btn-s btn-sm" href={`/services/${s.slug}`}>Details</Link>
      </div>
    </article>
  );
}

export function CategoryCard({ id }: { id: string }) {
  const c = catById(id);
  return (
    <Link href={`/services?category=${c.id}`} className="card stack g14" style={{ padding: 22, textDecoration: "none", color: "var(--ink)" }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <span className="ico-tile"><Icon name={c.icon} size={24} /></span>
        <span className="mut" style={{ fontSize: 12.5, fontWeight: 600 }}>{c.count}</span>
      </div>
      <div className="stack g6"><span className="d" style={{ fontSize: 18 }}>{c.name}</span><span className="mut" style={{ fontSize: 14, lineHeight: 1.5 }}>{c.desc}</span></div>
      <span className="row g6" style={{ fontSize: 14, fontWeight: 700, color: "var(--ember-deep)", marginTop: "auto" }}>Browse <Icon name="arrow" size={16} /></span>
    </Link>
  );
}

const ALERT = {
  info: ["#E6EEF8", "#1F4E8C", "info"], ok: ["#E2F2E6", "#1E6B3A", "check"], warn: ["#FDF1DC", "#7A4A00", "alert"],
  err: ["#FBE3E3", "#A12424", "alert"], act: ["#FBEDE4", "#A33C0C", "alert"],
} as const;
export function Alert({ kind, title, children, action }: { kind: keyof typeof ALERT; title: string; children?: ReactNode; action?: ReactNode }) {
  const [bg, fg, ic] = ALERT[kind];
  return (
    <div className="alert" role={kind === "err" || kind === "act" ? "alert" : "status"} style={{ background: bg, color: fg }}>
      <Icon name={ic} size={20} />
      <div className="alert-body"><strong>{title}</strong>{children && <span>{children}</span>}</div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, delta, sub, icon, valueColor }: { label: string; value: string; delta?: string; sub?: string; icon?: string; valueColor?: string }) {
  return (
    <div className="card stack g10" style={{ padding: "18px 20px" }}>
      <div className="row between"><span className="mut" style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>{icon && <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={17} /></span>}</div>
      <span className="d" style={{ fontSize: 30, lineHeight: 1, color: valueColor }}>{value}</span>
      <div className="row g8">{delta && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ok)" }}>{delta}</span>}{sub && <span className="mut" style={{ fontSize: 13 }}>{sub}</span>}</div>
    </div>
  );
}

export function DocCard({ name, meta, status, action, icon = "file", compact }: { name: string; meta: string; status: StatusKey; action?: ReactNode; icon?: string; compact?: boolean }) {
  return (
    <div className="card row g14" style={{ padding: compact ? 12 : 16, flexWrap: "wrap" }}>
      <span className="ico-tile" style={{ width: 40, height: 40, borderRadius: 6 }}><Icon name={icon} size={20} /></span>
      <div className="stack grow" style={{ gap: 3, minWidth: 160 }}><strong style={{ fontSize: 14.5 }}>{name}</strong><span className="mut" style={{ fontSize: 13 }}>{meta}</span></div>
      <Badge k={status} />{action}
    </div>
  );
}

export function Notif({ icon, title, meta, unread, href }: { icon: string; title: string; meta: string; unread?: boolean; href?: string }) {
  const inner = (
    <>
      <span style={{ width: 34, height: 34, borderRadius: 6, background: "var(--bone)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={icon} size={17} /></span>
      <div className="stack grow" style={{ gap: 3 }}><span style={{ fontSize: 14, lineHeight: 1.45, fontWeight: unread ? 700 : 400 }}>{title}</span><span className="mut" style={{ fontSize: 12.5 }}>{meta}</span></div>
      {unread ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ember)", flexShrink: 0, marginTop: 7 }}><span className="sr-only">Unread</span></span> : <span style={{ width: 8 }} />}
    </>
  );
  const st: CSSProperties = { display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--line-2)", textDecoration: "none", color: "var(--ink)" };
  return href ? <Link href={href} style={st}>{inner}</Link> : <div style={st}>{inner}</div>;
}

export function TimelineH({ current, dates, skipped = [] }: { current: number; dates: string[]; skipped?: number[] }) {
  return (
    <ol className="tl-h" aria-label="Request progress">
      {STEPS.map((s, i) => {
        const st = i < current ? "done" : i === current ? "cur" : "todo";
        const color = st === "done" ? "var(--ink)" : st === "cur" ? "var(--ember-deep)" : skipped.includes(i) ? "#8A877E" : "var(--muted)";
        return (
          <li key={s} className={st} aria-current={st === "cur" ? "step" : undefined}>
            <div className="tl-track">
              <span className={`tl-dot ${st}`}>{st === "done" && <Icon name="check" size={15} stroke={2.4} />}</span>
              {i < STEPS.length - 1 ? <span className="tl-line" /> : <span style={{ flexGrow: 1 }} />}
            </div>
            <div className="stack" style={{ gap: 3 }}>
              <span className="tl-label" style={{ color }}>{s}</span>
              {dates[i] && <span className="mut" style={{ fontSize: 12 }}>{dates[i]}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineV({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="tl-v">
      {events.map((e, i) => (
        <li key={i} className={e.state}>
          <div className="tl-rail">
            <span className={`tl-dot ${e.state}`}>{e.state === "done" && <Icon name="check" size={14} stroke={2.4} />}</span>
            {i < events.length - 1 && <span className="tl-vline" />}
          </div>
          <div className="tl-body">
            <span style={{ fontWeight: 700, fontSize: 14.5, color: e.state === "cur" ? "var(--ember-deep)" : e.state === "todo" ? "var(--muted)" : "var(--ink)" }}>{e.title}</span>
            {e.meta && <span className="mut" style={{ fontSize: 12.5 }}>{e.meta}</span>}
            {e.body && <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>{e.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Stacked bars: our fees (ember) over official pass-through (grey). Values in RWF thousands. */
export function FeeBars({ data, height = 160 }: { data: { label: string; official: number; ours: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.official + d.ours));
  return (
    <figure className="stack g14">
      <div className="row g16 wrapx" style={{ fontSize: 12.5 }}>
        <span className="row g6"><span style={{ width: 10, height: 10, background: "var(--ember)", borderRadius: 2 }} />Our service fees</span>
        <span className="row g6"><span style={{ width: 10, height: 10, background: "#B8B3A8", borderRadius: 2 }} />Official fees passed through</span>
      </div>
      <div className="bars" role="img" aria-label={data.map((d) => `${d.label}: ours RWF ${d.ours}k, official RWF ${d.official}k`).join("; ")}>
        {data.map((d) => (
          <div key={d.label}>
            <div className="bar-col" style={{ height }} title={`${d.label}: ours RWF ${d.ours}k · official RWF ${d.official}k`}>
              <div style={{ width: "60%", height: Math.round((d.ours / max) * height), background: "var(--ember)", borderRadius: "3px 3px 0 0" }} />
              <div style={{ width: "60%", height: Math.max(2, Math.round((d.official / max) * height)), background: "#B8B3A8", marginTop: 2 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="row g6">{data.map((d) => <span key={d.label} className="mut grow" style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>{d.label}</span>)}</div>
    </figure>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="topbar">
      <div className="stack" style={{ gap: 3 }}><h1 className="d" style={{ fontSize: 20 }}>{title}</h1>{sub && <span className="mut" style={{ fontSize: 13 }}>{sub}</span>}</div>
      {children && <div className="row g12 wrapx">{children}</div>}
    </div>
  );
}

export function initials(name: string) {
  return name.replace(/\./g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
