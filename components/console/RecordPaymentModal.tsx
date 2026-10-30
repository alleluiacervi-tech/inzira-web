"use client";
import { useDialog } from "@/components/useDialog";
import { withStepUp } from "./StepUp";
import { useEffect, useId, useState, useTransition } from "react";
import { recordManualPayment } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { rwf } from "@/lib/format";
import type { PayMethod } from "@/lib/types";

export function RecordPaymentModal({
  open,
  onClose,
  prefilledRef = "",
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  prefilledRef?: string;
  onSuccess?: (msg: string) => void;
}) {
  const formId = useId();
  const [busy, start] = useTransition();
  const [ref, setRef] = useState(prefilledRef);
  const [method, setMethod] = useState<PayMethod>("Cash");
  const [official, setOfficial] = useState("");
  const [ours, setOurs] = useState("");
  const [receipt, setReceipt] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRef(prefilledRef);
      setMethod("Cash");
      setOfficial("");
      setOurs("");
      setReceipt(`REC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`);
      setPayer("");
      setNotes("");
      setError("");
    }
  }, [open, prefilledRef]);

  const dialog = useDialog<HTMLDivElement>(open, () => { if (!busy) onClose(); });

  if (!open) return null;

  const officialVal = Number(official) || 0;
  const oursVal = Number(ours) || 0;
  const totalVal = officialVal + oursVal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim()) { setError("Enter a request reference (e.g. INZ-2026-04817)"); return; }
    if (!receipt.trim()) { setError("Enter receipt/reference number."); return; }
    if (![officialVal, oursVal].every((v) => Number.isSafeInteger(v) && v >= 0)) { setError("Enter whole, non-negative amounts in RWF."); return; }
    if (totalVal <= 0) { setError("Total amount must be greater than 0."); return; }

    start(async () => {
      setError("");
      const res = await withStepUp(() => recordManualPayment({
        ref: ref.trim(),
        method,
        official: officialVal,
        ours: oursVal,
        receipt: receipt.trim(),
        payer: payer.trim() || undefined,
        notes: notes.trim() || undefined,
      })).catch(() => ({ ok: false as const, error: "The record could not be confirmed. Check the request history before trying again." }));

      if (!res.ok) {
        setError(res.error);
        return;
      }

      onSuccess?.(`Payment of ${rwf(totalVal)} recorded successfully.`);
      onClose();
    });
  };

  return (
    <div ref={dialog} className="console-dialog-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Record Payment by Hand">
      <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
        <div className="console-panel-header">
          <div className="stack" style={{ gap: 2 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Record payment by hand</h3>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
              Record a payment already received outside this website. This does not collect or transfer money.
            </span>
          </div>
          <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" onClick={onClose} disabled={busy} aria-label="Close dialog">
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="console-panel-body stack g14">
            {error && (
              <div role="alert" style={{ background: "var(--c-red-bg)", border: "1px solid var(--c-red-border)", padding: "8px 12px", borderRadius: 4, color: "var(--c-red)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="console-form-group">
              <label className="console-label" htmlFor={`${formId}-1`}>Request reference (e.g. INZ-2026-04817) *</label>
              <input id={`${formId}-1`}
                className="console-input tabular-nums"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                placeholder="INZ-2026-XXXXX"
                required
                disabled={busy}
              />
            </div>

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="console-form-group">
                <label className="console-label" htmlFor={`${formId}-2`}>Payment method *</label>
                <select id={`${formId}-2`}
                  className="console-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PayMethod)}
                  disabled={busy}
                >
                  <option value="Cash">Cash (at desk)</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="MTN MoMo">MTN MoMo (manual)</option>
                  <option value="Airtel Money">Airtel Money (manual)</option>
                  <option value="Card">Card POS</option>
                </select>
              </div>

              <div className="console-form-group">
                <label className="console-label" htmlFor={`${formId}-3`}>Receipt / Transaction ref *</label>
                <input id={`${formId}-3`}
                  className="console-input"
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value)}
                  placeholder="Receipt / slip number"
                  required
                  disabled={busy}
                />
              </div>
            </div>

            {/* Two separate fee lines */}
            <div className="stack g10 console-panel" style={{ padding: 14, background: "var(--c-bg)" }}>
              <strong style={{ fontSize: 13 }}>Two-line breakdown (RWF)</strong>
              
              <div className="row between g12">
                <label className="row g6" htmlFor={`${formId}-official`} style={{ fontSize: 13 }}>
                  <span className="c-fee-tag-official">Official</span>
                  <span>Government fee</span>
                </label>
                <input id={`${formId}-official`}
                  className="console-input tabular-nums"
                  style={{ width: 140, textAlign: "right" }}
                  inputMode="numeric"
                  value={official}
                  onChange={(e) => setOfficial(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </div>

              <div className="row between g12">
                <label className="row g6" htmlFor={`${formId}-ours`} style={{ fontSize: 13 }}>
                  <span className="c-fee-tag-ours">Inzira</span>
                  <span>Assistance fee</span>
                </label>
                <input id={`${formId}-ours`}
                  className="console-input tabular-nums"
                  style={{ width: 140, textAlign: "right" }}
                  inputMode="numeric"
                  value={ours}
                  onChange={(e) => setOurs(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </div>

              <div className="row between g12" style={{ paddingTop: 8, borderTop: "1px solid var(--c-border)" }}>
                <strong>Total received</strong>
                <strong className="tabular-nums" style={{ fontSize: 16, color: "var(--c-ember)" }}>
                  {rwf(totalVal)}
                </strong>
              </div>
            </div>

            <div className="console-form-group">
              <label className="console-label" htmlFor={`${formId}-4`}>Payer name / phone (optional)</label>
              <input id={`${formId}-4`}
                className="console-input"
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                placeholder="e.g. Eric (client's accountant) / 0788123456"
                disabled={busy}
              />
            </div>
          </div>

          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--c-border)",
              background: "var(--c-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button type="button" className="c-btn c-btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="c-btn c-btn-primary" disabled={busy || totalVal <= 0}>
              {busy ? "Saving payment..." : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
