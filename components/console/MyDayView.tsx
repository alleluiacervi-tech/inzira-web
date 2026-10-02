"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import type { Permission, RequestView, Staff } from "@/lib/types";
import { RequestStatusBadge } from "./StatusBadge";
import { SidePanel } from "./SidePanel";

export interface MyDayData {
  todayFollowUps: RequestView[];
  slaCases: Array<{
    case: RequestView;
    hoursElapsed: number;
    targetHours: number;
    breached: boolean;
  }>;
  clientReplies: RequestView[];
  pendingDocs: Array<{
    case: RequestView;
    doc: { id: string; name: string; status: string; uploadedAt?: string };
  }>;
  openCasesCount: number;
}

export function MyDayView({
  staff,
  data,
  now,
}: {
  staff: Staff;
  data: MyDayData;
  now: string;
}) {
  const [selectedCase, setSelectedCase] = useState<RequestView | null>(null);

  return (
    <div className="console-page">
      {/* Page Header */}
      <div className="console-page-header">
        <div>
          <div className="console-subtle-caption" style={{ marginBottom: 4 }}>
            Agent Command Center &bull; {new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <h1 className="console-page-title">
            Good day, {shortName(staff.name)}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link href="/console/inbox" className="console-btn console-btn-secondary">
            <Icon name="inbox" size={15} />
            <span>Triage Inbox</span>
          </Link>
          <Link href="/console/requests?view=my_open" className="console-btn console-btn-primary">
            <Icon name="briefcase" size={15} />
            <span>All My Open Cases ({data.openCasesCount})</span>
          </Link>
        </div>
      </div>

      {/* Summary Stat Grid */}
      <div className="console-grid-4" style={{ marginBottom: "24px" }}>
        <div className="console-stat-card">
          <div className="console-stat-label">
            <Icon name="clock" size={14} style={{ color: "#d97706" }} />
            <span>Follow-ups Today</span>
          </div>
          <div className="console-stat-value">{data.todayFollowUps.length}</div>
          <div className="console-stat-sub">Scheduled calls & reminders</div>
        </div>

        <div className="console-stat-card">
          <div className="console-stat-label">
            <Icon name="alert-triangle" size={14} style={{ color: data.slaCases.some(c => c.breached) ? "#dc2626" : "#4b5563" }} />
            <span>SLA Attention</span>
          </div>
          <div className="console-stat-value" style={{ color: data.slaCases.some(c => c.breached) ? "#dc2626" : "inherit" }}>
            {data.slaCases.length}
          </div>
          <div className="console-stat-sub">
            {data.slaCases.filter(c => c.breached).length} overdue &bull; {data.slaCases.filter(c => !c.breached).length} near limit
          </div>
        </div>

        <div className="console-stat-card">
          <div className="console-stat-label">
            <Icon name="message-square" size={14} style={{ color: "#2563eb" }} />
            <span>Client Replies</span>
          </div>
          <div className="console-stat-value">{data.clientReplies.length}</div>
          <div className="console-stat-sub">Awaiting your response</div>
        </div>

        <div className="console-stat-card">
          <div className="console-stat-label">
            <Icon name="file-text" size={14} style={{ color: "#059669" }} />
            <span>Documents to Review</span>
          </div>
          <div className="console-stat-value">{data.pendingDocs.length}</div>
          <div className="console-stat-sub">Uploaded by clients</div>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: "20px" }}>
        {/* Section 1: Client Replies (Top priority) */}
        <div className="console-card">
          <div className="console-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(37, 99, 235, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>
                <Icon name="message-square" size={15} />
              </div>
              <div>
                <h2 className="console-card-title">Client Replies Awaiting Response</h2>
                <div className="console-subtle-caption">Clients who wrote back to your case updates</div>
              </div>
            </div>
            <span className="console-pill console-pill-blue">{data.clientReplies.length}</span>
          </div>

          <div className="console-card-body" style={{ padding: 0 }}>
            {data.clientReplies.length === 0 ? (
              <div className="console-empty" style={{ padding: "32px 16px" }}>
                <Icon name="check-circle" size={24} style={{ color: "#059669", marginBottom: 8 }} />
                <div style={{ fontWeight: 600, fontSize: "14px" }}>All caught up!</div>
                <div className="console-subtle-caption">No unanswered customer messages.</div>
              </div>
            ) : (
              <div>
                {data.clientReplies.map((c) => {
                  const lastMsg = c.messages[c.messages.length - 1];
                  return (
                    <div
                      key={c.ref}
                      style={{
                        padding: "14px 16px",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 4 }}>
                          <Link
                            href={`/console/requests/${c.ref}`}
                            style={{ fontWeight: 600, fontSize: "13px", color: "var(--console-text-strong)" }}
                          >
                            {c.ref}
                          </Link>
                          <span className="console-subtle-caption">&bull;</span>
                          <span style={{ fontSize: "13px", fontWeight: 500 }}>{c.profile.name}</span>
                          <span className="console-subtle-caption">({c.service.name})</span>
                        </div>
                        {lastMsg && (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#4b5563",
                              background: "#f9fafb",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #f3f4f6",
                              marginBottom: 4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            &ldquo;{lastMsg.body}&rdquo;
                          </div>
                        )}
                        <div className="console-subtle-caption">
                          Received {lastMsg?.at ? fmtAgo(lastMsg.at, now) : "recently"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="console-btn console-btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "12px" }}
                          onClick={() => setSelectedCase(c)}
                        >
                          Preview
                        </button>
                        <Link
                          href={`/console/requests/${c.ref}#messages`}
                          className="console-btn console-btn-primary"
                          style={{ padding: "4px 10px", fontSize: "12px" }}
                        >
                          Reply
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Follow-ups Due Today */}
        <div className="console-card">
          <div className="console-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(217, 119, 6, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#d97706" }}>
                <Icon name="clock" size={15} />
              </div>
              <div>
                <h2 className="console-card-title">Follow-ups Scheduled for Today</h2>
                <div className="console-subtle-caption">Reminders and scheduled client touchpoints</div>
              </div>
            </div>
            <span className="console-pill console-pill-amber">{data.todayFollowUps.length}</span>
          </div>

          <div className="console-card-body" style={{ padding: 0 }}>
            {data.todayFollowUps.length === 0 ? (
              <div className="console-empty" style={{ padding: "32px 16px" }}>
                <Icon name="check-circle" size={24} style={{ color: "#059669", marginBottom: 8 }} />
                <div style={{ fontWeight: 600, fontSize: "14px" }}>No follow-ups due today</div>
                <div className="console-subtle-caption">Scheduled follow-up reminders will appear here.</div>
              </div>
            ) : (
              <div>
                {data.todayFollowUps.map((c) => (
                  <div
                    key={c.ref}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 4 }}>
                        <Link
                          href={`/console/requests/${c.ref}`}
                          style={{ fontWeight: 600, fontSize: "13px", color: "var(--console-text-strong)" }}
                        >
                          {c.ref}
                        </Link>
                        <span className="console-subtle-caption">&bull;</span>
                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{c.profile.name}</span>
                        <RequestStatusBadge r={c} viewer="staff" />
                      </div>
                      {c.followUp && (
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#92400e",
                            background: "#fef3c7",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>Reminder:</span> {c.followUp.what}
                        </div>
                      )}
                      <div className="console-subtle-caption">
                        Contact: {c.profile.phone || c.account.phone} &bull; {c.service.name}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <Link
                        href={`/console/requests/${c.ref}`}
                        className="console-btn console-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        Open Case
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 3: SLA Status / Overdue Cases */}
        <div className="console-card">
          <div className="console-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(220, 38, 38, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
                <Icon name="alert-triangle" size={15} />
              </div>
              <div>
                <h2 className="console-card-title">SLA Stage Targets & Alerts</h2>
                <div className="console-subtle-caption">Cases nearing or exceeding maximum stage duration</div>
              </div>
            </div>
            <span className="console-pill console-pill-red">{data.slaCases.length}</span>
          </div>

          <div className="console-card-body" style={{ padding: 0 }}>
            {data.slaCases.length === 0 ? (
              <div className="console-empty" style={{ padding: "32px 16px" }}>
                <Icon name="check-circle" size={24} style={{ color: "#059669", marginBottom: 8 }} />
                <div style={{ fontWeight: 600, fontSize: "14px" }}>All cases on schedule</div>
                <div className="console-subtle-caption">No cases are currently at risk of SLA breach.</div>
              </div>
            ) : (
              <div>
                {data.slaCases.map(({ case: c, hoursElapsed, targetHours, breached }) => (
                  <div
                    key={c.ref}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      background: breached ? "rgba(254, 242, 242, 0.4)" : "inherit",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 4 }}>
                        <Link
                          href={`/console/requests/${c.ref}`}
                          style={{ fontWeight: 600, fontSize: "13px", color: "var(--console-text-strong)" }}
                        >
                          {c.ref}
                        </Link>
                        <span className="console-subtle-caption">&bull;</span>
                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{c.profile.name}</span>
                        <RequestStatusBadge r={c} viewer="staff" />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: 4 }}>
                        <span
                          className={`console-pill ${breached ? "console-pill-red" : "console-pill-amber"}`}
                          style={{ fontSize: "11px", fontWeight: 600 }}
                        >
                          {breached ? `OVERDUE by ${hoursElapsed - targetHours}h` : `NEAR LIMIT (${hoursElapsed}h / ${targetHours}h)`}
                        </span>
                        <span className="console-subtle-caption">
                          In {c.stage} stage for {Math.floor(hoursElapsed / 24)}d {hoursElapsed % 24}h
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <Link
                        href={`/console/requests/${c.ref}`}
                        className="console-btn console-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        Action Case
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Documents Waiting for Review */}
        <div className="console-card">
          <div className="console-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(5, 150, 105, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
                <Icon name="file-text" size={15} />
              </div>
              <div>
                <h2 className="console-card-title">Documents Awaiting Review</h2>
                <div className="console-subtle-caption">Files submitted by applicants needing verification</div>
              </div>
            </div>
            <span className="console-pill console-pill-green">{data.pendingDocs.length}</span>
          </div>

          <div className="console-card-body" style={{ padding: 0 }}>
            {data.pendingDocs.length === 0 ? (
              <div className="console-empty" style={{ padding: "32px 16px" }}>
                <Icon name="check-circle" size={24} style={{ color: "#059669", marginBottom: 8 }} />
                <div style={{ fontWeight: 600, fontSize: "14px" }}>No pending documents</div>
                <div className="console-subtle-caption">All submitted files have been verified.</div>
              </div>
            ) : (
              <div>
                {data.pendingDocs.map(({ case: c, doc }) => (
                  <div
                    key={`${c.ref}-${doc.id}`}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 4 }}>
                        <Icon name="file" size={14} style={{ color: "#059669" }} />
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>{doc.name}</span>
                        <span className="console-pill console-pill-amber" style={{ fontSize: "10px" }}>Pending</span>
                      </div>
                      <div className="console-subtle-caption">
                        Case <Link href={`/console/requests/${c.ref}`} style={{ fontWeight: 600, color: "var(--console-text-strong)" }}>{c.ref}</Link> &bull; {c.profile.name} &bull; {c.service.name}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      <Link
                        href={`/console/requests/${c.ref}#documents`}
                        className="console-btn console-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        Review Document
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel Quick Preview */}
      <SidePanel
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title={selectedCase ? `Case ${selectedCase.ref}` : ""}
        subtitle={selectedCase ? `${selectedCase.profile.name} &bull; ${selectedCase.service.name}` : ""}
        width={540}
        footer={
          selectedCase ? (
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <button
                type="button"
                className="console-btn console-btn-secondary"
                onClick={() => setSelectedCase(null)}
              >
                Close Preview
              </button>
              <Link
                href={`/console/requests/${selectedCase.ref}`}
                className="console-btn console-btn-primary"
              >
                Open Full Case
              </Link>
            </div>
          ) : undefined
        }
      >
        {selectedCase && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div className="console-subtle-caption">Stage</div>
              <RequestStatusBadge r={selectedCase} viewer="staff" />
            </div>

            <div>
              <div className="console-subtle-caption">Client Details</div>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>{selectedCase.profile.name}</div>
              <div style={{ fontSize: "13px", color: "#4b5563" }}>{selectedCase.profile.phone || selectedCase.account.phone}</div>
            </div>

            <div>
              <div className="console-subtle-caption">Recent Conversation</div>
              <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                {selectedCase.messages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      background: m.by === "customer" ? "#eff6ff" : "#f3f4f6",
                      alignSelf: m.by === "customer" ? "flex-start" : "flex-end",
                      maxWidth: "85%",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>
                      {m.by === "customer" ? selectedCase.profile.name : "Agent"} &bull; {fmtWhen(m.at, now)}
                    </div>
                    <div>{m.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
