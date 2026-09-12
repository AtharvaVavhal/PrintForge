import type { ApiSuccessResponse } from '@/types/api'
import type { EntitlementResolution, UsageView } from '@/types/entitlements'
import { apiClient } from './client'

/**
 * Thin wrappers over backend/src/admin/admin.controller.ts's Phase 6 W6
 * routes (GET /admin/subscription|usage|entitlements) — same
 * `fetchAdminDashboard`-style convention as services/api/admin.ts. Every
 * request needs the same `dashboard:read` permission the dashboard
 * already requires (ratified — no new permission).
 */

export async function fetchEntitlements(): Promise<EntitlementResolution> {
  const res = await apiClient.get<ApiSuccessResponse<EntitlementResolution>>('/admin/entitlements')
  return res.data.data
}

export async function fetchUsage(): Promise<UsageView> {
  const res = await apiClient.get<ApiSuccessResponse<UsageView>>('/admin/usage')
  return res.data.data
}
