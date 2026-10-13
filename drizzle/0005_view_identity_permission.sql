-- New permission "View full ID and TIN" (viewIdentity). A database that already has its roles matrix gets the
-- default: Owner, Administrator, Supervisor and Agent may; Finance and Quality reviewers may not. A new, empty
-- database is filled from the starting matrix in lib/permissions.ts instead. The matrix stays editable in Admin.
INSERT INTO "role_permissions" ("role", "permission", "allowed")
SELECT r.role, 'viewIdentity', r.allowed
FROM (VALUES ('Owner', true), ('Administrator', true), ('Supervisor', true), ('Agent', true), ('Finance', false), ('Quality reviewer', false)) AS r(role, allowed)
WHERE EXISTS (SELECT 1 FROM "role_permissions")
ON CONFLICT ("role", "permission") DO NOTHING;
