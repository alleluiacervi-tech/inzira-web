"use client";
import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { addTaxDate, addTaxWatch, saveDeclaration, saveMoneyReceived, saveRequestLink, saveRraPayment, stopTaxWatch } from "@/app/actions/taxes";
import { Icon } from "@/components/ui";
import { rwf } from "@/lib/format";
import { TAX_KINDS, fullDate, phaseLabel, prettyDate, type TaxPhase } from "@/lib/tax-calendar";
import type { DiaryRow } from "@/lib/tax-diary";

type Lane = "attention" | "open" | "paid";
type Result = { ok: boolean; error?: string } | null;

const LANES: { id: Lane; label: string }[] = [
  { id: "attention", label: "Pay before the date" },
  { id: "open", label: "Still open" },
  { id: "paid", label: "Paid to RRA" },
];

function laneOf(row: DiaryRow, lane: Lane) {
  if (lane === "paid") return row.phase === "paid";
  if (lane === "open") return row.phase !== "paid";
  return row.attention;
}

function tone(phase: TaxPhase) {
  if (phase === "late") return "red";
  if (phase === "money_in" || phase === "due_soon" || phase === "records_due") return "amber";
  if (phase === "paid") return "green";
  if (phase === "awaiting_receipt" || phase === "declared") return "blue";
  return "neutral";
}

function advice(row: DiaryRow) {
  if (row.phase === "paid") return `RRA reference ${row.paymentRef}.`;
  if (row.phase === "late") {
    const held = row.moneyReceipt
      ? ` They already sent ${row.moneyAmount ? rwf(row.moneyAmount) : "the money"} on receipt ${row.moneyReceipt}. That is not a payment to RRA.`
      : "";
    return row.payRoute === "themselves"
      ? "The working day has passed and there is no RRA receipt. Ask for it today. A late payment can draw a fine."
      : `The working day has passed.${held} Pay RRA today and save the reference. A late payment can draw a fine.`;
  }
  if (row.phase === "money_in") return `They sent ${row.moneyAmount ? rwf(row.moneyAmount) : "the money"} on receipt ${row.moneyReceipt}. That is not a payment to RRA. Pay before ${prettyDate(row.workBy)} and save the RRA reference.`;
  if (row.phase === "awaiting_receipt") return "They pay RRA themselves. Inzira cannot see that account, so this stays open until you save their receipt reference.";
  if (row.phase === "declared") return "The declaration reference is saved. RRA is not paid until the payment reference is saved.";
  if (row.phase === "records_due") return `Ask for the records. File and pay by ${prettyDate(row.workBy)}, before the RRA date.`;
  if (row.phase === "due_soon") return `Pay before ${prettyDate(row.workBy)}. The RRA date is ${prettyDate(row.legalDue)}.`;
  return `RRA date ${prettyDate(row.legalDue)}. Our working day is ${prettyDate(row.workBy)}.`;
}

function FieldForm({ action, periodId, children, submit }: { action: (prev: Result, form: FormData) => Promise<Result>; periodId: string; children: ReactNode; submit: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="tax-form">
      <input type="hidden" name="periodId" value={periodId} />
      {children}
      <button className="c-btn c-btn-secondary c-btn-sm" type="submit" disabled={pending}>{pending ? "Saving" : submit}</button>
      {state && !state.ok && state.error && <span className="tax-err">{state.error}</span>}
    </form>
  );
}

export function TaxDiary({
  today, rows, clients, lane, clientId, canWrite,
}: {
  today: string;
  rows: DiaryRow[];
  clients: { id: string; name: string }[];
  lane: Lane;
  clientId?: string;
  canWrite: boolean;
}) {
  const [watchState, addWatch, watchPending] = useActionState(addTaxWatch, null);
  const [dateState, addDate, datePending] = useActionState(addTaxDate, null);
  const shown = rows.filter((r) => laneOf(r, lane));
  const attention = rows.filter((r) => r.attention);
  const lateRows = rows.filter((r) => r.phase === "late").sort((a, b) => a.workBy.localeCompare(b.workBy));
  const next = attention.filter((r) => r.days >= 0).sort((a, b) => a.workBy.localeCompare(b.workBy))[0];
  const late = lateRows.length;
  const money = rows.filter((r) => r.moneyReceipt && r.phase !== "paid").length;
  const waiting = rows.filter((r) => r.phase === "awaiting_receipt").length;
  const query = (next: Lane) => {
    const q = new URLSearchParams();
    q.set("lane", next);
    if (clientId) q.set("client", clientId);
    return `/console/taxes?${q}`;
  };

  return (
    <div className="stack g24">
      <div className="c-page-head">
        <div className="stack g4">
          <h1 className="console-page-title">Tax diary</h1>
          <p className="c-caption" style={{ fontSize: 14, maxWidth: 640 }}>
            Pay on the working day, which is the RRA date or the Friday before a weekend. A tax is paid here only when the RRA reference is saved. Money a client sent to Inzira is not that payment, and a client who pays RRA themselves stays open until their receipt is recorded.
          </p>
        </div>
      </div>

      <div className="tax-rail">
        <div className={`tax-hero ${late ? "is-late" : ""}`}>
          <span>{late ? "Past the working day" : next ? "Next working day" : "This week"}</span>
          <strong>{late ? String(late) : next ? prettyDate(next.workBy) : "Clear"}</strong>
          <p>{late
            ? `${lateRows[0].client} · ${lateRows[0].kindName} was due ${prettyDate(lateRows[0].workBy)}.${next ? ` Next open date is ${prettyDate(next.workBy)}.` : ""}`
            : next
              ? `${next.client} · ${next.kindName}. ${fullDate(next.workBy)}.`
              : "Nothing unpaid is inside the next 7 days."}</p>
        </div>
        <div className="tax-stat"><span>Past the working day</span><strong>{late}</strong></div>
        <div className="tax-stat"><span>Money in, RRA unpaid</span><strong>{money}</strong></div>
        <div className="tax-stat"><span>Their receipt missing</span><strong>{waiting}</strong></div>
      </div>

      <div className="row g8 wrapx" role="tablist" aria-label="Tax diary">
        {LANES.map((item) => (
          <Link key={item.id} href={query(item.id)} className={`c-btn c-btn-sm ${lane === item.id ? "c-btn-primary" : "c-btn-secondary"}`} aria-current={lane === item.id ? "page" : undefined}>
            {item.label}
            <span className="tax-count">{rows.filter((r) => laneOf(r, item.id)).length}</span>
          </Link>
        ))}
      </div>

      {clientId && (
        <p className="c-caption">Showing one client. <Link href={`/console/taxes?lane=${lane}`}>Show everyone</Link></p>
      )}

      {shown.length === 0 ? (
        <div className="console-panel c-empty">
          <Icon name="calendar" size={22} />
          <strong>{rows.length === 0 ? "No taxpayer is on the diary yet" : "Nothing in this list"}</strong>
          <span className="c-caption">{rows.length === 0 ? "Add the tax and who pays it. The dates follow the RRA service charter." : "The other lists may still have dates."}</span>
        </div>
      ) : (
        <ol className="tax-list">
          {shown.map((row) => (
            <li key={row.id} className={`tax-row is-${tone(row.phase)}`}>
              <div className="tax-when">
                <strong>{prettyDate(row.workBy)}</strong>
                <span>{row.days < 0 ? `${-row.days} day${row.days === -1 ? "" : "s"} past` : row.days === 0 ? "Today" : `${row.days} day${row.days === 1 ? "" : "s"} left`}</span>
              </div>
              <div className="stack g6">
                <div className="row g8 wrapx">
                  <strong>{row.kindName}</strong>
                  <span className="c-caption">{row.periodLabel}</span>
                  <span className={`c-badge c-badge-${tone(row.phase) === "neutral" ? "neutral" : tone(row.phase)}`}>{phaseLabel(row.phase)}</span>
                </div>
                <div className="row g8 wrapx">
                  <Link href={`/console/clients/${row.profileId}`}>{row.client}</Link>
                  <span className="c-caption">{row.payRoute === "through_us" ? "Pays through Inzira" : "Pays RRA themselves"}</span>
                  {row.amountDue ? <span className="c-caption">{rwf(row.amountDue)} assessed</span> : null}
                  {row.requestRef ? <Link className="c-mono-ref" href={`/console/requests/${row.requestRef}`}>{row.requestRef}</Link> : null}
                </div>
                <p className="tax-advice">{advice(row)}</p>
                {row.declarationRef && row.phase !== "paid" && <span className="c-caption">Declaration reference {row.declarationRef}</span>}
                {canWrite && row.phase !== "paid" && (
                  <div className="tax-actions">
                    {row.payRoute === "through_us" && !row.moneyReceipt && (
                      <FieldForm action={saveMoneyReceived} periodId={row.id} submit="Save the money they sent">
                        <input className="console-input" name="receipt" placeholder="Inzira receipt" aria-label="Inzira receipt" />
                        <input className="console-input" name="amount" inputMode="numeric" placeholder="Francs they sent" aria-label="Francs they sent" />
                      </FieldForm>
                    )}
                    {!row.declarationRef && (
                      <FieldForm action={saveDeclaration} periodId={row.id} submit="Save declaration reference">
                        <input className="console-input" name="ref" placeholder="RRA declaration reference" aria-label="RRA declaration reference" />
                        <input className="console-input" name="amount" inputMode="numeric" placeholder="Tax due, if known" aria-label="Tax due in francs" />
                      </FieldForm>
                    )}
                    <FieldForm action={saveRraPayment} periodId={row.id} submit="Mark paid to RRA">
                      <input className="console-input" name="ref" placeholder="RRA payment reference" aria-label="RRA payment reference" />
                    </FieldForm>
                    {!row.requestRef && (
                      <FieldForm action={saveRequestLink} periodId={row.id} submit="Link request">
                        <input className="console-input" name="ref" placeholder="INZ-2026-00000" aria-label="Request reference" />
                      </FieldForm>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
        <div className="tax-add">
          <form action={addWatch} className="stack g10">
            <h2 className="console-section-title">Watch a tax</h2>
            <label className="stack g4"><span className="c-caption">Taxpayer</span>
              <select className="console-select" name="profileId" required defaultValue={clientId ?? ""}>
                <option value="" disabled>Choose a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="stack g4"><span className="c-caption">Tax</span>
              <select className="console-select" name="kind" required defaultValue="paye-monthly">
                {TAX_KINDS.filter((k) => k.id !== "custom").map((k) => <option key={k.id} value={k.id}>{k.name} — {k.rhythm}</option>)}
              </select>
            </label>
            <fieldset className="stack g6">
              <legend className="c-caption">Who pays RRA</legend>
              <label className="row g8"><input type="radio" name="payRoute" value="through_us" defaultChecked /> They send the money to Inzira</label>
              <label className="row g8"><input type="radio" name="payRoute" value="themselves" /> They pay RRA themselves</label>
            </fieldset>
            <button className="c-btn c-btn-primary" type="submit" disabled={watchPending}>{watchPending ? "Adding" : "Add to the diary"}</button>
            {watchState && !watchState.ok && watchState.error && <span className="tax-err">{watchState.error}</span>}
          </form>
          <form action={addDate} className="stack g10">
            <h2 className="console-section-title">A date that is not on the charter</h2>
            <label className="stack g4"><span className="c-caption">Taxpayer</span>
              <select className="console-select" name="profileId" required defaultValue={clientId ?? ""}>
                <option value="" disabled>Choose a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="stack g4"><span className="c-caption">Name</span>
              <input className="console-input" name="label" required placeholder="Withholding tax, March" />
            </label>
            <label className="stack g4"><span className="c-caption">RRA date</span>
              <input className="console-input" name="legalDue" type="date" required />
            </label>
            <fieldset className="stack g6">
              <legend className="c-caption">Who pays RRA</legend>
              <label className="row g8"><input type="radio" name="payRoute" value="through_us" defaultChecked /> They send the money to Inzira</label>
              <label className="row g8"><input type="radio" name="payRoute" value="themselves" /> They pay RRA themselves</label>
            </fieldset>
            <button className="c-btn c-btn-secondary" type="submit" disabled={datePending}>{datePending ? "Adding" : "Add this date"}</button>
            {dateState && !dateState.ok && dateState.error && <span className="tax-err">{dateState.error}</span>}
          </form>
        </div>
      )}
      <p className="c-caption">Dates follow the RRA service charter. Inzira is not RRA and does not see a taxpayer’s account. Stopping a watch keeps dates already paid to RRA and drops the reminders for the rest.</p>
      {canWrite && rows.length > 0 && (
        <WatchList rows={rows} />
      )}
    </div>
  );
}

function StopWatch({ watchId }: { watchId: string }) {
  const [state, run, pending] = useActionState(async (_prev: Result, form: FormData) => stopTaxWatch(String(form.get("watchId") ?? "")), null);
  return (
    <form action={run}>
      <input type="hidden" name="watchId" value={watchId} />
      <button className="c-btn c-btn-ghost c-btn-sm" type="submit" disabled={pending}>{pending ? "Stopping" : "Stop"}</button>
      {state && !state.ok && state.error && <span className="tax-err">{state.error}</span>}
    </form>
  );
}

function WatchList({ rows }: { rows: DiaryRow[] }) {
  const watches = [...new Map(rows.filter((r) => r.active).map((r) => [r.watchId, r])).values()];
  if (!watches.length) return null;
  return (
    <details className="tax-stop">
      <summary>Stop watching a tax</summary>
      <ul className="stack g8" style={{ marginTop: 10 }}>
        {watches.map((row) => (
          <li key={row.watchId} className="row between g12 wrapx">
            <span>{row.client} · {row.kindName}</span>
            <StopWatch watchId={row.watchId} />
          </li>
        ))}
      </ul>
    </details>
  );
}
