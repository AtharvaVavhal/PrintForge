jest.mock('@sentry/node');
import * as Sentry from '@sentry/node';
import { BadRequestException, Logger } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS,
  STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION,
  STOREFRONT_RESOLUTION_MODE_KEY,
} from './storefront-resolution-mode.constants';
import { StorefrontResolutionModeService } from './storefront-resolution-mode.service';
import { StorefrontResolutionModeUnavailableException } from './storefront-resolution-mode-unavailable.exception';

const captureMessage = Sentry.captureMessage as jest.Mock;
/** Second argument of the n-th Sentry.captureMessage call, typed. */
function sentryContext(n = 0): Record<string, unknown> {
  const call = captureMessage.mock.calls[n] as unknown[];
  return call[1] as Record<string, unknown>;
}
/** First argument of the n-th Logger.error call, as a string. */
function loggedError(spy: jest.SpyInstance, n = 0): string {
  const call = spy.mock.calls[n] as unknown[];
  return String(call[0]);
}

/**
 * Phase 9 W2 — unit coverage of the P9-D8 kill-switch reader/writer (spec
 * §15) and every P9-S14 fail-closed path (spec §14.3). The e2e file
 * `test/e2e/storefront-resolution-mode.e2e-spec.ts` covers the same
 * semantics through the real routes, guards and database; this file
 * covers what e2e cannot cheaply reach — a thrown DB read, exact cache /
 * TTL timing, and the audit payload — with a fake Prisma.
 */
describe('StorefrontResolutionModeService (Phase 9 W2 — P9-D8 / P9-S14)', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const logPlatformAction = jest.fn();
  const $transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ platformConfig: { findUnique, upsert } }),
  );
  const prisma = {
    platformConfig: { findUnique },
    $transaction,
  } as unknown as ConstructorParameters<
    typeof StorefrontResolutionModeService
  >[0];
  const audit = { logPlatformAction } as unknown as AuditService;
  const actor = { id: 'super-admin-1' } as AuthenticatedUser;

  let service: StorefrontResolutionModeService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-20T12:00:00Z') });
    findUnique.mockReset();
    upsert.mockReset();
    logPlatformAction.mockReset();
    $transaction.mockClear();
    captureMessage.mockClear();
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = new StorefrontResolutionModeService(prisma, audit);
  });

  afterEach(() => {
    loggerError.mockRestore();
    jest.useRealTimers();
  });

  describe('getMode() — read path', () => {
    it('absent row → legacy_single_store, source "default" (spec §15 default)', async () => {
      findUnique.mockResolvedValueOnce(null);
      await expect(service.getMode()).resolves.toEqual({
        mode: 'legacy_single_store',
        source: 'default',
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        select: { value: true },
      });
      expect(captureMessage).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('valid legacy_single_store row → that mode, source "row"', async () => {
      findUnique.mockResolvedValueOnce({ value: 'legacy_single_store' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'legacy_single_store',
        source: 'row',
      });
    });

    it('valid host_resolution row → that mode, source "row"', async () => {
      findUnique.mockResolvedValueOnce({ value: 'host_resolution' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'host_resolution',
        source: 'row',
      });
    });

    it('caches a successful read for exactly one TTL (one DB read per window), then re-reads', async () => {
      findUnique.mockResolvedValue({ value: 'host_resolution' });
      await service.getMode();
      await service.getMode();
      await service.getMode();
      expect(findUnique).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS - 1);
      await service.getMode();
      expect(findUnique).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      await service.getMode();
      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('bust() forces the next getMode() to re-read without waiting for the TTL', async () => {
      findUnique.mockResolvedValueOnce({ value: 'legacy_single_store' });
      await service.getMode();
      service.bust();
      findUnique.mockResolvedValueOnce({ value: 'host_resolution' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'host_resolution',
        source: 'row',
      });
      expect(findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMode() — P9-S14 fail-closed: invalid stored value', () => {
    it.each(['legacy', '', 'HOST_RESOLUTION', ' host_resolution', 'both'])(
      'invalid value %j with NO last-known valid mode → 503, error log, Sentry — never legacy',
      async (bad) => {
        findUnique.mockResolvedValueOnce({ value: bad });
        await expect(service.getMode()).rejects.toBeInstanceOf(
          StorefrontResolutionModeUnavailableException,
        );
        expect(loggerError).toHaveBeenCalledTimes(1);
        expect(loggedError(loggerError)).toContain('P9-S14 fail-closed');
        expect(captureMessage).toHaveBeenCalledTimes(1);
        expect(sentryContext()).toMatchObject({
          level: 'error',
          tags: { kind: 'invalid_value', key: STOREFRONT_RESOLUTION_MODE_KEY },
          extra: { rawValue: bad, lastKnownValidMode: null },
        });
      },
    );

    it('invalid value WITH a last-known valid mode → serves that mode, source "last_known_valid"; still logs + Sentry', async () => {
      findUnique.mockResolvedValueOnce({ value: 'host_resolution' });
      await service.getMode();
      jest.advanceTimersByTime(STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS);

      findUnique.mockResolvedValueOnce({ value: 'garbage' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'host_resolution',
        source: 'last_known_valid',
      });
      expect(loggerError).toHaveBeenCalledTimes(1);
      expect(captureMessage).toHaveBeenCalledTimes(1);
      expect(sentryContext()).toMatchObject({
        extra: { rawValue: 'garbage', lastKnownValidMode: 'host_resolution' },
      });
    });

    it('the invalid value is never cached as valid: after a fix (bust), the next read returns the fixed row', async () => {
      findUnique.mockResolvedValueOnce({ value: 'nonsense' });
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      service.bust();
      findUnique.mockResolvedValueOnce({ value: 'legacy_single_store' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'legacy_single_store',
        source: 'row',
      });
    });

    it('a failed read is negatively cached for one TTL: repeated requests do not re-read or re-alert, then the row is re-read', async () => {
      findUnique.mockResolvedValue({ value: 'nonsense' });
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(captureMessage).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS);
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      expect(findUnique).toHaveBeenCalledTimes(2);
      expect(captureMessage).toHaveBeenCalledTimes(2);
    });

    it('an invalid value seen FIRST does not become "last-known valid" for a later failure', async () => {
      findUnique.mockResolvedValueOnce({ value: 'nonsense' });
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      jest.advanceTimersByTime(STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS);
      findUnique.mockRejectedValueOnce(new Error('connection reset'));
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
    });
  });

  describe('getMode() — S-13 fail-closed: database read error', () => {
    it('read error with NO cached valid mode → 503 (no silent mode guess); Sentry tagged read_error', async () => {
      findUnique.mockRejectedValueOnce(new Error('connection reset'));
      await expect(service.getMode()).rejects.toBeInstanceOf(
        StorefrontResolutionModeUnavailableException,
      );
      expect(sentryContext()).toMatchObject({
        tags: { kind: 'read_error' },
        extra: { readError: 'connection reset' },
      });
    });

    it('read error WITH a cached valid mode → that mode, source "last_known_valid"', async () => {
      findUnique.mockResolvedValueOnce({ value: 'legacy_single_store' });
      await service.getMode();
      jest.advanceTimersByTime(STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS);
      findUnique.mockRejectedValueOnce(new Error('connection reset'));
      await expect(service.getMode()).resolves.toEqual({
        mode: 'legacy_single_store',
        source: 'last_known_valid',
      });
    });
  });

  describe('setMode() — write path (spec §15 "Who may flip")', () => {
    it('upserts the row and writes the PlatformAuditLog row in one transaction with metadata { from, to }, then busts the cache', async () => {
      findUnique.mockResolvedValueOnce(null); // getMode: absent → default
      await service.getMode();

      findUnique.mockResolvedValueOnce(null); // inside the transaction: no prior row
      upsert.mockResolvedValueOnce({});
      await expect(
        service.setMode(actor, 'host_resolution', 'W8 cutover', '10.0.0.1'),
      ).resolves.toEqual({ mode: 'host_resolution', source: 'row' });

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        create: {
          key: STOREFRONT_RESOLUTION_MODE_KEY,
          value: 'host_resolution',
          updatedByUserId: 'super-admin-1',
        },
        update: { value: 'host_resolution', updatedByUserId: 'super-admin-1' },
      });
      expect(logPlatformAction).toHaveBeenCalledWith(expect.anything(), {
        actorUserId: 'super-admin-1',
        action: STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION,
        targetType: 'PlatformConfig',
        targetId: STOREFRONT_RESOLUTION_MODE_KEY,
        justification: 'W8 cutover',
        metadata: { from: null, to: 'host_resolution' },
        ip: '10.0.0.1',
      });

      // cache busted: the next getMode() re-reads and sees the new row
      findUnique.mockResolvedValueOnce({ value: 'host_resolution' });
      await expect(service.getMode()).resolves.toEqual({
        mode: 'host_resolution',
        source: 'row',
      });
    });

    it('records the raw prior value as `from` — including an invalid one being repaired', async () => {
      findUnique.mockResolvedValueOnce({ value: 'garbage' });
      upsert.mockResolvedValueOnce({});
      await service.setMode(actor, 'legacy_single_store', 'repair', '::1');
      expect((logPlatformAction.mock.calls[0] as unknown[])[1]).toMatchObject({
        metadata: { from: 'garbage', to: 'legacy_single_store' },
      });
    });

    it('rejects an invalid mode defensively (the DTO is the primary 400 gate) without touching the database', async () => {
      await expect(
        service.setMode(
          actor,
          'legacy' as unknown as 'host_resolution',
          'oops',
          '::1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect($transaction).not.toHaveBeenCalled();
    });
  });
});
