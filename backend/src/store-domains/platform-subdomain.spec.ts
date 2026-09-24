import { Prisma } from '@prisma/client';
import {
  derivePlatformSubdomain,
  ensurePlatformSubdomain,
  PlatformSubdomainCollisionError,
  PlatformSubdomainInvalidError,
} from './platform-subdomain';

/**
 * Phase 9 W6 — platform-subdomain derivation and the S-5 collision guard
 * (spec §5). The transaction client is a minimal hand-rolled double: these
 * are the exact three queries the helper is allowed to make, and asserting on
 * them directly is what proves the S-5 check happens BEFORE the insert rather
 * than relying on the database backstop.
 */
describe('Phase 9 W6 — platform subdomain provisioning (spec §5 / S-5)', () => {
  describe('derivePlatformSubdomain', () => {
    it('joins slug and platform domain into the normalised lookup key', () => {
      expect(derivePlatformSubdomain('acme', 'stores.printforge.app')).toBe(
        'acme.stores.printforge.app',
      );
    });

    it('normalises case and a trailing dot, matching the resolver key', () => {
      expect(derivePlatformSubdomain('ACME', 'Stores.PrintForge.App.')).toBe(
        'acme.stores.printforge.app',
      );
    });

    it('returns null for a slug that cannot form a valid hostname', () => {
      for (const slug of ['bad slug', 'under_score', '', '-leading']) {
        expect(
          derivePlatformSubdomain(slug, 'stores.printforge.app'),
        ).toBeNull();
      }
    });
  });

  describe('ensurePlatformSubdomain', () => {
    interface Row {
      id: string;
      storeId: string;
      hostname: string;
      isPrimary: boolean;
    }

    function makeTx(rows: Row[]) {
      const created: Prisma.StoreDomainUncheckedCreateInput[] = [];
      const tx = {
        storeDomain: {
          findUnique: ({ where }: { where: { hostname: string } }) =>
            Promise.resolve(
              rows.find((r) => r.hostname === where.hostname) ?? null,
            ),
          findFirst: ({
            where,
          }: {
            where: { storeId: string; isPrimary?: boolean };
          }) =>
            Promise.resolve(
              rows.find(
                (r) => r.storeId === where.storeId && r.isPrimary === true,
              ) ?? null,
            ),
          create: ({
            data,
          }: {
            data: Prisma.StoreDomainUncheckedCreateInput;
          }) => {
            created.push(data);
            return Promise.resolve({ ...data, id: 'new-row' });
          },
        },
      } as unknown as Prisma.TransactionClient;
      return { tx, created };
    }

    const base = {
      storeId: 'store-1',
      tenantId: 'tenant-1',
      storeSlug: 'acme',
      platformStorefrontDomain: 'stores.printforge.app',
    };

    it('creates an always-on VERIFIED row with a null tlsStatus and no token', async () => {
      const { tx, created } = makeTx([]);
      const result = await ensurePlatformSubdomain(tx, base);

      expect(result).toEqual({
        outcome: 'created',
        hostname: 'acme.stores.printforge.app',
        storeDomainId: 'new-row',
      });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        hostname: 'acme.stores.printforge.app',
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        verificationMethod: null,
        verificationToken: null,
        // §7.2 — never consulted for this type; deliberately null, not PENDING.
        tlsStatus: null,
        isPrimary: true,
      });
    });

    it('does NOT claim primary when the store already has a primary domain (§5)', async () => {
      const { tx, created } = makeTx([
        {
          id: 'd1',
          storeId: 'store-1',
          hostname: 'shop.example',
          isPrimary: true,
        },
      ]);
      await ensurePlatformSubdomain(tx, base);
      expect(created[0]).toMatchObject({ isPrimary: false });
    });

    it('is idempotent: an existing row for the SAME store is a no-op', async () => {
      const { tx, created } = makeTx([
        {
          id: 'existing',
          storeId: 'store-1',
          hostname: 'acme.stores.printforge.app',
          isPrimary: true,
        },
      ]);
      const result = await ensurePlatformSubdomain(tx, base);
      expect(result).toEqual({
        outcome: 'existing',
        hostname: 'acme.stores.printforge.app',
        storeDomainId: 'existing',
      });
      expect(created).toHaveLength(0);
    });

    it('S-5: a hostname already held by ANOTHER store fails loudly, before inserting', async () => {
      const { tx, created } = makeTx([
        {
          id: 'other',
          storeId: 'store-OTHER',
          hostname: 'acme.stores.printforge.app',
          isPrimary: true,
        },
      ]);
      await expect(ensurePlatformSubdomain(tx, base)).rejects.toBeInstanceOf(
        PlatformSubdomainCollisionError,
      );
      // The point of S-5: no insert was attempted, and no silent suffixing.
      expect(created).toHaveLength(0);
    });

    it('skips with a named reason when PLATFORM_STOREFRONT_DOMAIN is unset (§5.2)', async () => {
      const { tx, created } = makeTx([]);
      for (const platformStorefrontDomain of [null, '']) {
        const result = await ensurePlatformSubdomain(tx, {
          ...base,
          platformStorefrontDomain,
        });
        expect(result).toEqual({
          outcome: 'skipped',
          reason: 'platform_storefront_domain_not_configured',
        });
      }
      expect(created).toHaveLength(0);
    });

    it('throws rather than inserting garbage when the derived hostname is invalid', async () => {
      const { tx, created } = makeTx([]);
      await expect(
        ensurePlatformSubdomain(tx, { ...base, storeSlug: 'bad slug' }),
      ).rejects.toBeInstanceOf(PlatformSubdomainInvalidError);
      expect(created).toHaveLength(0);
    });
  });
});
