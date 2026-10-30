"use client";
import Image from "next/image";

import { useState } from "react";
import Link from "next/link";

export type FilingOffice = {
  code: string;
  /** Full institution name, used as the link's accessible name. */
  name: string;
  href: string;
  /** The institution's own mark. Null when we must not invent one. */
  mark: string | null;
  /** Short visible words. Null when the mark already spells the name. */
  label: string | null;
};

/**
 * A slow rail of the offices a request is sent to. The marks name the destination.
 * They are not a partner row: the sentence above and the line under say so,
 * and each mark links to the services we file there.
 */
export function FilingRail({
  offices,
  label,
  note,
  pause,
  play,
}: {
  offices: FilingOffice[];
  label: string;
  note: string;
  pause: string;
  play: string;
}) {
  const [paused, setPaused] = useState(false);
  const cells = [...offices, ...offices];
  return (
    <div className={`filed${paused ? " is-paused" : ""}`}>
      <div className="filed-head">
        <p className="filed-label" id="filed-label">{label}</p>
        <button
          type="button"
          className="filed-pause"
          aria-pressed={paused}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? play : pause}
        </button>
      </div>
      <div className="filed-viewport">
        <ul className="filed-track">
          {cells.map((o, i) => {
            const clone = i >= offices.length;
            return (
              <li key={`${o.code}-${i}`} {...(clone ? { "data-clone": "", "aria-hidden": true, inert: true } : {})}>
                <Link href={o.href} aria-label={clone ? undefined : o.name} tabIndex={clone ? -1 : undefined}>
                  {o.mark && <Image src={o.mark} alt="" width={156} height={32} />}
                  {o.label && <span className={o.mark ? "filed-code" : "filed-word"}>{o.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="filed-note">{note}</p>
    </div>
  );
}
