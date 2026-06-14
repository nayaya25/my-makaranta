-- Defense-in-depth tenant isolation for release tables.
ALTER TABLE "Release" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Release" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Release";
CREATE POLICY tenant_isolation ON "Release"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Release" TO mymakaranta_app;

ALTER TABLE "ResultSheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultSheet" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ResultSheet";
CREATE POLICY tenant_isolation ON "ResultSheet"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ResultSheet" TO mymakaranta_app;

ALTER TABLE "ResultSheetEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultSheetEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ResultSheetEntry";
CREATE POLICY tenant_isolation ON "ResultSheetEntry"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "ResultSheetEntry" TO mymakaranta_app;
