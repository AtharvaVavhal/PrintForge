# AB Creations — Phase 10 Design Proposal: Reviews & Coupons

**STATUS: PROPOSAL — NOT FROZEN, NOT IMPLEMENTED**
**DRAFT DATE: 27 August 2026**
**AUTHORITY: none yet — for joint Atharva+Harshad review, then freeze (or amend) before any code, migration, or DTO is written.**

> This document is a design proposal, not an implementation. Nothing in
> `backend/` or `frontend/` should change as a result of this document
> alone. `BLUEPRINT-v1.2.md` §29 lists Phase 10 as "Reviews/Coupons —
> Phase 2, not built," and §15/§13.M explicitly reserve the `coupons`,
> `coupon_usages`, and `reviews` table names without defining their
> columns. This document is the missing definition, written to the same
> level of detail as `BLUEPRINT-v1.2.md` so it can be reviewed line by
> line and either frozen as a Phase 10 addendum to that document, or
> revised before freezing. Every claim about "how the current code
> works" below was verified by reading the actual shipped `backend/src`
> code as of `121f72c` (Phase 9, `feat(admin): admin dashboard, orders,
> and customers UI`), not inferred from the blueprint's prose alone.

---

## 0. Judgment calls — read this first

Every open question the Phase 10 brief asked for is answered here in one line, with the section that justifies it. Override any of these before this document is frozen — nothing below depends on more than one or two of these at once, so overriding one rarely cascades.

**Reviews**

| # | Question | Decision | One-line rationale |
|---|---|---|---|
| R1 | Verified purchase required? | **Yes** — gated on an `OrderItem` for that product on an order with `status = DELIVERED` | Small storefront, custom-printed goods — a handful of fake/competitor reviews does disproportionate damage; DELIVERED (not just PAID) means the customer actually received and could judge the physical product. See §1.4. |
| R2 | Rating scale, required? | **1–5 integer, required.** Body text **optional** (rating-only allowed, text-only-no-rating not allowed) | Star-only reviews are the common case and are what feeds the denormalized average (R6) — a "review" that doesn't contribute a rating would be an outlier UX, not the default. |
| R3 | Moderation model | **Publish immediately**, but with a `status` column (`PUBLISHED` default) from day one, not bolted on later | Verified-purchase (R1) is already the primary anti-abuse gate; pre-moderation queueing every review adds admin workload and launch friction for a bar the purchase-gate already mostly clears. The status column means flipping to pre-moderation later is a one-line default change, not a migration. |
| R4 | Edit / delete own review? | **Yes, unrestricted** — author can edit rating/body or soft-remove (`status → REMOVED`) any time | No precedent anywhere in this codebase for locking a user out of editing their own content (profile, cart); soft-remove (not hard delete) matches the project's dominant "state transition, never delete" philosophy (orders, products, users all follow this). |
| R5 | Admin remove any review (post-hoc)? | **Yes** — `PATCH /admin/reviews/:id/status → REJECTED` or `REMOVED` | Explicit moderation-after-the-fact power even though R3 skips pre-moderation. |
| R6 | One review per user per product, or many? | **One** — unique `(productId, userId)` | Simplest, matches most e-commerce platforms, and the purchase gate (R1) already limits genuine grounds for multiple reviews of the same product to "bought it twice" — an acceptable simplification, not a real loss. |
| R7 | Average rating: computed on read or denormalized on write? | **Denormalized** — `Product.avgRating` / `Product.reviewCount`, recomputed via a scoped re-aggregate query in the same transaction as any review create/edit/status-change | Matches this project's explicit existing preference for atomic-transaction-maintained state over read-time aggregation (the order-number counter, `Product`/`Order` snapshot fields) — and product listing is a public, high-traffic, unauthenticated read path where a per-card aggregate query would be wasteful. |
| R8 | Photo/attachment support? | **Explicitly deferred**, not in this proposal's v1 | Reusing the Cloudinary uploads flow isn't a drop-in — `POST /uploads`'s `purpose` is currently inferred from the caller's *role* (ADMIN → product, else → customization), not caller-specified, so review photos need a real (if small) signature change plus a new moderation concern (image content, not just file-format validity) that the existing magic-byte checks don't cover. Documented as a clean Phase 10.1 follow-on in §1.6, not built here. |
| R9 | Separate `title` field? | **No** — rating + optional body only | Keeps the schema lean; a title field is cosmetic, not asked for by the brief, and easy to add later without touching anything else. |

**Coupons**

| # | Question | Decision | One-line rationale |
|---|---|---|---|
| C1 | Types supported | **All three** — `PERCENTAGE`, `FLAT_AMOUNT`, `FREE_SHIPPING` | Each maps onto one line of the *existing* pricing formula (`total = subtotal − discount + shippingFee`) with zero change to `PricingService`'s method signatures — see §2.4. Cheap to support all three as one enum, not three tables. |
| C2 | Stacking | **No — one coupon per order, enforced at the schema level** (`Order.couponId` is a single nullable FK, not a join table) | The brief's suggested simpler default is correct; nothing in this catalog's size or the brief's requirements asks for stacking, and a single-FK design makes stacking structurally impossible to introduce by accident, not just discouraged by convention. |
| C3 | Scope | **Store-wide or category-specific. No product-specific scope in v1.** | `prisma/schema.prisma`'s seed plan (§16 of the blueprint: "2–3 categories, 6–10 products") confirms a catalog too small to need per-product promo targeting; category scope is one nullable FK, product scope would need a join table for comparatively little value at this scale. |
| C4 | Constraints in v1 | **Expiry window (`startsAt`/`expiresAt`), total usage limit, per-user usage limit, minimum order value, first-order-only.** Deferred: a percentage cap (`maxDiscountAmount`), i.e. "20% off up to ₹200." | The five in-scope constraints are each a single cheap column/check; the cap is a real feature with its own edge cases (what happens when the cap binds vs. the percentage) better designed once there's a first coupon in production to calibrate against. |
| C5 | Who creates coupons | **Admin-only CRUD**, `/admin/coupons`. **Confirmed: no self-serve customer-facing coupon creation or public coupon listing anywhere in this proposal.** | Matches the admin system's existing exclusive ownership of catalog/order/customer mutation (§19); publicly listing active codes would defeat the point of a code-gated discount. |
| C6 | Where does it slot into checkout? | **Additive.** `PricingService.computeOrderTotal` already accepts an optional `discountPaise` — that parameter is populated for the first time, not added. One **new, promoted-to-real-column** finding: `Order.shippingFee` does not exist today (it's derived on read as `total − subtotal`); once `discountAmount` is real, that derivation silently breaks and `shippingFee` must become a real stored column too. See §2.5 — this is the single most load-bearing finding in this whole document. | Traced from the actual `checkout.service.ts` code, not assumed. |
| C7 | Snapshotted on the Order? | **Yes** — `Order.couponId` (nullable FK, `SET NULL`), `Order.couponCode` (denormalized string snapshot), `Order.discountAmount` (`Decimal(10,2)`, default `0`, never null) | Same "immutable snapshot at creation" principle already applied to shipping address and order-item pricing (§11 of the blueprint). A later coupon edit/deactivation must never retroactively change a placed order's total. |
| C8 | Concurrency / idempotency for usage limits | **Same atomic-claim pattern as `idempotency_keys`**, inside the *same* checkout transaction — not a separate mechanism | `BLUEPRINT-v1.2.md` §13 row M already reserves exactly this design ("usage-limit check + `coupon_usages` insert inside the same locked TXN as order creation, never a separate pre-check"). This proposal implements that reservation rather than inventing a new one. See §2.6. |

---

# Part A — Reviews

## 1.1 Schema

```text
Review
├── id             uuid PK
├── productId      FK → products, RESTRICT
├── userId         FK → users, RESTRICT
├── orderItemId    FK → order_items, RESTRICT  — the verified-purchase anchor (R1)
├── rating         Int (1–5, NOT NULL)
├── bodyText       String? (nullable — rating-only allowed, R2)
├── status         enum: PUBLISHED | REJECTED | REMOVED  (default PUBLISHED, R3)
└── createdAt, updatedAt   timestamp
```

| Table | Purpose | Key columns (beyond id/timestamps) | FKs | Unique constraints | Key indexes | Invariants |
|---|---|---|---|---|---|---|
| **reviews** | Customer-authored product reviews | `productId`, `userId`, `orderItemId`, `rating` (1–5, `NOT NULL`), `bodyText` (nullable), `status` | `productId→products (RESTRICT)`, `userId→users (RESTRICT)`, `orderItemId→order_items (RESTRICT)` | (`productId`, `userId`) — one review per user per product (R6) | `productId` (product-page read), `status` (moderation-queue scan, product-page `WHERE status='PUBLISHED'`) | Never hard-deleted — removal is `status → REMOVED` (R4/R5). `rating` is a typed `Int` column, never buried in a `specifications`-style JSONB field, matching this schema's existing "pricing/scoring-critical values are typed columns" convention (§9 of the blueprint, `CustomizationField.surchargeAmount`). |

**`Product` gains two denormalized columns** (R7):

| Column | Type | Notes |
|---|---|---|
| `avgRating` | `Decimal(3,2)`, nullable | `null` until the first `PUBLISHED` review exists — a product page renders "No reviews yet" rather than "0.00 stars," which a `0` default would wrongly suggest. |
| `reviewCount` | `Int`, default `0` | Count of `PUBLISHED` reviews only. |

Both are recomputed inside the same transaction as any review create/edit/status-change, via a single scoped re-aggregate — `SELECT AVG(rating), COUNT(*) FROM reviews WHERE productId=$id AND status='PUBLISHED'`, then `UPDATE products SET ... WHERE id=$id` — not an incremental running-average. A re-aggregate is trivially correct under rating edits and status flips in/out of `PUBLISHED`; an incremental formula would need to get all of those cases right by hand for a query that only ever scans one product's rows (cheap either way, so there's no performance reason to prefer the fiddlier option).

**Why not `orderId` instead of `orderItemId`:** a single order can contain items for several different products. Anchoring on `orderId` alone would let a customer who bought Product A "prove" a purchase of Product B in the same order. `orderItemId` is the tightest correct anchor — it's the exact line that snapshots `productId` at order-creation time (§11's immutable order-item snapshot). The service resolves this itself at creation time (`SELECT one qualifying order_item for (userId, productId, order.status = DELIVERED)`) — the client never supplies `orderItemId` directly, consistent with Business Rule 12 (every client-supplied resource reference is re-validated for ownership server-side, not just checked for existence). If a customer has bought the product via more than one delivered order, the service picks any one qualifying item; which one doesn't matter since it's the same product.

**Accepted edge case, not engineered around:** the order-status graph (§14) allows `DELIVERED → REFUNDED`. If an order backing an existing review is later refunded, that review is not automatically retroactively hidden — R5's admin-removal power is the intended escape hatch for that rare case, not an automatic rule. Building automatic review-revocation-on-refund is speculative complexity for an edge that, per the state machine, requires an admin to have already manually transitioned a *delivered* order to refunded.

## 1.2 API contract

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /products/:slug/reviews` | Public | Paginated, `status = PUBLISHED` only, newest-first. Nested under the public product resource, mirroring how `categories`/`customization-fields` nest under `products` today. |
| `POST /products/:slug/reviews` | Auth (verified purchase, R1) | Body: `{ rating, bodyText? }` — no `orderItemId` in the request (resolved server-side, see §1.1). `409` if the user has no qualifying `DELIVERED` order-item for this product; `409` if `(productId, userId)` already has a review (R6, "you've already reviewed this — edit it instead"). |
| `PATCH /reviews/:id` | Auth (owner only) | Edit own `rating`/`bodyText`. Whitelisted DTO — no `status` field accepted here (moderation is admin-only, below). |
| `DELETE /reviews/:id` | Auth (owner only) | Semantically a `status → REMOVED` transition, not a row delete (R4) — kept as an HTTP `DELETE` because that's what a caller expects for "remove my review," same as `PATCH /admin/orders/:id/status` is a state-machine transition wearing a simple-looking `PATCH`. |
| `GET /admin/reviews` | Admin | All statuses, paginated, filterable by `status`/`productId` — mirrors `GET /admin/orders`'s separate-namespace pattern (see §1.3 for why this can't just be a role-gated verb on the public route). |
| `PATCH /admin/reviews/:id/status` | Admin | `{ status: PUBLISHED \| REJECTED \| REMOVED }` — no transition graph like orders' §14 (any status to any status is fine for moderation; there's no meaningful "illegal" moderation transition the way there is for order fulfillment). |

**Existing contract row touched:** `GET /products/:slug` — response gains `avgRating` (`string | null`) and `reviewCount` (`number`). Additive, backward-compatible (unknown-field-tolerant clients are unaffected).

**No new outbox event type.** A "your review was rejected" email is a plausible future addition but isn't required for R3's publish-immediately default, and the outbox's three MVP triggers (§12.2) are deliberately exhaustive — adding a fourth for a feature this proposal already keeps minimal would be scope creep. Flagged as a cheap Phase 10.1 addition if moderation volume ever makes rejected reviews want asynchronous customer notice.

## 1.3 Why reviews needs a top-level module (not a `products/` subfolder)

Categories, variants, and customization fields all live as subfolders *inside* `ProductsModule` because none of them need anything `ProductsModule` doesn't already have. Reviews looks like it belongs there too — it's conceptually "a product sub-resource" — **but it can't be**, and this is worth stating explicitly because it's not obvious from the resource shape alone:

Reviews needs the verified-purchase check (R1), which needs `OrdersModule` (to read `Order.status` and `OrderItem.productId`). But `OrdersModule` already imports `ProductsModule` (for line-item snapshots — see `orders.module.ts`'s own doc comment: "Depends on: users, products, uploads, notifications"). If `ReviewsModule` were nested inside `ProductsModule`, `ProductsModule` would need to import `OrdersModule` to give it the check — and `OrdersModule` already imports `ProductsModule`. That's a direct cycle, the exact class of problem the Phase 0 scaffold report (§8) already resolved once for `orders ↔ notifications` and `checkout ↔ payments`, and the fix is the same shape: **reviews has to be a genuinely new top-level module, sitting topologically *after* `orders`**, not a leaf hanging off `products`.

**Module:** `backend/src/reviews/` (+ `dto/`) — `reviews.module.ts`, `reviews.controller.ts`, `reviews.service.ts`.

**Imports:** `OrdersModule` (verified-purchase check), `ProductsModule` (denormalized `avgRating`/`reviewCount` write, product-exists check for the nested route). Does **not** import `UploadsModule` in v1 (R8 defers photos — this edge would be added, safely, alongside that later work: `uploads` is base-layer, so `reviews → uploads` is acyclic whenever it's added).

**`AdminModule` gains a `ReviewsModule` import** — additive to its existing `OrdersModule`, `ProductsModule`, `UsersModule`, same pure-aggregation role it already plays.

Placement in the existing topological order (unchanged edges shown for context, new ones bolded):

```text
users, notifications, uploads   (base layer)
  → products → cart
  → orders → payments → checkout
  → **reviews** (→ orders, products)
  → admin (→ orders, products, users, **reviews**), auth
```

No `forwardRef()` anywhere, same rule the scaffold report already committed to.

## 1.4 Verified-purchase rationale (expanded)

This is flagged as the single highest-leverage decision, so the tradeoff deserves more than the one-liner in §0.

**Argument for gating (chosen):** AB Creations is a small, early-stage, custom-printing storefront (§1 of the blueprint: "budget-constrained," two developers, MVP deliberately narrow). At this scale, trust signals carry outsized weight — a handful of fabricated negative reviews (a competitor, a disgruntled non-customer) does much more relative damage than the same handful would on a marketplace absorbing thousands of reviews a day. A verified-purchase gate is the cheapest available control against exactly that risk, and this schema already has every fact needed to enforce it for free (`Order.status`, `OrderItem.productId`) — no new tracking infrastructure required.

**Argument against (rejected, but real):** gating on `DELIVERED` specifically (not `PAID`) means a customer can't review the moment they've paid — they have to wait through the entire fulfillment pipeline (confirm → production → ship → deliver), which for a custom-printed good could be days to weeks. This suppresses review *volume* and *velocity* meaningfully, which matters if the business's actual goal for Phase 10 is "get to 50 reviews fast to look credible," not "every review is trustworthy." If review volume turns out to matter more than review trustworthiness once this ships, the fix is a one-line change (gate on `PAID` or `CONFIRMED` instead of `DELIVERED`) — not a schema change, since `orderItemId` already anchors to the exact item regardless of which status is required at check-time.

**Chosen: `DELIVERED`.** For a physical, custom-printed good, "I paid" doesn't establish "I received a product I can meaningfully evaluate" the way it might for a digital good — and DELIVERED is the one point in the state machine (§14) that means "the customer has the object in hand."

## 1.5 Moderation rationale (expanded)

Pre-moderation (a review sits in a queue, invisible, until an admin approves it) and post-hoc moderation (published immediately, admin can pull it down after the fact) are not mutually exclusive schema-wise — both need the same `status` column, they just differ in what the *default* value is on create and whether product-page reads filter to `PUBLISHED` only (they should, either way).

Given that the schema cost is identical, the decision is really about admin workload and launch friction, not architecture: pre-moderation means every single review — including the overwhelming majority that are fine — sits invisible until an admin (there's exactly one admin role per §6, no moderation team) looks at it. Given R1 already filters out the highest-risk case (a non-purchaser posting anything at all), the marginal abuse pre-moderation catches beyond what R1 already catches is fake positive reviews from a purchaser's own multiple accounts, or genuinely low-quality-but-real reviews — both better handled by R5's after-the-fact removal than by gating every review behind a human first.

## 1.6 Deferred: photo/attachment support (R8, expanded)

Not built in this proposal. Documented here so the eventual work is a clean extension, not a rework:

- `CloudinaryService.CloudinaryUploadOptions.purpose` is currently a literal union `'product' | 'customization'`; it would need a third value, `'review'`, with its own folder tier (`printforge/{env}/reviews/{userId}/`, following the exact two-tier convention `resolveFolder` already implements) and `deliveryType: 'upload'` (public, like product images — a review photo is social proof shown to other shoppers, not a private customization file, so it should never be gated behind a signed URL the way `'customization'` uploads are).
- `UploadsService.create()` currently *infers* `purpose` from the uploader's role (`ADMIN → 'product'`, everyone else → `'customization'`) — see its own doc comment: "Role is looked up fresh here... to keep this change confined to the uploads module." A customer uploading a review photo is a customer, same as one uploading a customization file, so role-inference alone can't distinguish the two cases. `create()` would need an explicit, optional `purpose` override parameter (defaulting to today's role-inference when absent, so every existing caller is unaffected).
- A `ReviewPhoto` join table (`reviewId`, `uploadedFileId`, `sortOrder`) would follow the existing child-table convention (`cart_item_customizations`, `order_item_customizations`, `product_images`) — never an array-of-FK column.
- The real open question this proposal doesn't answer: image *content* moderation. The existing magic-byte/format validation (§22) proves "this is a real PNG/JPEG," not "this image is appropriate to publish publicly." That's a genuinely new category of risk this codebase hasn't had to solve yet (product images are admin-curated; customization files are private, signed-delivery, never publicly rendered). Worth its own short design pass before building, not decided here.

---

# Part B — Coupons

## 2.1 Schema

| Table | Purpose | Key columns (beyond id/timestamps) | FKs | Unique constraints | Key indexes | Invariants |
|---|---|---|---|---|---|---|
| **coupons** | Admin-defined discount codes | `code` (always stored **uppercase** — mirrors `users.email`'s always-lowercase convention, case-insensitive matching), `type` (enum `PERCENTAGE`\|`FLAT_AMOUNT`\|`FREE_SHIPPING`), `percentageOff` (Int 1–100, nullable, populated iff `type=PERCENTAGE`), `flatAmountOff` (`Decimal(10,2)`, nullable, populated iff `type=FLAT_AMOUNT`), `scopeType` (enum `STORE_WIDE`\|`CATEGORY`), `categoryId` (nullable, populated iff `scopeType=CATEGORY`), `minOrderValue` (`Decimal(10,2)`, nullable), `usageLimitTotal` (Int, nullable = unlimited), `usageLimitPerUser` (Int, nullable, default `1`), `usedCount` (Int, default `0`), `firstOrderOnly` (Boolean, default `false`), `startsAt`/`expiresAt` (nullable timestamps), `isActive` (Boolean, default `true`), `description` (nullable, admin-internal note), `createdByAdminId` | `categoryId→categories (SET NULL)`, `createdByAdminId→users (RESTRICT)` | `code` | `code`, `isActive` (checkout-time lookup scan) | Never hard-deleted — `isActive=false` instead, same as `products`/`users`. `code`/`type` immutable after creation (only limits/dates/`isActive`/`description` are admin-editable) — matches `orderNumber`'s immutable-identity precedent. |
| **coupon_usages** | Per-use audit ledger, backs the per-user limit check | `couponId`, `userId`, `orderId`, `discountAppliedAmount` (`Decimal(10,2)`, snapshot) | `couponId→coupons (RESTRICT)`, `userId→users (RESTRICT)`, `orderId→orders (RESTRICT)` | `orderId` (one coupon use per order — structurally enforces C2's no-stacking rule from this side too) | `couponId`+`userId` (the per-user-limit `COUNT` query, §2.6) | Append-only, inserted only inside the same transaction as the order it belongs to. This is the table name `BLUEPRINT-v1.2.md` §13 row M and §15 already reserve — this proposal defines it rather than introducing a differently-shaped table under a new name. |

**Why both `coupon_usages` *and* `Order.couponId`, when either alone could answer "has this user used this coupon":** `Order.couponId`/`Order.discountAmount` is the immutable per-order snapshot (C7 — the same principle as the shipping-address snapshot). `coupon_usages` is the query-optimized ledger purpose-built for the limit checks in §2.6, and it's the name the blueprint already committed to. Keeping both is not redundant hedging — it's "the order remembers what happened to it" plus "the coupon knows who's used it," two different questions answered by two rows written in the same transaction.

**`Order` gains three new columns, and one existing *derived* value gets promoted to real:**

| Column | Type | Status |
|---|---|---|
| `couponId` | `String?`, FK → coupons, `SET NULL` | New |
| `couponCode` | `String?` | New — denormalized snapshot of the code at redemption time, same reasoning as `OrderItem.productNameSnapshot`: display should never require a join back to a table whose row might later change (or, since coupons aren't hard-deleted, might not even matter much here — but it's free and consistent with how every other order-display field is snapshotted). |
| `discountAmount` | `Decimal(10,2)`, default `0`, **never null** | New |
| `shippingFee` | `Decimal(10,2)`, **not currently a column** | **Promoted from derived to stored — see §2.5, this is the load-bearing finding.** |

`categoryId→categories` uses `SET NULL` rather than `RESTRICT` (unlike `products.categoryId`, which is `RESTRICT`): a coupon is optional/incidental to a category's existence, whereas a product genuinely cannot exist without its category. Coupons are never hard-deleted anyway (`isActive=false` is the retirement path), so this FK action is close to moot in practice — `RESTRICT` would be an equally defensible, slightly more conservative choice; `SET NULL` is chosen because nothing about a category's lifecycle should ever be blocked by a stale, inactive coupon pointing at it.

## 2.2 API contract

| Method + Path | Auth | Idempotency | Notes |
|---|---|---|---|
| `GET /admin/coupons`, `GET /admin/coupons/:id` | Admin | N/A | Paginated list; filterable by `isActive`/`type`. |
| `POST /admin/coupons` | Admin | Unique `code` | Whitelisted DTO (`code`, `type`, `percentageOff`\|`flatAmountOff` per type, `scopeType`+`categoryId`, `minOrderValue?`, `usageLimitTotal?`, `usageLimitPerUser?`, `firstOrderOnly?`, `startsAt?`/`expiresAt?`) — same `class-validator` + `whitelist:true, forbidNonWhitelisted:true` convention as every existing admin-mutation DTO (`UpdateOrderStatusDto`, `UpdateProfileDto`). |
| `PATCH /admin/coupons/:id` | Admin | N/A | Edits limits/dates/`isActive`/`description` only — `code` and `type` are rejected by the whitelist if present, mirroring how `UpdateProfileDto` never accepts `email`. |
| `POST /checkout/validate` | Auth | N/A (read-only, no claim) | **Builds out an existing, currently-unimplemented contract row** (§20 of the blueprint already reserves this path; `checkout.controller.ts`'s own doc comment confirms: "not implemented, out of scope for both phases so far"). Body: `{ couponCode? }`. Recomputes the full pricing preview (subtotal, discount, shipping, total) against the caller's *current* cart, **without** claiming a usage slot — no transaction, no `usedCount` increment, no `coupon_usages` insert. Lets the frontend show "Coupon applied: −₹50" before the customer commits to Pay Now. Never authoritative — the real claim only happens inside `POST /checkout/orders`'s transaction (§2.6), same "backend owns all price calculation, frontend result is never trusted" principle (Business Rule 1) applied to a preview as much as a final price. |
| `POST /checkout/orders` | Auth | **Required** `Idempotency-Key` header (unchanged) | `CreateOrderDto` gains one new optional field: `couponCode?: string`. Response (`OrderView`) gains `discountAmount`, `couponCode` (nullable) and — since `shippingFee` is now a real column — that field's value is no longer merely derived. |

**Existing contract row touched, again:** `GET /orders/:id` / `GET /admin/orders/:id` (`OrderDetailView`) gains `discountAmount`, `couponCode`, and `shippingFee` as first-class response fields — today `OrderDetailView` doesn't expose `shippingFee` at all (only checkout's own separate `OrderView` response derives it inline); this is a small, free consistency improvement alongside the coupon fields, not a separate change.

**No new outbox event.** Same reasoning as reviews — a "your coupon is expiring" or "coupon usage limit reached" admin alert is plausible future scope, not required to ship the core feature, and would be its own small design decision about *who* gets notified and *when*, better made once there's a real coupon in production generating real usage patterns.

## 2.3 Module placement

**Module:** `backend/src/coupons/` (+ `dto/`) — `coupons.module.ts`, `coupons.controller.ts`, `coupons.service.ts`.

Unlike reviews, coupons needs **no cross-module import at all**. The one thing that looked like it might need `ProductsModule` — validating that a `CATEGORY`-scope coupon's `categoryId` actually exists — doesn't need `ProductsService`'s business logic, just a flat existence check against the `categories` table, which `CouponsService` can do directly via the global `PrismaService` (the same way `admin.service.ts` already queries `Prisma.User`/`Prisma.Order` directly rather than always routing through another module's service). This makes `CouponsModule` genuinely base-layer — the same tier as `users`/`notifications`/`uploads` — which is the simplest possible placement and the one least likely to ever need revisiting as the module graph grows.

**`CheckoutModule` gains a `CouponsModule` import** (additive to its existing `CartModule`, `ProductsModule`, `UsersModule`, `OrdersModule`, `PaymentsModule`) — this is the one edge that actually matters, since it's what lets `CheckoutService` call `CouponsService.validateAndClaim(...)` inside its own transaction (§2.6).

**`AdminModule` gains a `CouponsModule` import** (additive), for the CRUD surface.

```text
users, notifications, uploads, **coupons**   (base layer)
  → products → cart
  → orders → payments
  → checkout (→ cart, products, users, orders, payments, **coupons**)
  → reviews (→ orders, products)
  → admin (→ orders, products, users, reviews, **coupons**), auth
```

Fully acyclic — `coupons` depends on nothing, and is depended on only by `checkout` and `admin`, both of which already sit at the "may depend on many things" end of the graph.

## 2.4 Why this doesn't change `PricingService`'s method signatures

Tracing `checkout.service.ts`'s `checkout()` method (the actual shipped code, not the blueprint's formula in prose) end to end:

```text
1. lock cart FOR UPDATE
2. claim idempotency key (INSERT...ON CONFLICT)
3. re-load cart items, assertItemsCheckoutable()
4. shippingFeePaise = getShippingFeePaise(tx)          — from app_settings, flat
5. linePricing = cart.items.map(priceItem)              — PricingService.computeLine per item
6. subtotalPaise = PricingService.sumLineTotals(linePricing)
7. totalPaise = PricingService.computeOrderTotal({ subtotalPaise, shippingFeePaise })
8. INSERT Order (subtotal, total, shipping snapshot...)
9. INSERT OrderItems + customizations
10. INSERT OrderStatusHistory
11. recordResult(idempotency claim)
12. clear cart
```

`PricingService.computeOrderTotal` already has this exact signature, unmodified, today:

```typescript
computeOrderTotal(params: {
  subtotalPaise: bigint;
  shippingFeePaise: bigint;
  discountPaise?: bigint;   // ← already exists, always undefined today
}): bigint
```

Its doc comment even says so: *"discount defaults to 0 (no coupons in MVP)."* Nothing about that method needs to change. What changes is **one new step 6.5**, inserted between subtotal computation and total computation, entirely inside `CheckoutService` (calling into the new `CouponsService`):

```text
6.5. IF dto.couponCode provided:
       coupon = CouponsService.validateAndClaim(tx, {
         code, userId, subtotalPaise, cartItems (for CATEGORY scope), idempotency-safe
       })
       → throws (400/409, surfaced to the customer) if invalid/expired/exhausted/
         scope-mismatched/below-minOrderValue/already-used-by-this-user
       → on success: { discountPaise, shippingFeePaise: possibly overridden to 0n }
```

Then step 7 becomes `computeOrderTotal({ subtotalPaise, shippingFeePaise: coupon?.shippingFeePaise ?? shippingFeePaise, discountPaise: coupon?.discountPaise })` and step 8's `Order.create` gains `couponId`, `couponCode`, `discountAmount: paiseToDecimalString(...)`, `shippingFee: paiseToDecimalString(...)`. Every other step is untouched.

**Per-type discount calculation** (all in bigint paise, via the existing `decimalToPaise`/`paiseToDecimalString` boundary functions — never native floats, matching every other money computation in this codebase):

| Type | `discountPaise` | `shippingFeePaise` |
|---|---|---|
| `PERCENTAGE` | `round(scopedSubtotalPaise × percentageOff / 100)` | unchanged (normal flat fee) |
| `FLAT_AMOUNT` | `min(decimalToPaise(flatAmountOff), scopedSubtotalPaise)` — never lets a discount exceed what it's discounting, which would otherwise be able to drive `total` negative | unchanged |
| `FREE_SHIPPING` | `0n` | overridden to `0n` |

**`scopedSubtotalPaise`** matters for `CATEGORY`-scoped coupons: the discount must apply only to the line items whose `product.categoryId` matches the coupon's `categoryId`, not the whole cart — otherwise "10% off all Mugs" would either wrongly discount a T-shirt in the same cart, or the checkout would have to reject mixed-category carts outright (bad UX, not asked for). For `STORE_WIDE` scope, `scopedSubtotalPaise = subtotalPaise` (the whole order). This is computed from data `checkout.service.ts` already has fully loaded at this point in the transaction (`cart.items` with `.product` included) — no new query.

## 2.5 The `shippingFee` finding (C6, expanded)

This is the one piece of this whole proposal that isn't additive in the narrow sense — it's a genuine, if small, change to an existing table, so it gets its own subsection.

`checkout.service.ts`'s `toOrderView()` currently does this:

```typescript
shippingFee: paiseToDecimalString(totalPaise - subtotalPaise),
```

That's correct *today* because, with no coupons, `total = subtotal + shippingFee` always holds, so `total − subtotal` always recovers `shippingFee` exactly. The moment `discountAmount` becomes real and nonzero, the true relationship is `total = subtotal − discountAmount + shippingFee`, so `total − subtotal = shippingFee − discountAmount` — the existing derivation would silently return a **wrong, too-low "shipping fee"** for any discounted order (off by exactly the discount amount), with no error, no test failure unless something specifically checks it, and no visible symptom besides a confusing number on the order confirmation page.

The fix is exactly what §2.1 already lists: `shippingFee` must become a real, explicitly-written column on `Order` (populated at creation, same as `subtotal`/`total` are today), and `toOrderView`'s (and `OrdersService.toListItemView`/`toDetailView`'s) derivation must be deleted in favor of reading the stored column. This is a strictly-improving side effect independent of coupons — `Order.shippingFee` becomes queryable/filterable/reportable in its own right — but it is *caused by* coupons, and any Phase 10 implementation plan needs to budget for it explicitly rather than discover it mid-implementation.

## 2.6 Idempotency and concurrency (C8, expanded)

`BLUEPRINT-v1.2.md` §13 row M already states the reserved design in one sentence: *"usage-limit check + `coupon_usages` insert inside the same locked TXN as order creation, never a separate pre-check."* This section makes that concrete, mirroring the exact CAS pattern `idempotency.service.ts`'s `claim()` method already uses for a structurally identical problem (a limited, contested resource, claimed under concurrency, inside a transaction that might still roll back for unrelated reasons).

**Total usage limit** — one atomic conditional `UPDATE`, race-safe by construction (not check-then-increment):

```sql
UPDATE coupons SET "usedCount" = "usedCount" + 1
WHERE id = $couponId
  AND "isActive" = true
  AND (now() BETWEEN "startsAt" AND "expiresAt" OR "startsAt" IS NULL /* etc. */)
  AND ("usageLimitTotal" IS NULL OR "usedCount" < "usageLimitTotal")
RETURNING id
```

Zero rows returned → the coupon is exhausted, inactive, or out of its date window; the transaction throws (surfaced as `409`, same convention as an illegal order-status transition), and — critically — because this runs inside `CheckoutService`'s existing `$transaction`, that throw rolls back the *entire* checkout attempt, including the idempotency claim from step 2. A customer whose coupon just got claimed out from under them by someone else can retry (with or without the code) using a fresh request; nothing about their retry is left in a half-claimed state, exactly the same guarantee the idempotency claim already provides for the rest of checkout.

**Per-user usage limit** — inside the same transaction, after the total-limit `UPDATE` above succeeds:

```sql
SELECT COUNT(*) FROM coupon_usages WHERE "couponId" = $couponId AND "userId" = $userId
```

compared against `usageLimitPerUser` (default `1`). **This does not need its own row lock or CAS trick**, and this is worth stating explicitly rather than leaving as an unexamined gap: the very first step of the checkout transaction is `SELECT id FROM carts WHERE "userId" = $userId FOR UPDATE` — every user has exactly one cart, so this lock already fully serializes *that specific user's* concurrent checkout attempts (two browser tabs, a double-click that somehow bypasses the idempotency key). By the time a second concurrent attempt from the same user reaches the per-user-limit count, the first has either committed (and its `coupon_usages` row is visible) or rolled back (and doesn't count). The count query rides on infrastructure this transaction already has for an unrelated reason, for free.

If the per-user check fails, throw before the total-usage `coupon_usages` insert — the earlier total-limit `UPDATE` still needs to be *undone*, which happens automatically: nothing has committed yet, so rolling back the transaction reverts the `usedCount` increment along with everything else. No manual compensation logic needed.

**First-order-only** (`firstOrderOnly`) — same transaction, same free ride on the cart lock: `SELECT COUNT(*) FROM orders WHERE "userId" = $userId` (any status — even a cancelled or payment-failed first order still means this isn't their first *attempt*; using "any status" rather than "any PAID-or-later status" is the conservative reading and avoids a customer re-triggering first-order eligibility by abandoning and re-starting checkout).

**Minimum order value** — a plain comparison (`scopedSubtotalPaise >= decimalToPaise(minOrderValue)` for `STORE_WIDE`, or against the category-scoped subtotal for `CATEGORY` scope) against data already loaded in-transaction; not a concurrency concern at all.

---

## 3. What this proposal deliberately does not cover

- **Coupon UI/UX on the frontend** (cart-page coupon-code input, admin coupon-management screens, review-submission form, star-rating display component) — this document is backend-contract-level, matching the blueprint's own split between architecture (this register) and UI/UX detail (§26, explicitly not freeze-protected the same way).
- **Review photo moderation policy** (§1.6) — flagged as needing its own short design pass, not silently deferred without comment.
- **A percentage-off discount cap** (C4) — flagged as a deliberate v1 cut, not an oversight.
- **Any change to the order-status state machine (§14)** — reviews' gate reads `Order.status`, it doesn't add a new status or transition. Coupons don't touch order status at all.
- **Whether a rejected/removed review, or a used-then-cancelled coupon, should ever be reversible in bulk (e.g. an admin "restore" action)** — not asked for by the brief, not designed here; the `status`/`isActive` columns make it a cheap addition later if ever needed.

## 4. Sections of `BLUEPRINT-v1.2.md` this proposal would touch if frozen

Per §38's Architecture Change Procedure, freezing this document is itself a change to sections 15 (schema), 17 (module graph), and 20 (API contract) of the frozen blueprint, and should be submitted as a formal Architecture Change Request referencing this file — not merged silently. This document is written to *be* that ACR's attached proposal, not to bypass the requirement for one.
