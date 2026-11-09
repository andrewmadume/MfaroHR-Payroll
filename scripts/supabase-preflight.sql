-- Read-only inspection before applying Mfaro's initial Prisma migration.
-- Run only against the Supabase project selected for Mfaro HR & Payroll.
-- This does not create tables, change privileges, or read employee records.
SELECT current_database() AS database_name, current_user AS inspection_role,
       current_setting('server_version') AS postgres_version;

SELECT nspname AS schema_name
FROM pg_namespace WHERE nspname IN ('public', 'mfaro') ORDER BY nspname;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','mfaro') AND c.relkind IN ('r','p')
  AND c.relname IN ('user','session','account','verification','rateLimit',
    'Organisation','Membership','Employee','Salary','Record','PayrollRun',
    'PayrollLine','Audit','_prisma_migrations')
ORDER BY n.nspname,c.relname;

SELECT table_schema,table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema IN ('public','mfaro')
  AND table_name IN ('user','session','account','verification','rateLimit',
    'Organisation','Membership','Employee','Salary','Record','PayrollRun',
    'PayrollLine','Audit','_prisma_migrations')
ORDER BY table_schema,table_name,ordinal_position;

SELECT n.nspname AS schema_name,c.relname AS table_name,r.rolname AS api_role,
       has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
       has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
       has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
       has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','mfaro') AND c.relkind IN ('r','p')
  AND r.rolname IN ('anon','authenticated')
  AND c.relname IN ('user','session','account','verification','rateLimit',
    'Organisation','Membership','Employee','Salary','Record','PayrollRun',
    'PayrollLine','Audit','_prisma_migrations')
ORDER BY n.nspname,c.relname,r.rolname;
