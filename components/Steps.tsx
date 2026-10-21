/** The progress bar at the top of the request form and its checkout: one segment per step, done ones filled.
 *  Step names show on wide screens; `caption` ("Step 3 of 3 · Pay") stands in for them on a phone. */
export function Steps({ names, current, label, caption }: { names: string[]; current: number; label: string; caption?: string }) {
  const bar = (
    <div className="row g8" role="img" aria-label={label}>
      {names.map((name, i) => (
        <div key={name} className="stack g6 grow">
          <span style={{ height: 4, borderRadius: 2, background: i <= current ? "var(--ember)" : "var(--sand)" }} />
          <span className="m-hide" style={{ fontSize: 12.5, fontWeight: 700, color: i === current ? "var(--ink)" : "var(--muted)" }}>{i + 1}. {name}</span>
        </div>
      ))}
    </div>
  );
  return caption ? <div className="stack g12">{bar}<span className="eb d-hide" style={{ fontSize: 11 }} aria-hidden="true">{caption}</span></div> : bar;
}
