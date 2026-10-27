// Roles and permissions. The list of permissions is code (each one is checked somewhere); which role
// has which permission is data, stored in role_permissions and edited in Admin › Roles & people.
import type { StaffRole } from "./types";

export const ROLES: { name: StaffRole; short: string; desc: string }[] = [
  { name: "Owner", short: "Owner", desc: "Everything, including billing and deleting data" },
  { name: "Administrator", short: "Admin", desc: "Manage services, agents and settings" },
  { name: "Supervisor", short: "Supervisor", desc: "Assign cases, approve fee changes" },
  { name: "Agent", short: "Agent", desc: "Work on assigned cases" },
  { name: "Finance", short: "Finance", desc: "Payments, refunds, reconciliation" },
  { name: "Quality reviewer", short: "Quality", desc: "Read-only case review" },
];

export const PERMISSIONS = {
  viewAssigned: "View assigned cases",
  viewAll: "View all cases",
  assign: "Assign / reassign cases",
  updateStatus: "Update case status",
  complete: "Complete a case",
  reviewDocs: "Approve / reject documents",
  downloadDocs: "Download customer documents",
  viewIdentity: "View full ID and TIN",
  deleteDocs: "Delete documents",
  recordOfficial: "Record official fees",
  changeOurs: "Change our assistance fee on a case",
  refund: "Issue refunds",
  editServices: "Edit services & prices",
  editContent: "Edit Kinyarwanda text",
  manageStaff: "Manage agents & roles",
  viewAudit: "View audit logs",
} as const;
export type Permission = keyof typeof PERMISSIONS;

/** Starting matrix: one character per role, in the order of ROLES. Only used to seed a new database. */
export const DEFAULT_MATRIX: Record<Permission, string> = {
  viewAssigned: "111111", viewAll: "111011", assign: "111000", updateStatus: "111100", complete: "111100",
  reviewDocs: "111100", downloadDocs: "111101", viewIdentity: "111100", deleteDocs: "100000",
  recordOfficial: "111110", changeOurs: "111000", refund: "100010",
  editServices: "110000", editContent: "110000", manageStaff: "110000", viewAudit: "110001",
};

export const PERMISSION_GROUPS: { group: string; items: Permission[] }[] = [
  { group: "Cases", items: ["viewAssigned", "viewAll", "assign", "updateStatus", "complete"] },
  { group: "Documents", items: ["reviewDocs", "downloadDocs", "viewIdentity", "deleteDocs"] },
  { group: "Payments", items: ["recordOfficial", "changeOurs", "refund"] },
  { group: "Administration", items: ["editServices", "editContent", "manageStaff", "viewAudit"] },
];

/** Who may open the admin console and the operations overview. */
export const hasAdminAccess = (role: StaffRole, permissions: Iterable<Permission>) =>
  role === "Owner" || role === "Administrator" || role === "Finance" ||
  [...permissions].some((p) => p === "editServices" || p === "editContent" || p === "manageStaff" || p === "refund" || p === "viewAudit");
