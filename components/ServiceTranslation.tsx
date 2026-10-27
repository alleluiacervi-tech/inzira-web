"use client";
import { pathInService, serviceFields, type ServiceRw, type ServiceText } from "@/lib/service-text";
import { Badge } from "./ui";

const rowsFor = (text: string, long: boolean) => Math.min(long ? 10 : 4, Math.max(long ? 3 : 1, Math.ceil(text.length / 56) + text.split("\n").length - 1));

/** How many lines of a service still have no Kinyarwanda. */
export const untranslated = (service: ServiceText, rw: ServiceRw) => serviceFields(service).filter((f) => !(rw[pathInService(f)] ?? "").trim()).length;

/**
 * Every line of a service, the English beside a box for the Kinyarwanda. A line of English added or removed on the other tab
 * is added or removed here too, and a removed item takes its Kinyarwanda with it (lib/service-text.ts shiftList).
 */
export default function ServiceTranslation({ service, rw, onChange, state }: { service: ServiceText; rw: ServiceRw | null; onChange: (path: string, text: string) => void; state: "loading" | "ready" | "failed" }) {
  if (state === "loading") return <div className="stack g12" aria-busy="true" aria-label="Loading the Kinyarwanda"><span className="skel" style={{ width: "40%", height: 14 }} /><span className="skel" style={{ width: "100%", height: 56 }} /><span className="skel" style={{ width: "100%", height: 56 }} /></div>;
  if (state === "failed" || !rw) return <div className="alert t-warn" role="alert"><div className="alert-body"><strong>The Kinyarwanda could not be loaded</strong><span>Close this panel and open the service again. You can still save the English: the Kinyarwanda stays as it is.</span></div></div>;
  const fields = serviceFields(service);
  const missing = untranslated(service, rw);
  return (
    <div className="stack g14 cx">
      <p className="hint" role="status">
        {missing === 0 ? "Every line has Kinyarwanda." : `${missing} of ${fields.length} lines have no Kinyarwanda yet. Customers read the English there.`} Saved with the service.
      </p>
      <ol className="cx-list">
        {fields.map((f) => {
          const path = pathInService(f);
          const text = rw[path] ?? "";
          const id = `tr-${path.replace(/[^a-z0-9]+/gi, "-")}`;
          return (
            <li key={path} className="cx-row">
              <div className="cx-head"><label htmlFor={id} className="cx-label">{f.label}</label>{!text.trim() && <Badge tone="warn" label="Not translated" />}</div>
              <p className="cx-en" lang="en"><span className="cx-lang">EN</span>{f.en}</p>
              <textarea id={id} className="in" lang="rw" spellCheck={false} rows={rowsFor(text || f.en, f.long)} value={text} onChange={(e) => onChange(path, e.target.value)} placeholder="Write the Kinyarwanda here" />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
