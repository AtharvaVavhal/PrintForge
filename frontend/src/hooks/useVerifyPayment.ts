import { useMutation } from '@tanstack/react-query'
import { verifyPayment } from '@/services/api/payments'
import type { VerifyPaymentPayload } from '@/types/payments'

export function useVerifyPayment() {
  return useMutation({
    mutationFn: (payload: VerifyPaymentPayload) => verifyPayment(payload),
  })
}
