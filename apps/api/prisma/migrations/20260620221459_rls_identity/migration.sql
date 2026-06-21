-- Defense-in-depth tenant isolation for P1 identity tables.
-- Mirrors the exact pattern of existing rls_* migrations (app.current_school_id).
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Membership";
CREATE POLICY tenant_isolation ON "Membership"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Membership" TO mymakaranta_app;

ALTER TABLE "StaffProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffProfile";
CREATE POLICY tenant_isolation ON "StaffProfile"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "StaffProfile" TO mymakaranta_app;

ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StudentProfile";
CREATE POLICY tenant_isolation ON "StudentProfile"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "StudentProfile" TO mymakaranta_app;
