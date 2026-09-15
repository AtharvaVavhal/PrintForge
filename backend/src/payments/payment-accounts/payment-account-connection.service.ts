import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentAccountStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';
import {
  RazorpayAccountCredentials,
  RazorpayAccountVerificationError,
  RazorpayAccountVerifierService,
} from '../razorpay/razorpay-account-verifier.service';
import { ConnectRazorpayAccountDto } from './dto/connect-razorpay-account.dto';
import { PaymentAccountView } from './dto/payment-account-view.interface';
import { PaymentAccountsService } from './payment-accounts.service';

/**
 * Phase 8 (P8-5) orchestration for `POST /admin/payment-accounts/:id/
 * connect` — the one "cohesive connection operation" combining "submit/
 * update credentials" and "test/verify the connection" (task scope item 6)
 * so no second endpoint is needed.
 *
 * Ties together three single-purpose collaborators without itself
 * containing Razorpay SDK calls or decrypting anything — both stay behind
 * `RazorpayAccountVerifierService`, the provider-adapter boundary (P8-D6
 * §7). This class only ENCRYPTS fresh, caller-supplied plaintext before
 * handing it to `PaymentAccountsService.configureCredentials` for atomic
 * persistence; encrypting fresh input is not the same "decrypt stored
 * ciphertext" concern the boundary rule restricts to the adapter.
 *
 * Two modes, selected by whether the request body supplies credentials:
 *  - `keyId` + `keySecret` given: verify the fresh pair, and ONLY on
 *    success persist (encrypted) + activate. A failed verification leaves
 *    any previously-stored credentials and the account's status untouched
 *    — nothing is written before verification succeeds.
 *  - neither given ("test connection"): decrypt and re-verify whatever is
 *    already stored, no new persistence.
 *
 * Activation only runs when the account isn't already ACTIVE — reuses
 * `PaymentAccountsService.activate()` unchanged, so every CAS/state-machine
 * rule from P8-4 (`isPaymentAccountTransitionAllowed`) still applies
 * exactly as written; this class adds no new transition edge and never
 * bypasses the CAS update.
 */
@Injectable()
export class PaymentAccountConnectionService {
  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly razorpayAccountVerifier: RazorpayAccountVerifierService,
  ) {}

  async connect(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    id: string,
    dto: ConnectRazorpayAccountDto,
  ): Promise<PaymentAccountView> {
    const tenantId = tenantContext.tenantId;
    // Tenant-checked, 404s (never 403) on a cross-tenant id via getOne's
    // own assertObjectInTenant — same existence-leak discipline as every
    // other route on this controller.
    const account = await this.paymentAccountsService.getOne(tenantId, id);

    const submittingFresh =
      dto.keyId !== undefined || dto.keySecret !== undefined;

    if (submittingFresh) {
      if (!dto.keyId || !dto.keySecret) {
        throw new BadRequestException(
          'keyId and keySecret must both be provided together',
        );
      }
      const credentials: RazorpayAccountCredentials = {
        keyId: dto.keyId,
        keySecret: dto.keySecret,
        webhookSecret: dto.webhookSecret,
      };

      await this.verify(() =>
        this.razorpayAccountVerifier.verifyCredentials(credentials),
      );

      // Only reached after a successful verification — nothing is ever
      // persisted from an unverified submission.
      const encrypted = this.credentialEncryption.encrypt(
        JSON.stringify(credentials),
      );
      await this.paymentAccountsService.configureCredentials(
        tenantContext,
        actor,
        id,
        encrypted,
      );
    } else {
      const stored = await this.paymentAccountsService.getEncryptedCredentials(
        tenantId,
        id,
      );
      if (!stored) {
        throw new BadRequestException(
          'No Razorpay credentials configured for this payment account yet — submit keyId and keySecret to connect.',
        );
      }
      await this.verify(() =>
        this.razorpayAccountVerifier.verifyStoredCredentials(stored),
      );
    }

    if (account.status !== PaymentAccountStatus.ACTIVE) {
      await this.paymentAccountsService.activate(tenantContext, actor, id);
    }

    return this.paymentAccountsService.getOne(tenantId, id);
  }

  /** Translates a verification failure into a clean 422 — never the raw
   * provider error (the thrown error's `message` is already the one fixed,
   * safe string `RazorpayAccountVerifierService` always uses). Nothing
   * above this call has persisted or activated anything yet, so a failure
   * here leaves the account exactly as it was. */
  private async verify(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (err instanceof RazorpayAccountVerificationError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }
}
