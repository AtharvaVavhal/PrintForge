/**
 * Mirrors backend/src/auth/auth.service.ts's PublicUser/AuthTokenResult and
 * backend/src/users/dto/user-profile-view.interface.ts's UserProfileView.
 */
export interface PublicUser {
  id: string
  email: string
  role: string
  createdAt: string
}

export interface AuthTokenResult {
  accessToken: string
  user: PublicUser
}

export interface UserProfileView {
  id: string
  email: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  role: string
  createdAt: string
}
