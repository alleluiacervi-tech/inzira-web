"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

type SearchResult = {
  requests: { ref: string; name: string; client: string; stage: string }[];
  clients: { id: string; name: string; phone: string; kind: string }[];
  services: { slug: string; name: string; category: string }[];
};

export function GlobalSearch({
  open,
  onClose,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (q: string) => Promise<SearchResult>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult>({ requests: [], clients: [], services: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults({ requests: [], clients: [], services: [] });
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    setActive(0);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ requests: [], clients: [], services: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await onSearch(q);
        setResults(res);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q, onSearch]);

  if (!open) return null;

  const hits = [
    ...results.requests.map((r) => ({ key: r.ref, href: `/console/requests/${r.ref}` })),
    ...results.clients.map((c) => ({ key: c.id, href: `/console/clients/${c.id}` })),
    ...results.services.map((s) => ({ key: s.slug, href: `/services/${s.slug}` })),
  ];
  const totalResults = hits.length;
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (hits.length ? (i + 1) % hits.length : 0)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0)); }
    if (e.key === "Enter" && hits[active]) { e.preventDefault(); onClose(); window.location.href = hits[active].href; }
  };
  const rowClass = (href: string) => `row between g10 console-nav-item${hits[active]?.href === href ? " is-search-active" : ""}`;

  return (
    <div className="console-dialog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Global Search">
      <div
        className="console-dialog stack"
        style={{ maxWidth: 580, maxHeight: "80vh", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="row g10" style={{ padding: "14px 18px", borderBottom: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
          <Icon name="search" size={18} color="var(--c-text-muted)" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search requests, clients, services... (ESC to close)"
            style={{ border: 0, outline: 0, fontSize: 15, width: "100%", background: "transparent" }}
          />
          {loading && <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Searching...</span>}
        </div>

        {/* Results List */}
        <div className="stack g12 grow" style={{ overflowY: "auto", padding: "14px 18px", maxHeight: "calc(80vh - 60px)" }}>
          {q && !loading && totalResults === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--c-text-muted)" }}>
              No results found for “{q}”
            </div>
          )}

          {!q && (
            <div style={{ fontSize: 13, color: "var(--c-text-muted)", padding: "12px 0" }}>
              Type a reference (e.g. <code>INZ-2026-04817</code>), a client name, phone number, or a service name.
            </div>
          )}

          {/* Requests Results */}
          {results.requests.length > 0 && (
            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Requests</span>
              {results.requests.map((r) => (
                <Link
                  key={r.ref}
                  href={`/console/requests/${r.ref}`}
                  onClick={onClose}
                  className={rowClass(`/console/requests/${r.ref}`)}
                  style={{ margin: 0, padding: "8px 12px", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div className="stack" style={{ gap: 2 }}>
                    <div className="row g8">
                      <span className="c-mono-ref">{r.ref}</span>
                      <strong style={{ fontSize: 13.5 }}>{r.name}</strong>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{r.client}</span>
                  </div>
                  <span className="c-badge c-badge-neutral">{r.stage}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Clients Results */}
          {results.clients.length > 0 && (
            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Clients</span>
              {results.clients.map((c) => (
                <Link
                  key={c.id}
                  href={`/console/clients/${c.id}`}
                  onClick={onClose}
                  className={rowClass(`/console/clients/${c.id}`)}
                  style={{ margin: 0, padding: "8px 12px", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div className="stack" style={{ gap: 2 }}>
                    <strong style={{ fontSize: 13.5 }}>{c.name}</strong>
                    <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{c.phone} · {c.kind}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--c-ember)" }}>View profile →</span>
                </Link>
              ))}
            </div>
          )}

          {/* Services Results */}
          {results.services.length > 0 && (
            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Catalogue Services</span>
              {results.services.map((s) => (
                <Link
                  key={s.slug}
                  href={`/services/${s.slug}`}
                  onClick={onClose}
                  className={rowClass(`/services/${s.slug}`)}
                  style={{ margin: 0, padding: "8px 12px", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <strong style={{ fontSize: 13.5 }}>{s.name}</strong>
                  <span className="c-badge c-badge-ember">{s.category}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
