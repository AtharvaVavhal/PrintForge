import { useQuery } from '@tanstack/react-query'
import { fetchInvoice, fetchAdminInvoice } from '@/services/api/invoices'

/** Customer: their own paid order's invoice (created lazily, idempotent). */
export function useInvoice(orderId: string | undefined) {
  return useQuery({
    queryKey: ['invoice', orderId],
    queryFn: () => fetchInvoice(orderId as string),
    enabled: Boolean(orderId),
    retry: false,
  })
}

/** Admin: any order's invoice. */
export function useAdminInvoice(orderId: string | undefined) {
  return useQuery({
    queryKey: ['invoice', 'admin', orderId],
    queryFn: () => fetchAdminInvoice(orderId as string),
    enabled: Boolean(orderId),
    retry: false,
  })
}
