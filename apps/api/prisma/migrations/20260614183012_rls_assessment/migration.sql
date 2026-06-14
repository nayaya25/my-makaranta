-- Defense-in-depth tenant isolation for the assessment-config tables.
ALTER TABLE "AssessmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AssessmentType";
CREATE POLICY tenant_isolation ON "AssessmentType"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "AssessmentType" TO mymakaranta_app;

ALTER TABLE "GradeBoundary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradeBoundary" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "GradeBoundary";
CREATE POLICY tenant_isolation ON "GradeBoundary"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "GradeBoundary" TO mymakaranta_app;

ALTER TABLE "SubjectAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubjectAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SubjectAssignment";
CREATE POLICY tenant_isolation ON "SubjectAssignment"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "SubjectAssignment" TO mymakaranta_app;
