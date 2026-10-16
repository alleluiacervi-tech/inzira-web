"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { SavedView } from "@/lib/types";

export type ColumnDef<T> = {
  id: string;
  header: string;
  accessor?: (row: T) => any;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string | number;
  hideable?: boolean;
  defaultVisible?: boolean;
  total?: (rows: T[]) => ReactNode;
};

export type FilterDef<T> = {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  filterFn: (row: T, value: string) => boolean;
  showInToolbar?: boolean;
};

export function DataTable<T extends { id?: string; ref?: string }>({
  data,
  columns,
  filters = [],
  savedViews = [],
  onSelectSavedView,
  onSaveCurrentView,
  onDeleteSavedView,
  canDeleteSavedView,
  searchPlaceholder = "Search...",
  searchFn,
  onRowClick,
  bulkActions,
  exportFileName = "export.csv",
  defaultPageSize = 25,
  compactDefault = false,
  emptyMessage = "No records found",
  emptySubtitle = "Try adjusting your search or filters.",
  initialFilters,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  filters?: FilterDef<T>[];
  savedViews?: SavedView[];
  onSelectSavedView?: (view: SavedView) => void;
  onSaveCurrentView?: (name: string, filters: Record<string, string>, visibleColumns: string[]) => Promise<void> | void;
  onDeleteSavedView?: (id: string) => Promise<void> | void;
  /** Shared views (no owner) are deleted only when this returns true. */
  canDeleteSavedView?: (view: SavedView) => boolean;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  onRowClick?: (row: T) => void;
  bulkActions?: (selectedRows: T[], clearSelection: () => void) => ReactNode;
  exportFileName?: string;
  defaultPageSize?: number;
  compactDefault?: boolean;
  emptyMessage?: string;
  emptySubtitle?: string;
  /** Filters to start with, by filter id. Unknown ids and values are ignored. */
  initialFilters?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialFilters ?? {}).filter(([id, v]) => filters.some((f) => f.id === id && f.options.some((o) => o.value === v)))));
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [compact, setCompact] = useState(compactDefault);
  const [colChooserOpen, setColChooserOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [pickedView, setPickedView] = useState("");

  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(columns.filter((c) => c.defaultVisible !== false).map((c) => c.id))
  );

  const getRowId = (row: T, idx: number) => row.id || row.ref || String(idx);

  // Filter & Search
  const filteredData = useMemo(() => {
    let list = data;
    const term = q.trim().toLowerCase();
    if (term) {
      if (searchFn) {
        list = list.filter((r) => searchFn(r, term));
      } else {
        list = list.filter((r) =>
          columns.some((col) => {
            const val = col.accessor ? col.accessor(r) : (r as any)[col.id];
            return String(val ?? "").toLowerCase().includes(term);
          })
        );
      }
    }

    for (const [filterId, filterVal] of Object.entries(activeFilters)) {
      if (!filterVal || filterVal === "all") continue;
      const fDef = filters.find((f) => f.id === filterId);
      if (fDef) {
        list = list.filter((r) => fDef.filterFn(r, filterVal));
      }
    }

    return list;
  }, [data, q, activeFilters, columns, filters, searchFn]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortCol) return filteredData;
    const colDef = columns.find((c) => c.id === sortCol);
    if (!colDef) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = colDef.accessor ? colDef.accessor(a) : (a as any)[sortCol];
      const bVal = colDef.accessor ? colDef.accessor(b) : (b as any)[sortCol];

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }

      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [filteredData, sortCol, sortDir, columns]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Selection
  const allPageSelected = pagedData.length > 0 && pagedData.every((r, i) => selectedIds.has(getRowId(r, i)));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allPageSelected) {
      for (const [i, r] of pagedData.entries()) next.delete(getRowId(r, i));
    } else {
      for (const [i, r] of pagedData.entries()) next.add(getRowId(r, i));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedRowObjects = useMemo(() => {
    return data.filter((r, i) => selectedIds.has(getRowId(r, i)));
  }, [data, selectedIds]);

  // CSV Export
  const exportCsv = () => {
    const activeColumns = columns.filter((c) => visibleCols.has(c.id));
    const headerRow = activeColumns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(",");
    const rows = sortedData.map((r) => {
      return activeColumns
        .map((c) => {
          const val = c.accessor ? c.accessor(r) : (r as any)[c.id];
          return `"${String(val ?? "").replace(/"/g, '""')}"`;
        })
        .join(",");
    });
    const csvContent = [headerRow, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", exportFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const displayedColumns = columns.filter((c) => visibleCols.has(c.id));

  return (
    <div className="stack g12" style={{ width: "100%" }}>
      {/* Controls Bar: Saved Views, Search, Filters, Tools */}
      <div className="row between g12 wrapx">
        <div className="row g8 wrapx">
          {savedViews.length > 0 && (
            <select
              className="console-select"
              style={{ fontSize: 13, height: 34 }}
              key={savedViews.map((sv) => sv.id).join("|")}
              onChange={(e) => {
                setPickedView(e.target.value);
                const sv = savedViews.find((v) => v.id === e.target.value);
                if (sv) {
                  if (sv.filters) setActiveFilters(sv.filters as Record<string, string>);
                  if (sv.columns) setVisibleCols(new Set(sv.columns));
                  onSelectSavedView?.(sv);
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Saved views ({savedViews.length})</option>
              {savedViews.map((sv) => (
                <option key={sv.id} value={sv.id}>{sv.name}</option>
              ))}
            </select>
          )}
          {onDeleteSavedView && savedViews.some((sv) => sv.id === pickedView && (canDeleteSavedView ? canDeleteSavedView(sv) : !!sv.staffId)) && (
            <button
              type="button"
              className="c-btn c-btn-ghost c-btn-sm"
              onClick={async () => {
                const view = savedViews.find((sv) => sv.id === pickedView);
                if (!view || !window.confirm(`Delete the saved view “${view.name}”?`)) return;
                await onDeleteSavedView(view.id);
                setPickedView("");
              }}
            >
              Delete view
            </button>
          )}

          <div
            className="row g8 console-panel"
            style={{ padding: "0 10px", height: 34, width: 240, maxWidth: "100%", background: "var(--c-surface)" }}
          >
            <Icon name="search" size={15} color="var(--c-text-subtle)" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              style={{ border: 0, outline: 0, fontSize: 13, width: "100%", background: "transparent" }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                style={{ border: 0, background: "none", cursor: "pointer", color: "var(--c-text-subtle)" }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>

          {filters.filter((f) => f.showInToolbar !== false).map((f) => (
            <select
              key={f.id}
              className="console-select"
              style={{ fontSize: 13, height: 34 }}
              value={activeFilters[f.id] || "all"}
              onChange={(e) => {
                setActiveFilters({ ...activeFilters, [f.id]: e.target.value });
                setPage(1);
              }}
            >
              <option value="all">{f.label}: All</option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ))}

          {/* Filters without a menu of their own (set by a link or a saved view) show as removable chips. */}
          {filters.filter((f) => f.showInToolbar === false && activeFilters[f.id] && activeFilters[f.id] !== "all").map((f) => (
            <button
              key={f.id}
              type="button"
              className="c-chip"
              aria-pressed="true"
              aria-label={`Remove filter ${f.label}: ${f.options.find((o) => o.value === activeFilters[f.id])?.label ?? activeFilters[f.id]}`}
              onClick={() => { const { [f.id]: _gone, ...rest } = activeFilters; setActiveFilters(rest); setPage(1); }}
            >
              {f.label}: {f.options.find((o) => o.value === activeFilters[f.id])?.label ?? activeFilters[f.id]}
              <Icon name="x" size={12} />
            </button>
          ))}

          {Object.values(activeFilters).some((v) => v && v !== "all") && (
            <button
              type="button"
              className="c-btn c-btn-ghost c-btn-sm"
              onClick={() => { setActiveFilters({}); setQ(""); }}
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="row g6 wrapx">
          <button
            type="button"
            className="c-btn c-btn-secondary c-btn-sm"
            onClick={() => setCompact(!compact)}
            title="Toggle compact row height"
          >
            <Icon name="list" size={14} />
            <span>{compact ? "Normal" : "Compact"}</span>
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm"
              onClick={() => setColChooserOpen(!colChooserOpen)}
            >
              <Icon name="grid" size={14} />
              <span>Columns</span>
            </button>
            {colChooserOpen && (
              <div
                className="console-panel stack g8"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  zIndex: 30,
                  padding: 12,
                  width: 200,
                  boxShadow: "var(--shadow-pop)",
                }}
              >
                <div className="row between" style={{ paddingBottom: 6, borderBottom: "1px solid var(--c-border)" }}>
                  <strong style={{ fontSize: 12 }}>Visible columns</strong>
                  <button
                    type="button"
                    className="linkish"
                    style={{ fontSize: 11 }}
                    onClick={() => setColChooserOpen(false)}
                  >
                    Done
                  </button>
                </div>
                {columns.map((c) => (
                  <label key={c.id} className="row g8" style={{ fontSize: 12.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={visibleCols.has(c.id)}
                      disabled={c.hideable === false}
                      onChange={(e) => {
                        const next = new Set(visibleCols);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setVisibleCols(next);
                      }}
                    />
                    <span>{c.header}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="c-btn c-btn-secondary c-btn-sm"
            onClick={exportCsv}
            title="Export CSV"
          >
            <Icon name="download" size={14} />
            <span>Export</span>
          </button>

          {onSaveCurrentView && (
            <button
              type="button"
              className="c-btn c-btn-ghost c-btn-sm"
              onClick={() => setSaveViewOpen(true)}
              title="Save this view"
            >
              <Icon name="bookmark" size={14} />
              <span>Save view</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar (if rows selected) */}
      {someSelected && bulkActions && (
        <div
          className="row between g12"
          style={{
            background: "var(--c-ember-bg)",
            border: "1px solid var(--c-ember-border)",
            borderRadius: "var(--c-radius)",
            padding: "8px 16px",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-ember)" }}>
            {selectedIds.size} {selectedIds.size === 1 ? "row" : "rows"} selected
          </span>
          <div className="row g8">
            {bulkActions(selectedRowObjects, clearSelection)}
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container: scrolls inside itself so the header row can stay in view */}
      <div className="console-table-container c-table-scroll">
        <table className={`console-table c-cards ${compact ? "compact" : ""}`}>
          <thead>
            <tr>
              {bulkActions && (
                <th style={{ width: 36, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all rows on current page"
                  />
                </th>
              )}
              {displayedColumns.map((col) => {
                const isSorted = sortCol === col.id;
                return (
                  <th
                    key={col.id}
                    className={col.align === "right" ? "num" : ""}
                    style={{
                      width: col.width,
                      cursor: col.sortable !== false ? "pointer" : "default",
                      userSelect: "none",
                    }}
                    onClick={() => {
                      if (col.sortable === false) return;
                      if (sortCol === col.id) {
                        if (sortDir === "asc") setSortDir("desc");
                        else { setSortCol(null); setSortDir("asc"); }
                      } else {
                        setSortCol(col.id);
                        setSortDir("asc");
                      }
                    }}
                  >
                    <div
                      className="row g4"
                      style={{
                        justifyContent: col.align === "right" ? "flex-end" : "flex-start",
                      }}
                    >
                      <span>{col.header}</span>
                      {col.sortable !== false && isSorted && (
                        <span style={{ color: "var(--c-ember)" }}>
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedData.map((row, i) => {
              const rowId = getRowId(row, i);
              const isSelected = selectedIds.has(rowId);
              return (
                <tr
                  key={rowId}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    cursor: onRowClick ? "pointer" : "default",
                    background: isSelected ? "var(--c-ember-bg)" : undefined,
                  }}
                >
                  {bulkActions && (
                    <td
                      className="c-td-select"
                      style={{ width: 36, textAlign: "center" }}
                      onClick={(e) => toggleSelectRow(rowId, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Select row ${rowId}`}
                      />
                    </td>
                  )}
                  {displayedColumns.map((col) => {
                    const content = col.cell
                      ? col.cell(row)
                      : col.accessor
                      ? col.accessor(row)
                      : (row as any)[col.id];
                    return (
                      <td
                        key={col.id}
                        className={col.align === "right" ? "num" : ""}
                        data-label={col.header}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {pagedData.length === 0 && (
              <tr>
                <td
                  colSpan={displayedColumns.length + (bulkActions ? 1 : 0)}
                  style={{ padding: "48px 16px", textAlign: "center" }}
                >
                  <div className="stack g6" style={{ alignItems: "center" }}>
                    <strong style={{ fontSize: 14, color: "var(--c-text)" }}>{emptyMessage}</strong>
                    <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>{emptySubtitle}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {/* Totals Row (if any column specifies a total) */}
          {displayedColumns.some((c) => c.total) && (
            <tfoot>
              <tr style={{ background: "var(--c-bg)", fontWeight: 700, borderTop: "2px solid var(--c-border)" }}>
                {bulkActions && <td className="c-td-select" />}
                {displayedColumns.map((col) => (
                  <td key={col.id} className={col.align === "right" ? "num" : ""} data-label={col.total ? `Total ${col.header.toLowerCase()}` : undefined}>
                    {col.total ? col.total(sortedData) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="row between g12" style={{ padding: "4px 0", fontSize: 12.5, color: "var(--c-text-muted)" }}>
        <span>
          Showing {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
          {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} entries
          {data.length !== sortedData.length && ` (filtered from ${data.length})`}
        </span>
        <div className="row g8">
          <label className="row g4">
            <span>Rows:</span>
            <select
              className="console-select"
              style={{ height: 26, fontSize: 12, padding: "0 4px" }}
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div className="row g4">
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm c-btn-icon"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Previous page"
            >
              <Icon name="left" size={14} />
            </button>
            <span style={{ padding: "0 6px", fontWeight: 600 }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm c-btn-icon"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Next page"
            >
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Save View Modal */}
      {saveViewOpen && onSaveCurrentView && (
        <div className="console-dialog-overlay" onClick={() => setSaveViewOpen(false)}>
          <div className="console-dialog stack g14" onClick={(e) => e.stopPropagation()} style={{ padding: 18 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Save current view</h3>
            <div className="console-form-group">
              <label className="console-label">View name</label>
              <input
                className="console-input"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="e.g. Urgent Taxes"
                autoFocus
              />
            </div>
            <div className="row g8" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="c-btn c-btn-secondary"
                onClick={() => setSaveViewOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="c-btn c-btn-primary"
                disabled={!newViewName.trim()}
                onClick={async () => {
                  await onSaveCurrentView(newViewName.trim(), activeFilters, Array.from(visibleCols));
                  setSaveViewOpen(false);
                  setNewViewName("");
                }}
              >
                Save view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
