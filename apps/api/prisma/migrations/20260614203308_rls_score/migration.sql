-- Defense-in-depth tenant isolation for Score.
ALTER TABLE "Score" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Score" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Score";
CREATE POLICY tenant_isolation ON "Score"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Score" TO mymakaranta_app;
