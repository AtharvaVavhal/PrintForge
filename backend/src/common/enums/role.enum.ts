/**
 * User roles — see docs/architecture/BLUEPRINT-v1.2.md §6 (User Roles & RBAC).
 * MVP has exactly two roles; no per-resource permission system.
 */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}
