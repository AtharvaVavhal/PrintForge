-- Phase 3 — Postgres Row-Level Security, defense-in-depth (decision D4,
-- docs/saas/DECISIONS.md, resolved 2026-09-07: BOTH application-layer
-- scoping PRIMARY + RLS defense-in-depth; fact-finding P3-D2 confirmed the
-- production application role is non-superuser and non-BYPASSRLS).
--
-- Scope: EXACTLY the six Phase 1/2a tenancy tables. No business/commerce
-- table is touched — that RLS extension waits for Phase 4's tenantId
-- backfill on those tables (Master Plan §9 DATABASE/DATA IMPACT).
--
-- FORCE ROW LEVEL SECURITY is required in addition to ENABLE: Postgres
-- exempts a table's OWNER from RLS by default, and the application role
-- (printforge_db_user) owns every one of these tables (verified read-only
-- against production during Phase 3 implementation via
-- `SELECT tableowner FROM pg_tables WHERE tablename = ...` — a fact P3-D2's
-- original superuser/BYPASSRLS check did not itself cover). Without FORCE,
-- these policies would be a complete no-op against the app's own
-- connection while appearing to be enabled.
--
-- Policy design (fail closed, per this phase's explicit requirement):
--   USING (bypass_flag = 'true' OR scope_column = current_setting(tenant_id))
-- If neither `app.bypass_tenant_rls` nor `app.tenant_id` has been SET LOCAL
-- for the current transaction, current_setting(..., true) returns NULL,
-- every comparison is NULL (falsy), and EVERY ROW IS HIDDEN — the fail-
-- closed default. The bypass flag exists ONLY for the small, explicitly
-- named set of platform-scoped operations that are correctly cross-tenant
-- by design (Master Plan §9 "Platform-scoped operations identified
-- explicitly"): today, JwtStrategy's own identity-loading query (loading a
-- User's own memberships across whichever tenants they belong to, before
-- any tenant is selected) and TenantContextGuard's host/domain lookup
-- (resolving a tenant from a hostname, before a tenant is known). Both are
-- explicitly wrapped with `withPlatformRlsBypass()`
-- (backend/src/common/tenant/tenant-rls.ts) — nothing else in the
-- application sets this flag.
--
-- This migration is enable-only: it does not modify, move, or delete a
-- single existing row in any of these six tables.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "tenants"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "id" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "stores"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "store_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "store_domains"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "tenant_memberships"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "subscriptions"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "customers"
  USING (
    current_setting('app.bypass_tenant_rls', true) = 'true'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
