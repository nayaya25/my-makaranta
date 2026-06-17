-- Defense-in-depth tenant isolation for Announcement + AnnouncementRecipient.
ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Announcement";
CREATE POLICY tenant_isolation ON "Announcement"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Announcement" TO mymakaranta_app;

ALTER TABLE "AnnouncementRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnouncementRecipient" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AnnouncementRecipient";
CREATE POLICY tenant_isolation ON "AnnouncementRecipient"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "AnnouncementRecipient" TO mymakaranta_app;
