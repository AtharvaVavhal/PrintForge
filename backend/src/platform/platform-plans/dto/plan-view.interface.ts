/** GET/POST/PATCH /platform/plans[/:id] response shape. */
export interface PlanView {
  id: string;
  key: string;
  name: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  isEnterpriseCustom: boolean;
  createdAt: Date;
}

export interface PlanFeatureView {
  id: string;
  planId: string;
  featureKey: string;
  enabled: boolean;
}

export interface PlanLimitView {
  id: string;
  planId: string;
  limitKey: string;
  limitValue: number | null;
  period: 'PERSISTENT' | 'BILLING_PERIOD';
}

export interface EntitlementOverrideView {
  id: string;
  tenantId: string;
  featureKey: string | null;
  limitKey: string | null;
  boolValue: boolean | null;
  intValue: number | null;
  reason: string;
  createdByUserId: string;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
