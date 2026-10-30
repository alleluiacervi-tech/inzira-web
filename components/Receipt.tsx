import { billOfficial, billOurs, fmtDate, rwf } from "@/lib/format";
import { text } from "@/lib/i18n/messages";
import { phrase } from "@/lib/i18n/present";
import { paidSplit } from "@/lib/status";
import { DISCLAIMER, SITE, isSet } from "@/lib/site";
import type { RequestView } from "@/lib/types";

export function Receipt({ r, locale = "en" }: { r: Pick<RequestView, "ref" | "name" | "profile" | "account" | "billing" | "openedAt">; locale?: "en" | "rw" }) {
  const t = (key: string) => text(locale, `receipt.${key}`);
  const paid = paidSplit(r.billing);
  const txs = r.billing.transactions.filter((t) => t.status === "paid" || t.status === "refunded");
  const test = txs.some((t) => t.providerRef?.startsWith("sim:"));
  return (
    <article className="receipt">
      <header className="receipt-head">
        <strong>{SITE.legalName}</strong>
        <span>{SITE.city}{isSet(SITE.address) ? ` · ${SITE.address}` : ""}</span>
        {isSet(SITE.tin) && <span>TIN {SITE.tin}</span>}
        <span>{SITE.email}</span>
      </header>
      <h1>{t("title")}</h1>
      {test && <p className="receipt-test">{t("test")}</p>}
      <p className="receipt-lead">{t("lead")}</p>
      <dl className="receipt-meta">
        <div><dt>{t("reference")}</dt><dd>{r.ref}</dd></div>
        <div><dt>{t("invoice")}</dt><dd>{r.billing.invoice}</dd></div>
        <div><dt>{t("service")}</dt><dd>{r.name}</dd></div>
        <div><dt>{t("client")}</dt><dd>{r.profile.name}</dd></div>
        <div><dt>{t("opened")}</dt><dd>{fmtDate(r.openedAt, locale)}</dd></div>
      </dl>
      <table className="receipt-table">
        <thead><tr><th>{t("line")}</th><th>{t("amount")}</th></tr></thead>
        <tbody>
          <tr><td>{t("assistance")}</td><td>{phrase(locale, billOurs(r.billing))}</td></tr>
          <tr><td>{t("official")}</td><td>{phrase(locale, billOfficial(r.billing))}</td></tr>
        </tbody>
      </table>
      {txs.length > 0 && (
        <ul className="receipt-txs">
          {txs.map((t) => (
            <li key={t.receipt + t.at}>{t.providerRef?.startsWith("sim:") && <strong>{text(locale, "receipt.testTransaction")}: </strong>}{t.status === "refunded" ? text(locale, "receipt.refunded") : text(locale, "receipt.paid")} {rwf(t.official + t.ours)} · {t.method} · {fmtDate(t.at, locale)} · {t.receipt}</li>
          ))}
        </ul>
      )}
      <p className="receipt-paid">{t("received")}: {rwf(paid.ours)} {t("ourFee")}{paid.official ? ` · ${rwf(paid.official)} ${t("officialFee")}` : ""}.</p>
      <p className="receipt-note">{DISCLAIMER}</p>
    </article>
  );
}
