-- Defense-in-depth tenant isolation for AttendanceRecord (matches the other tenant tables).
ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AttendanceRecord";
CREATE POLICY tenant_isolation ON "AttendanceRecord"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "AttendanceRecord" TO mymakaranta_app;
