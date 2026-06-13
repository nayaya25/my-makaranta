-- Defense-in-depth tenant isolation via PostgreSQL Row-Level Security.
-- Primary isolation is the Prisma middleware (app layer); RLS is the backstop that
-- engages when the app connects as the non-superuser `mymakaranta_app` role.
-- NOTE: a superuser (e.g. `postgres`) always bypasses RLS — production must connect
-- as `mymakaranta_app` for RLS to take effect.

-- 1. Enable + force RLS and attach a tenant policy on every schoolId-bearing table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AcademicYear','Term','ClassLevel','Class','Subject','Staff','Student','Parent']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("schoolId" = current_setting(''app.current_school_id'', true)) '
      || 'WITH CHECK ("schoolId" = current_setting(''app.current_school_id'', true))',
      t
    );
  END LOOP;
END $$;

-- 2. Application role that respects RLS (no superuser, no bypass, no login).
--    No password is provisioned here. RLS is verified by SET ROLE within a transaction
--    (a superuser that SET ROLEs to this non-superuser role loses its RLS bypass).
--    In production, the deployed app connects with its own login credentials supplied
--    out-of-band (env/secret manager) and SET ROLEs to this role per request.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mymakaranta_app') THEN
    CREATE ROLE mymakaranta_app NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO mymakaranta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mymakaranta_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mymakaranta_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mymakaranta_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mymakaranta_app;
