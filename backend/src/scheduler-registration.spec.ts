import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * `ScheduleModule.forRoot()` installs the explorer that discovers every
 * `@Cron`/`@Interval` provider in the app. Registering it in more than one
 * module registers the explorer more than once, and every scheduled job
 * (payment reconciliation, webhook retry, notifications outbox) then runs
 * that many times per tick. It must appear in exactly one place —
 * AppModule. This pins that invariant so a feature module can't quietly
 * re-add its own `forRoot()`.
 */
describe('ScheduleModule registration', () => {
  const srcRoot = __dirname;

  function tsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return tsFiles(full);
      return entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts')
        ? [full]
        : [];
    });
  }

  // Strip line + block comments first so an explanatory comment that names
  // the call doesn't count as a call site.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const callers = tsFiles(srcRoot)
    .filter((f) =>
      /ScheduleModule\s*\.\s*forRoot\s*\(/.test(
        stripComments(readFileSync(f, 'utf8')),
      ),
    )
    .map((f) => f.slice(srcRoot.length + 1));

  it('calls ScheduleModule.forRoot() exactly once, in app.module.ts', () => {
    expect(callers).toEqual(['app.module.ts']);
  });
});
