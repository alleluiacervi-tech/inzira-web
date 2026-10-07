"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/app/actions/console";
import { Icon } from "@/components/ui";

export function AddClientModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (profileId: string, name: string) => void;
}) {
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"person" | "business" | "organization">("person");
  const [district, setDistrict] = useState("Gasabo");
  const [nationalId, setNationalId] = useState("");
  const [tin, setTin] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Enter client full name."); return; }
    if (!phone.trim()) { setError("Enter phone number."); return; }

    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);

    start(async () => {
      setError("");
      const res = await createClient({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        kind,
        district: district.trim() || undefined,
        nationalId: nationalId.trim() || undefined,
        tin: tin.trim() || undefined,
        tags: tags.length ? tags : undefined,
        notes: notes.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      onSuccess?.(res.profileId, name.trim());
      onClose();
    });
  };

  return (
    <div className="console-dialog-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Add New Client">
      <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
        <div className="console-panel-header">
          <div className="stack" style={{ gap: 2 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Add new client</h3>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
              Create a client account and profile in the directory.
            </span>
          </div>
          <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" onClick={onClose} disabled={busy}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="console-panel-body stack g12">
            {error && (
              <div style={{ background: "var(--c-red-bg)", border: "1px solid var(--c-red-border)", padding: "8px 12px", borderRadius: 4, color: "var(--c-red)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="console-form-group">
                <label className="console-label">Full name / Entity name *</label>
                <input
                  className="console-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Marie Kagame"
                  required
                  disabled={busy}
                />
              </div>

              <div className="console-form-group">
                <label className="console-label">Client type *</label>
                <select
                  className="console-select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                  disabled={busy}
                >
                  <option value="person">Individual (Person)</option>
                  <option value="business">Business (Company)</option>
                  <option value="organization">Organization (Co-op/NGO)</option>
                </select>
              </div>
            </div>

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="console-form-group">
                <label className="console-label">Phone number (login) *</label>
                <input
                  className="console-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0788 123 456"
                  required
                  disabled={busy}
                />
              </div>
              <div className="console-form-group">
                <label className="console-label">Email (codes and updates)</label>
                <input
                  className="console-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marie@example.com"
                  disabled={busy}
                />
              </div>

              <div className="console-form-group">
                <label className="console-label">District</label>
                <input
                  className="console-input"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Gasabo · Remera"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="console-form-group">
                <label className="console-label">National ID (16 digits)</label>
                <input
                  className="console-input"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="1 1995 8 0045123 0 17"
                  disabled={busy}
                />
              </div>

              <div className="console-form-group">
                <label className="console-label">TIN (Tax ID - 9 digits)</label>
                <input
                  className="console-input"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="109876543"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="console-form-group">
              <label className="console-label">Tags (comma separated)</label>
              <input
                className="console-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="VIP, Corporate, Urgent"
                disabled={busy}
              />
            </div>

            <div className="console-form-group">
              <label className="console-label">Initial note (internal)</label>
              <textarea
                className="console-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about preferences or context..."
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
            <button type="submit" className="c-btn c-btn-primary" disabled={busy}>
              {busy ? "Saving client..." : "Create client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
