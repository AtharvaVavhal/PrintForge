# PrintForge Backend — Scaffolding Report

**Date:** 25 August 2026
**Scope:** Backend folder/module architecture and project scaffolding only, per the frozen `docs/architecture/BLUEPRINT-v1.2.md`. No business logic implemented.

---

## 1. Folder structure created

```
backend/
├── prisma/
│   ├── schema.prisma        (20 models, 8 enums — full §15 schema)
│   └── seed.ts               (stub, TODO)
├── src/
│   ├── common/
│   │   ├── config/            (configuration.ts, env.validation.ts)
│   │   ├── database/          (PrismaService, PrismaModule — @Global)
│   │   ├── decorators/        (@CurrentUser, @Public, @Roles)
│   │   ├── guards/             (JwtAuthGuard, RolesGuard)
│   │   ├── interceptors/       (ResponseInterceptor — §21 envelope)
│   │   ├── filters/            (HttpExceptionFilter — §21 envelope)
│   │   ├── enums/               (Role)
│   │   ├── constants/           (app.constants.ts)
│   │   ├── types/                (ApiResponse interfaces)
│   │   ├── health/                (GET /health — §30)
│   │   ├── pipes/, middleware/, exceptions/, utils/, logger/  (.gitkeep — empty, reserved)
│   ├── auth/            (+ dto/, guards/, strategies/JwtStrategy)
│   ├── users/            (+ dto/)
│   ├── products/          (+ dto/, categories/, variants/, customizations/)
│   ├── uploads/            (+ dto/, cloudinary/CloudinaryService, guards/)
│   ├── cart/                (+ dto/)
│   ├── checkout/             (+ dto/, pricing/PricingService, idempotency/IdempotencyService)
│   ├── payments/               (+ dto/, razorpay/RazorpayService, webhooks/WebhookProcessor)
│   ├── orders/                   (+ dto/, state-machine/, history/)
│   ├── notifications/              (+ dto/, outbox/OutboxPoller, email/, templates/)
│   ├── admin/                        (+ dto/, orders/, products/)
│   ├── app.module.ts
│   └── main.ts
└── test/
    ├── unit/, integration/    (.gitkeep — empty, reserved)
    └── e2e/app.e2e-spec.ts     (health-check e2e test)
```

61 TypeScript files, 27 `.gitkeep` placeholders (empty reserved directories — auth/dto, checkout/dto, products/variants, etc. — populated when the corresponding business logic is built).

## 2. Files created

- **Config/infra:** `package.json` (rewritten with full frozen-stack dependencies), `tsconfig.json` (upgraded to `strict: true`), `.gitignore`, `.env.example`.
- **`common/`:** `PrismaService`/`PrismaModule` (global), `configuration.ts` + `env.validation.ts` (fail-fast env validation), `JwtAuthGuard`/`RolesGuard` + `@Public`/`@Roles`/`@CurrentUser` decorators, `ResponseInterceptor` + `HttpExceptionFilter` implementing the frozen `{success, data}` / `{success:false, error}` envelope (§21), `HealthController` (`GET /health`, §30), `Role` enum, `app.constants.ts`, `ApiResponse` types.
- **All 9 domain modules** (`auth`, `users`, `products`, `uploads`, `cart`, `checkout`, `payments`, `orders`, `notifications`, `admin`): `*.module.ts` / `*.controller.ts` / `*.service.ts` triads, wired via real NestJS dependency injection along the corrected module graph (§8 below). Controllers carry route ownership as TODO comments citing the exact API contract rows (§20) they'll implement — **no route handlers, no fake logic, nothing that pretends to work.**
- **Real, non-stubbed infrastructure code** (implemented for real, not TODO'd, because it's precisely specified in the frozen doc and is wiring rather than business logic):
  - `JwtStrategy` — verifies the access token and re-checks `tokenVersion` against the DB for instant revocation (§23).
  - `orders/state-machine/order-state-machine.ts` — the full 9-state CAS transition table from §14.
  - `RazorpayService` / `CloudinaryService` — SDK config wiring (`onModuleInit`).
  - `main.ts` — global prefix `/api/v1`, Helmet, cookie-parser, exact-origin credentialed CORS, `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`.
- **`prisma/schema.prisma`** — all 20 tables from §15 (users, refresh_tokens, categories, products, product_images, product_variants, customization_fields, uploaded_files, carts, cart_items, cart_item_customizations, orders, order_items, order_item_customizations, payment_attempts, order_status_history, webhook_events, idempotency_keys, outbox_events, app_settings), 8 enums, explicit `onDelete` semantics matching §15's FK column (RESTRICT/SET NULL), all indexes from the "key indexes" column.
- **`prisma/seed.ts`** — stub only (TODO), per your instruction that this is scaffolding, not business content.
- **`test/e2e/app.e2e-spec.ts`** — health-check e2e test (rewritten from the Nest-generated boilerplate, which tested a route that no longer exists).

## 3. Files modified

- `package.json`, `tsconfig.json` — rewritten (see below).
- `test/app.e2e-spec.ts` — **could not be deleted** (see §10); overwritten with a `describe.skip` pointing to its replacement so it doesn't fail CI as dead weight.

## 4. Packages installed

**Dependencies added:** `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/schedule`, `@nestjs/throttler`, `@prisma/client`, `bcrypt`, `class-transformer`, `class-validator`, `cloudinary`, `cookie-parser`, `helmet`, `passport`, `passport-jwt`, `razorpay`, `resend`, `uuid` (+ matching `@types/*` and `prisma` as devDependencies).

**Deliberately not installed:** `@sentry/node`. The frozen deployment topology (§30) calls for Sentry, but wiring it up needs a real DSN/config decision, which is business/ops setup, not scaffolding — flagged in §9 below rather than added speculatively (rule: no unnecessary packages).

`npm install` succeeded on your machine — 838 packages, 0 install-blocking errors.

## 5. Prisma status

**Schema:** written in full (20 models, 8 enums), internally consistent, FK actions and indexes match §15 exactly.

**Could not run `prisma generate` / `prisma validate` / `prisma migrate dev` — environmental blocker, not a schema defect.** Both the sandboxed environment this session ran in and the local shell it used on your machine sit behind an egress allowlist that blocks `binaries.prisma.sh` (confirmed via `curl -v`: `X-Proxy-Error: blocked-by-allowlist`, HTTP 403). Prisma's CLI needs to download its query/schema engine from that host for `generate`/`validate`/`migrate` to run at all — there's no offline path.

**Action needed from you:** run this yourself in a normal terminal (outside any sandboxed session) once you have a `DATABASE_URL` pointed at a real Postgres instance:
```bash
cd backend
npx prisma generate
npx prisma validate
npx prisma migrate dev --name init
```
After the first migration is generated, hand-edit the migration SQL to add the partial unique index (Prisma's schema DSL can't express it — this is called out with a comment directly above the `PaymentAttempt` model in `schema.prisma`):
```sql
CREATE UNIQUE INDEX payment_attempts_order_captured_unique
  ON payment_attempts ("orderId") WHERE status = 'CAPTURED';
```

## 6. Build status

`npm run build` was not run to completion for the same reason as §5 — `nest build` type-checks against `@prisma/client`, whose types don't exist until `prisma generate` runs. `npx tsc --noEmit` (see §7) demonstrates the code is otherwise clean.

## 7. TypeScript status

`npx tsc --noEmit` → **6 errors, all four distinct root-caused by the un-generated Prisma client** (`Could not find a declaration file for module '@prisma/client'`, plus its two downstream consequences: `PrismaService` not typed as having `.user`/`$connect`/`$disconnect`). Zero errors anywhere else in the scaffold. One real bug was found and fixed during this pass: `@nestjs/jwt`'s `signOptions.expiresIn` type didn't structurally accept a plain `string` from `ConfigService` — fixed with a documented, narrow cast in `auth.module.ts`.

`npx eslint --fix` was also run: auto-fixed ~25 Prettier formatting issues, and I manually fixed two real `no-unused-vars` findings (`app.module.ts`, `auth.controller.ts`) and one floating-promise warning (`main.ts`: `bootstrap()` → `void bootstrap()`). Remaining lint errors (14) are 100% the same Prisma-client cascade as the `tsc` errors — verified line-by-line, none are independent issues.

**Bottom line: once you run `prisma generate` locally, `npm run build` and `npx tsc --noEmit` should both pass clean.** I could not verify that last step myself due to the network block.

## 8. Architectural conflicts discovered

Your restated "MODULE DEPENDENCY RULE" in this task's instructions contained two internal contradictions against itself and against the frozen `BLUEPRINT-v1.2.md` §17. Per your explicit instruction, I'm reporting these rather than silently picking a direction — I did proceed with the resolution below (rather than blocking entirely) because it's the only acyclic reading consistent with §17 (your own frozen, authoritative document) and with your rule against `forwardRef()`; the module `imports: []` arrays are easy to re-wire if you disagree.

**Conflict A — `orders` ↔ `notifications`:** the restated rule said both "orders → notifications" and "notifications → orders, auth" — a literal cycle, contradicting your own rule against circular dependencies. §17 of the frozen blueprint is unambiguous: notifications exposes "outbox insert helpers used by orders/auth," i.e. orders and auth depend on notifications, never the reverse. **Resolved as:** `notifications` is a base-layer module depending on nothing; `orders` and `auth` both depend on it.

**Conflict B — `payments` ↔ `checkout`:** the restated rule said "payments → orders, checkout." But §12.4's own lifecycle diagram has checkout's order-creation transaction immediately followed by a call into Payments-domain logic to create the Razorpay order — that's checkout calling into payments, not payments calling into checkout. §17 confirms directly: "`checkout → cart/orders/payments`, never reverse." Taking the restated rule literally alongside that functional requirement would force a `checkout ↔ payments` cycle needing `forwardRef()`, which your own rule 15 discourages. **Resolved as:** `checkout → payments` (checkout imports `PaymentsModule`); `payments` depends only on `orders`, never on `checkout`.

**Final acyclic graph implemented** (topological order): `users`, `notifications`, `uploads` (base layer, depend on nothing) → `products` (→ uploads) → `cart` (→ products, uploads) → `orders` (→ users, products, uploads, notifications) → `payments` (→ orders) → `checkout` (→ cart, products, users, orders, payments) → `admin` (→ orders, products, users, pure aggregation) → `auth` (→ users, notifications). No `forwardRef()` anywhere.

## 9. Decisions requiring human confirmation

1. **Confirm the corrected dependency graph in §8** — if you intended a genuinely different direction for either edge, the fix is a one-line `imports: []` change per module, done before any business logic is written on top of it.
2. **Sentry** — not installed/wired (see §4). Confirm whether you want it added now (needs a DSN) or deferred to a later task.
3. **`@nestjs/jwt` expiresIn cast** (§7) — a narrow, documented type cast, not a runtime risk, but flagging since it's the one place I diverged from "no type-checking workarounds" in spirit; happy to replace with a runtime-validated branded type if you'd rather.
4. **Prisma verification (§5/§6)** — needs to be run by you or in an unrestricted environment; I cannot complete it from here.

## 10. Deviations forced by sandbox restrictions (please clean up manually)

The tool session's shell on your machine cannot delete files (`rm`/`unlink` return `Operation not permitted` for every attempt, confirmed repeatedly). This forced two categories of leftovers:

**A. Nest-generated boilerplate I could not remove** (not part of the frozen module list, harmless but dead):
- `backend/src/app.controller.ts`, `backend/src/app.service.ts`, `backend/src/app.controller.spec.ts` — the default "Hello World" trio from `nest new`. Not imported by `app.module.ts` (I rewired it to the 9 domain modules instead), so they're inert. **Please delete these three files.**
- `backend/test/app.e2e-spec.ts` — the matching e2e test; I overwrote it with a `describe.skip` pointing to its replacement at `test/e2e/app.e2e-spec.ts` so it doesn't fail CI, but it should also just be deleted.

**B. Temporary directories from the scaffolding process itself**, all renamed to a `_to_delete_*` prefix at your repo root — **please delete these three folders**:
- `_to_delete_scaffold_tmp_1787681354`
- `_to_delete_node_modules_1787681723` (a corrupted partial `node_modules` from an interrupted install attempt — not needed, `backend/node_modules` is the good one)
- `_to_delete_nm_chunks_1787681354`

One command from your repo root does all of it:
```bash
rm -rf _to_delete_* backend/src/app.controller.ts backend/src/app.service.ts backend/src/app.controller.spec.ts backend/test/app.e2e-spec.ts
```
