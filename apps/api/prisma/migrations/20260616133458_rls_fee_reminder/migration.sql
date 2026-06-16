-- Defense-in-depth tenant isolation for FeeReminder.
ALTER TABLE "FeeReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeReminder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FeeReminder";
CREATE POLICY tenant_isolation ON "FeeReminder"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "FeeReminder" TO mymakaranta_app;
