import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * W2 (Phase 5 decision P5-D3: "append-only... no application service may
 * update or delete audit records"). Static scan of every non-spec `.ts`
 * file under `src/` for a mutation call against either audit model —
 * `.platformAuditLog.`/`.tenantAuditLog.` followed by `update`/
 * `updateMany`/`delete`/`deleteMany`/`upsert` — or an equivalent raw-SQL
 * `UPDATE`/`DELETE FROM` against either table name. Mirrors the proven
 * static-scan pattern already used by `platform.guard.spec.ts` (its
 * "dormant" test) and `scheduler-registration.spec.ts`.
 *
 * `AuditService` itself exposes no such method (see `audit.service.spec.ts`'s
 * own "append-only by construction" test) — this file's job is to catch a
 * FUTURE caller that bypasses `AuditService` and mutates either table
 * directly via Prisma or a raw query.
 */
describe('audit models — append-only invariant (P5-D3)', () => {
  const srcRoot = join(__dirname, '..', '..');

  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  function tsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return tsFiles(full);
      }
      return entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts')
        ? [full]
        : [];
    });
  }

  const files = tsFiles(srcRoot);

  const prismaMutationPattern =
    /\.(platformAuditLog|tenantAuditLog)\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/;
  const rawSqlMutationPattern =
    /\b(UPDATE|DELETE\s+FROM)\s+"?(platform_audit_logs|tenant_audit_logs)"?/i;

  it('no file calls .update()/.updateMany()/.delete()/.deleteMany()/.upsert() on either audit model', () => {
    const hits: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (prismaMutationPattern.test(code)) {
        hits.push(file.slice(srcRoot.length + 1));
      }
    }
    expect(hits).toEqual([]);
  });

  it('no file issues a raw UPDATE/DELETE against platform_audit_logs or tenant_audit_logs', () => {
    const hits: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (rawSqlMutationPattern.test(code)) {
        hits.push(file.slice(srcRoot.length + 1));
      }
    }
    expect(hits).toEqual([]);
  });

  it('AuditService is the only place either model is ever .create()d, keeping the write path singular and auditable', () => {
    const creators: string[] = [];
    const createPattern =
      /\.(platformAuditLog|tenantAuditLog)\s*\.\s*create\s*\(/;
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (createPattern.test(code)) {
        creators.push(file.slice(srcRoot.length + 1));
      }
    }
    expect(creators).toEqual(['common/audit/audit.service.ts']);
  });
});
