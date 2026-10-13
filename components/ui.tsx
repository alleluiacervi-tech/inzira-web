"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ICONS } from "./icons";
import { fmtDay } from "@/lib/format";
import { requestChannel, requestTitle } from "@/lib/i18n/present";
import { text } from "@/lib/i18n/messages";
import { DOC_STATUS, PAY_STATUS, flowOf, holdLabel, requestStatus, stageIndex, stageLabel, type PayStatus, type Viewer } from "@/lib/status";
import type { Category, CustomerRequest, DocStatus, Progress, Service, Tone } from "@/lib/types";
import { useI18n } from "./I18n";

function shown(locale: "en" | "rw", group: string, label: string) {
  if (locale !== "rw") return label;
  const next = text(locale, `${group}.${label}`);
  return next === `${group}.${label}` ? label : next;
}

export function Icon({ name, size = 20, stroke = 1.8, color, style }: { name: string; size?: number; stroke?: number; color?: string; style?: CSSProperties }) {
  // An unknown name renders an empty box, which is easy to miss on screen; say so while developing.
  if (process.env.NODE_ENV !== "production" && !(name in ICONS)) console.warn(`Icon "${name}" is not in components/icons.ts`);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color, ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
  );
}

/** The mark: a route that bends uphill (Rwanda's hills) and ends at the yellow "you are here" stop. */
export function LogoMark({ dark = false }: { dark?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="30" height="30" rx="8" fill={dark ? "#f3f5fa" : "#142850"} />
      <path d="M8 22.5c0-6 14-5 14-11.5" fill="none" stroke={dark ? "#142850" : "#dde4f0"} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="8" cy="22.5" r="2.1" fill={dark ? "#142850" : "#dde4f0"} />
      <circle cx="22" cy="9" r="3.4" fill="#C9962E" stroke="#142850" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ dark = false, href = "/", label = "Inzira home" }: { dark?: boolean; href?: string; label?: string }) {
  return (
    <Link href={href} className="row g10 logo-link" style={{ textDecoration: "none", color: dark ? "var(--on-dark)" : "var(--brand)" }} aria-label={label}>
      <LogoMark dark={dark} />
      <span className="d" style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.035em" }}>inzira</span>
    </Link>
  );
}

// ---------------- status badges ----------------
/** An institution's name as a plain text label (never its logo). */
export function Plate({ code, size }: { code: string; size?: "sm" }) {
  return <span className={`plate ${code.length > 4 ? "plate-word" : ""} ${size === "sm" ? "plate-sm" : ""}`} aria-hidden="true">{code}</span>;
}

export function Badge({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`b t-${tone}`}>{label}</span>;
}
export function RequestBadge({ r, viewer }: { r: Pick<Progress, "stage" | "hold" | "closed" | "labels">; viewer: Viewer }) {
  const { locale } = useI18n();
  const status = requestStatus(r, viewer);
  const label = viewer === "customer" ? shown(locale, "status", status.label) : status.label;
  return <Badge tone={status.tone} label={label} />;
}
export function DocBadge({ s }: { s: DocStatus | "issued" }) {
  const { locale } = useI18n();
  const status = DOC_STATUS[s];
  return <Badge tone={status.tone} label={shown(locale, "doc", status.label)} />;
}
export function PayBadge({ s }: { s: PayStatus }) {
  const { locale } = useI18n();
  const status = PAY_STATUS[s];
  return <Badge tone={status.tone} label={shown(locale, "pay", status.label)} />;
}

// ---------------- pricing: always two labelled lines ----------------
export function FeeTag({ kind }: { kind: "official" | "ours" }) {
  const { t } = useI18n();
  return kind === "official" ? <span className="fo">{t("feeTag.official")}</span> : <span className="fs">{t("feeTag.ours")}</span>;
}

/** The core pricing pattern: official fee and our fee are ALWAYS two separate, labelled lines. */
export function FeeBreakdown({ official, officialNote, ours, oursNote, total, children }:
  { official: string; officialNote: string; ours: string; oursNote?: string; total: string; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="card card-pad stack g18">
      <div className="row between g16" style={{ alignItems: "flex-start" }}>
        <div className="stack g6">
          <div className="row g8"><FeeTag kind="official" /><strong style={{ fontSize: 15 }}>{t("service.officialFee")}</strong></div>
          <p className="hint" style={{ maxWidth: 360 }}>{officialNote}</p>
        </div>
        <span className="d fig" style={{ fontSize: 20, textAlign: "right", maxWidth: 200 }}>{official}</span>
      </div>
      <div className="divider" />
      <div className="row between g16" style={{ alignItems: "flex-start" }}>
        <div className="stack g6">
          <div className="row g8"><FeeTag kind="ours" /><strong style={{ fontSize: 15 }}>{t("service.assistFee")}</strong></div>
          <p className="hint" style={{ maxWidth: 360 }}>{oursNote ?? t("service.assistNote")}</p>
        </div>
        <span className="d fig fee-ours" style={{ fontSize: 20, textAlign: "right", maxWidth: 190 }}>{ours}</span>
      </div>
      <div className="total-row"><strong>{t("service.total")}</strong><span className="d fig" style={{ fontSize: 20, textAlign: "right", marginLeft: "auto" }}>{total}</span></div>
      {children}
      <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="var(--ok)" /><span>{t("service.confirmPay")}</span></p>
    </div>
  );
}

export function FeeLines({ officialLabel: ol, official, ours, total, totalLabel: tl }: { officialLabel: string; official: string; ours: string; total?: string; totalLabel?: string }) {
  const { t } = useI18n();
  return (
    <div className="stack g10" style={{ fontSize: 14.5 }}>
      <div className="row between g12"><span className="row g8"><FeeTag kind="official" /> {ol}</span><strong className="nowrap">{official}</strong></div>
      <div className="row between g12"><span className="row g8"><FeeTag kind="ours" /> {t("service.assistShort")}</span><strong className="fee-ours nowrap">{ours}</strong></div>
      {total && <div className="row between g12" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><strong>{tl ?? t("pay.total")}</strong><strong className="d fig" style={{ fontSize: 18, textAlign: "right" }}>{total}</strong></div>}
    </div>
  );
}

export function CategoryCard({ c, count }: { c: Category; count: number }) {
  return (
    <Link href={c.href ?? `/services?category=${c.id}`} className="card cat-card stack g14">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <span className="ico-tile"><Icon name={c.icon} size={24} /></span>
        <span className="mut" style={{ fontSize: 12.5, fontWeight: 600 }}>{c.href ? "Ask us" : `${count} ${count === 1 ? "service" : "services"}`}</span>
      </div>
      <div className="stack g6"><span className="d" style={{ fontSize: 18 }}>{c.name}</span><span className="mut m-hide" style={{ fontSize: 14, lineHeight: 1.5 }}>{c.desc}</span></div>
      <span className="row g6 m-hide" style={{ fontSize: 14, fontWeight: 700, color: "var(--ember-deep)", marginTop: "auto" }}>{c.href ? "Tell us what you need" : "Browse"} <Icon name="arrow" size={16} /></span>
    </Link>
  );
}

const ALERT_ICON = { info: "info", ok: "check", warn: "alert", err: "alert", act: "alert" } as const;
/** Static by default. Pass `live` when the alert appears in response to something the person just did. */
export function Alert({ kind, title, children, action, live }: { kind: keyof typeof ALERT_ICON; title: string; children?: ReactNode; action?: ReactNode; live?: boolean }) {
  return (
    <div className={`alert t-${kind}`} role={live ? (kind === "err" ? "alert" : "status") : undefined}>
      <Icon name={ALERT_ICON[kind]} size={20} />
      <div className="alert-body"><strong>{title}</strong>{children && <span>{children}</span>}</div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, delta, sub, icon, valueColor }: { label: string; value: string; delta?: string; sub?: string; icon?: string; valueColor?: string }) {
  return (
    <div className="card stack g10" style={{ padding: "18px 20px" }}>
      <div className="row between g8"><span className="mut" style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>{icon && <span className="kpi-ico"><Icon name={icon} size={17} /></span>}</div>
      <span className="d fig tnum nowrap" style={{ fontSize: 30, lineHeight: 1, color: valueColor }}>{value}</span>
      <div className="row g8">{delta && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ok)" }}>{delta}</span>}{sub && <span className="mut" style={{ fontSize: 13 }}>{sub}</span>}</div>
    </div>
  );
}

export function DocCard({ name, meta, badge, action, icon = "file", compact }: { name: string; meta: string; badge: ReactNode; action?: ReactNode; icon?: string; compact?: boolean }) {
  return (
    <div className="card row g14" style={{ padding: compact ? 12 : 16, flexWrap: "wrap" }}>
      <span className="ico-tile" style={{ width: 40, height: 40, borderRadius: 6 }}><Icon name={icon} size={20} /></span>
      <div className="stack grow" style={{ gap: 3, minWidth: 160 }}><strong style={{ fontSize: 14.5 }}>{name}</strong><span className="mut" style={{ fontSize: 13 }}>{meta}</span></div>
      {badge}{action}
    </div>
  );
}

export function Notif({ icon, title, meta, unread, href, unreadLabel = "Unread" }: { icon: string; title: string; meta: string; unread?: boolean; href?: string; unreadLabel?: string }) {
  const inner = (
    <>
      <span className="kpi-ico" style={{ width: 34, height: 34 }}><Icon name={icon} size={17} /></span>
      <div className="stack grow" style={{ gap: 3 }}><span style={{ fontSize: 14, lineHeight: 1.45, fontWeight: unread ? 700 : 400 }}>{title}</span><span className="mut" style={{ fontSize: 12.5 }}>{meta}</span></div>
      {unread ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ember)", flexShrink: 0, marginTop: 7 }}><span className="sr-only">{unreadLabel}</span></span> : <span style={{ width: 8 }} />}
    </>
  );
  const st: CSSProperties = { display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--line-2)", textDecoration: "none", color: "var(--ink)" };
  return href ? <Link href={href} style={st}>{inner}</Link> : <div style={st}>{inner}</div>;
}

// ---------------- progress ----------------
/** The request's stages. A hold or a closure marks the current step; it never adds or skips a step. */
export function StageTimeline({ r, viewer }: { r: Progress; viewer: Viewer }) {
  const { locale, t } = useI18n();
  const flow = flowOf(r);
  const cur = stageIndex(r);
  const finished = r.stage === "completed";
  const customer = viewer === "customer";
  const hold = (note: string) => {
    if (!customer) return note;
    if (note.startsWith("Returned · ")) return `${shown(locale, "status", "Returned")} · ${shown(locale, "status", "waiting on you")}`;
    return shown(locale, "status", note);
  };
  return (
    <ol className="tl-h" aria-label={t("request.progress")} style={{ ["--n" as string]: flow.length }}>
      {flow.map((s, i) => {
        const here = i === cur && !finished;
        const st = i < cur || finished ? "done" : !here ? "todo" : r.closed ? "stop" : r.hold ? "hold" : "cur";
        const date = r.stageDates[s];
        return (
          <li key={s} className={st} aria-current={here ? "step" : undefined}>
            <div className="tl-track">
              <span className={`tl-dot ${st}`}>
                {st === "done" && <Icon name="check" size={15} stroke={2.4} />}
                {st === "hold" && <Icon name="pause" size={14} stroke={2.6} />}
                {st === "stop" && <Icon name="x" size={14} stroke={2.6} />}
              </span>
              {i < flow.length - 1 ? <span className="tl-line" /> : <span style={{ flexGrow: 1 }} />}
            </div>
            <div className="stack" style={{ gap: 3 }}>
              <span className="tl-label">{customer ? shown(locale, "status", stageLabel(r, s)) : stageLabel(r, s)}</span>
              {(st === "hold" || st === "stop") && <span className="tl-note">{hold(holdLabel(r, viewer))}</span>}
              {st === "stop" ? <span className="mut" style={{ fontSize: 12 }}>{fmtDay(r.closed!.at, customer ? locale : "en")}</span>
                : date && <span className="mut" style={{ fontSize: 12 }}>{here ? t("request.since", { date: fmtDay(date, customer ? locale : "en") }) : fmtDay(date, customer ? locale : "en")}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type TimelineItem = { state: "done" | "cur" | "todo"; title: string; meta?: string; body?: string };
export function TimelineV({ events }: { events: TimelineItem[] }) {
  return (
    <ol className="tl-v">
      {events.map((e, i) => (
        <li key={i} className={e.state}>
          <div className="tl-rail">
            <span className={`tl-dot ${e.state}`}>{e.state === "done" && <Icon name="check" size={14} stroke={2.4} />}</span>
            {i < events.length - 1 && <span className="tl-vline" />}
          </div>
          <div className="tl-body">
            <span style={{ fontWeight: 700, fontSize: 14.5, color: e.state === "todo" ? "var(--muted)" : "var(--ink)" }}>{e.title}</span>
            {e.meta && <span className="mut" style={{ fontSize: 12.5 }}>{e.meta}</span>}
            {e.body && <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>{e.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One request in a customer list: what it is, where it is, and what happens next. */
export function RequestRow({ r }: { r: CustomerRequest }) {
  const { locale, t } = useI18n();
  const steps = r.flow.length;
  const step = stageIndex(r) + 1;
  const act = !!r.hold && !r.closed;
  const open = !r.closed && r.stage !== "completed";
  const name = requestTitle(r.name, r.service, locale);
  return (
    <div className="req-row">
      <div className="stack" style={{ gap: 5 }}><span className="m mut">{r.ref}</span><Link className="lnk" href={`/portal/requests/${r.ref}`} style={{ fontSize: 16 }}>{name}</Link><span className="mut" style={{ fontSize: 13 }}>{t("request.forLine", { name: r.profile.name, channel: requestChannel(r.channel, r.service, locale) })}</span></div>
      <div className="stack g8" style={{ alignItems: "flex-start" }}>
        <RequestBadge r={r} viewer="customer" />
        {open && <div className="progress" style={{ width: "100%" }} role="img" aria-label={t("request.step", { n: step, total: steps })}><span style={{ width: `${(step / steps) * 100}%`, background: act ? "var(--signal-deep)" : undefined }} /></div>}
        <span className="mut" style={{ fontSize: 12.5 }}>{open ? `${t("request.step", { n: step, total: steps })} · ${shown(locale, "status", stageLabel(r, r.stage))}` : r.closed ? t("request.closed", { date: fmtDay(r.closed.at, locale) }) : t("request.delivered", { date: fmtDay(r.stageDates.completed ?? r.updatedAt, locale) })}{r.agent ? ` · ${t("request.agent", { name: r.agent.name })}` : ""}</span>
      </div>
      <div className="stack g10" style={{ alignItems: "flex-start" }}>
        <div className="stack g4"><span className="req-next" style={{ color: act ? "var(--ember-deep)" : "var(--muted)" }}>{act ? t("request.yourAction") : open ? t("request.next") : t("request.outcome")}</span><span style={{ fontSize: 14, lineHeight: 1.45 }}>{r.next}</span></div>
        <Link className={`btn btn-sm ${act ? "btn-p" : "btn-s"}`} href={`/portal/requests/${r.ref}`} aria-label={t("request.viewName", { action: act ? t("request.resolve") : t("request.view"), name, ref: r.ref })}>{act ? t("request.resolve") : t("request.view")}</Link>
      </div>
    </div>
  );
}

/** Stacked bars: our fees (ember) over official pass-through (grey). Values in RWF thousands. */
export function FeeBars({ data, height = 160 }: { data: { label: string; official: number; ours: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.official + d.ours));
  return (
    <figure className="stack g14">
      <div className="row g16 wrapx" style={{ fontSize: 12.5 }}>
        <span className="row g6"><span style={{ width: 10, height: 10, background: "var(--ember)", borderRadius: 2 }} />Our service fees</span>
        <span className="row g6"><span style={{ width: 10, height: 10, background: "var(--pass)", borderRadius: 2 }} />Official fees passed through</span>
      </div>
      <div className="bars" role="img" aria-label={data.map((d) => `${d.label}: ours RWF ${d.ours}k, official RWF ${d.official}k`).join("; ")}>
        {data.map((d) => (
          <div key={d.label}>
            <div className="bar-col" style={{ height }} title={`${d.label}: ours RWF ${d.ours}k · official RWF ${d.official}k`}>
              <div style={{ width: "60%", height: Math.round((d.ours / max) * height), background: "var(--ember)", borderRadius: "3px 3px 0 0" }} />
              <div style={{ width: "60%", height: Math.max(2, Math.round((d.official / max) * height)), background: "var(--pass)", marginTop: 2 }} />
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
