import { billOfficial, billOurs, fmtDate, rwf } from "@/lib/format";
import { paidSplit } from "@/lib/status";
import { DISCLAIMER, SITE, isSet } from "@/lib/site";
import type { RequestView } from "@/lib/types";

export function Receipt({ r, locale = "en" }: { r: Pick<RequestView, "ref" | "name" | "profile" | "account" | "billing" | "openedAt">; locale?: "en" | "rw" }) {
  const paid = paidSplit(r.billing);
  const txs = r.billing.transactions.filter((t) => t.status === "paid" || t.status === "refunded");
  return (
    <article className="receipt">
      <header className="receipt-head">
        <strong>{SITE.legalName}</strong>
        <span>{SITE.city}{isSet(SITE.address) ? ` · ${SITE.address}` : ""}</span>
        {isSet(SITE.tin) && <span>TIN {SITE.tin}</span>}
        <span>{SITE.email}</span>
      </header>
      <h1>{locale === "rw" ? "Inyemezabuguzi" : "Receipt"}</h1>
      <p className="receipt-lead">{locale === "rw"
        ? "Iyi ni inyandiko y'Inzira y'icyo wishyuye. Amafaranga ya leta n'ayo twishyuza byanditswe ku mirongo itandukanye."
        : "Inzira’s record of what was paid. The official government fee and our assistance fee are always on separate lines."}</p>
      <dl className="receipt-meta">
        <div><dt>Reference</dt><dd>{r.ref}</dd></div>
        <div><dt>Invoice</dt><dd>{r.billing.invoice}</dd></div>
        <div><dt>Service</dt><dd>{r.name}</dd></div>
        <div><dt>Client</dt><dd>{r.profile.name}</dd></div>
        <div><dt>Opened</dt><dd>{fmtDate(r.openedAt, locale)}</dd></div>
      </dl>
      <table className="receipt-table">
        <thead><tr><th>Line</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Inzira assistance fee</td><td>{billOurs(r.billing)}</td></tr>
          <tr><td>Official government fee</td><td>{billOfficial(r.billing)}</td></tr>
        </tbody>
      </table>
      {txs.length > 0 && (
        <ul className="receipt-txs">
          {txs.map((t) => (
            <li key={t.receipt + t.at}>{t.status === "refunded" ? "Refunded" : "Paid"} {rwf(t.official + t.ours)} · {t.method} · {fmtDate(t.at, locale)} · {t.receipt}</li>
          ))}
        </ul>
      )}
      <p className="receipt-paid">Received by Inzira so far: {rwf(paid.ours)} our fee{paid.official ? ` · ${rwf(paid.official)} official` : ""}.</p>
      <p className="receipt-note">{DISCLAIMER}</p>
    </article>
  );
}
