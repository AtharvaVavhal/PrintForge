# PrintForge — Architecture Freeze

**Freeze status:** FROZEN
**Freeze date:** 25 August 2026
**Architecture version:** v1.2
**Authoritative document:** `docs/architecture/BLUEPRINT-v1.2.md` (this file is a summary/index, not a substitute for it)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, Vite, React Router, TanStack Query, Axios, React Hook Form, Zod, CSS Modules |
| Backend | NestJS + TypeScript, REST, JWT/Passport, class-validator, Prisma, `@nestjs/schedule` |
| Database | PostgreSQL (sole persistence layer) |
| Payments | Razorpay |
| Media | Cloudinary |
| Email | Resend |

## Database Architecture

20 tables. `payment_attempts` replaces `payments` (Order 1→N attempts, ≤1 `CAPTURED` per order enforced by a partial unique index). `addresses` is removed — single-address MVP folds onto `users`. New: `refresh_tokens`, `idempotency_keys`, `outbox_events`, `webhook_events`, `app_settings`. Orders carry a denormalized, immutable shipping snapshot (no live FK to a user's address). Full schema: BLUEPRINT-v1.2.md §15.

## Backend Architecture

NestJS modular monolith, domain-oriented modules (`auth`, `users`, `products`, `uploads`, `cart`, `checkout`, `payments`, `orders`, `notifications`, `admin`, `common`), one direction of inter-module dependency, no circular dependencies. Three `@nestjs/schedule` cron pollers (outbox sender, webhook Phase-2 retry, payment reconciliation) run in-process — no queue, no worker fleet.

## Frontend Architecture

Single-cart architecture: cart is always server-side and TanStack Query-backed; no guest cart, no client-side cart Context, no merge logic. Login required at "Add to Cart," not checkout. Axios refresh interceptor uses a single shared in-flight promise (no thundering-herd refresh).

## Payment Architecture

Order → `payment_attempts` (1→N). PaymentAttempt states: `INITIATED`/`CAPTURED`/`FAILED`/`ABANDONED`. Order→PAID only via a compare-and-swap update triggered by the first verified-captured attempt (frontend callback or webhook, whichever wins the race — both paths converge idempotently). Razorpay order created once per Order, reused across retries. Checkout is idempotency-keyed and row-locked. Webhook processing is two-phase (durable receipt, then poller-driven idempotent processing) with named, honest limitations, not overclaimed guarantees. Refunds are recorded, not automated (processed manually in the Razorpay dashboard). Full detail: BLUEPRINT-v1.2.md §12–14.

## Authentication Architecture

JWT access (15 min, stateless) + rotated, persisted, revocable refresh tokens (`refresh_tokens` table). Reuse of a revoked refresh token triggers full-session revocation. `users.tokenVersion` gives near-instant revocation on password change/deactivation. Login throttling is IP-based plus a per-account progressive response delay — explicitly **not** a hard account lockout (rejected as a self-inflicted DoS vector). No CAPTCHA in MVP.

## Notification Architecture

PostgreSQL-backed transactional outbox (`outbox_events`), inserted only inside the same transaction as the business-state change it announces, processed by an independent `@nestjs/schedule` poller calling Resend. Three event types: `ORDER_PAID`, `ORDER_STATUS_CHANGED`, `PASSWORD_RESET_REQUESTED`. Email failure is architecturally incapable of reverting any order/payment state — the poller's only writes are to `outbox_events`.

## File-Upload Architecture

Backend-proxied uploads only (no unsigned direct-to-Cloudinary). Customer uploads: PNG/JPEG/PDF only, magic-byte validated, 10MB stream-limited, no server-side parsing/decompression of any kind, Cloudinary authenticated delivery with short-lived signed URLs. File ownership (`uploadedByUserId`) is verified server-side on every write that references a file, unconditionally.

## Deployment Topology

```text
Frontend: https://www.printforge.in   (Vercel/Netlify)
Backend:  https://api.printforge.in   (Railway/Render)
Database: managed PostgreSQL, automated backups
```

Shared registrable root domain is a hard requirement (SameSite cookie behavior depends on it — see Security Model). Sentry (both apps) + `GET /health` + external uptime monitor.

## Security Model

Backend is sole price authority; ownership checked on every resource access, not inferred from role; every client-supplied resource reference (file id, variant id) re-validated server-side; all order/payment state transitions are compare-and-swap; historical order data (pricing, shipping) is immutable by construction. Cookie: `httpOnly`, `Secure`, `SameSite=Strict`, `Path`-scoped, `Domain` omitted. CORS: exact origin, credentialed. Full model: BLUEPRINT-v1.2.md §23.

## Major Invariants (must never be violated by any implementation)

1. Frontend-supplied price/total/discount is never trusted.
2. An order can never have more than one `CAPTURED` payment attempt (DB-enforced).
3. Order status only changes via compare-and-swap; duplicate/concurrent transition attempts are safe no-ops or clean `409`s, never corruption or duplicate side effects.
4. Email/notification failure can never revert business state.
5. A customer can never access another customer's cart, order, upload, or profile.
6. An order's shipping snapshot, once created, is immutable regardless of later profile edits.
7. Uploaded files are never deleted while referenced by any cart or order.
8. Completed orders are never hard-deleted.

## Known Implementation-Level TODOs

Progressive-delay curve constants; outbox/webhook backoff constants; password-reset `eventKey` nonce derivation; order-number generation mechanism (sequence vs. locked counter — either acceptable); amount-match defense-in-depth assertion on capture; sending-domain DNS (SPF/DKIM/DMARC) setup; one pre-launch backup-restore drill. None require reopening architecture. Full list: BLUEPRINT-v1.2.md §37.

## Deferred Phase 2 Decisions

Coupons (CRUD + application, shipped together or not at all), reviews, multi-address book, formal design-approval/proofing workflow, inventory stock-count tracking, shipping-carrier integration, SEO server-side meta-tag injection, staging environment, admin 2FA, CAPTCHA (if abuse observed), in-app refund initiation, guest cart reintroduction (never guest uploads), GST-compliant in-platform invoicing (conditional on client legal confirmation — see BLUEPRINT-v1.2.md §4).

## Explicitly Prohibited Technologies

Redis, Kafka, RabbitMQ, microservices, Kubernetes, GraphQL, event buses, background queue infrastructure (Bull/BullMQ/etc.), additional frameworks (Next.js, standalone Express), unnecessary additional databases, unnecessary third-party services, MongoDB, Java/Spring Boot, Elasticsearch, Redux/global state libraries beyond React Context + TanStack Query. Introducing any of these requires a formal Architecture Change Request demonstrating none of the existing PostgreSQL/`@nestjs/schedule`-based mechanisms can satisfy the requirement — none currently do.

## Architecture Change Procedure

A change to the database schema, transaction boundaries, payment/webhook/outbox design, auth/session model, API contract, or deployment topology requires an **Architecture Change Request**: section(s) affected, problem, proposed change, confirmation it doesn't violate the prohibited-technology list, impact on the frozen schema/contract — reviewed jointly by both developers before merge. No architectural decision is altered silently during implementation. UI/UX detail and the future roadmap (BLUEPRINT-v1.2.md §26, §33) are not freeze-protected in this sense and may evolve without an ACR provided no backend contract changes.
