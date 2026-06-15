-- Defense-in-depth tenant isolation for Correction.
ALTER TABLE "Correction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Correction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Correction";
CREATE POLICY tenant_isolation ON "Correction"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Correction" TO mymakaranta_app;
