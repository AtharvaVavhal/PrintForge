import { useMutation } from '@tanstack/react-query'
import { retryPayment } from '@/services/api/checkout'

export function useRetryPayment() {
  return useMutation({
    mutationFn: (orderId: string) => retryPayment(orderId),
  })
}
