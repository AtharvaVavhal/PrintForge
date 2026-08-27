import { ReviewStatus } from '@prisma/client';

/**
 * Read-side response shape — not a request DTO. Shared across the public
 * per-product list, the author's own create/edit/remove responses, and the
 * admin moderation response; `status` is always PUBLISHED on the public
 * list (ReviewsService.listForProduct filters to it), so including the
 * field uniformly here doesn't leak anything extra there.
 */
export interface ReviewView {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  bodyText: string | null;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}
