import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewView } from './dto/review-view.interface';

/**
 * Owns (PHASE-10-PROPOSAL.md §1.2, as scoped for this pass): `POST
 * /reviews` (verified-purchase gated), `PATCH /reviews/:id` and `DELETE
 * /reviews/:id` (author-only — ownership checked in ReviewsService, never
 * inferred from the id alone). The public per-product read lives on
 * ProductReviewsController; admin moderation lives on AdminController
 * (mirrors how order-status transitions are owned by AdminController and
 * delegate to OrdersService, not a separate admin-scoped controller per
 * resource).
 */
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewView> {
    return this.reviewsService.createReview(user.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewView> {
    return this.reviewsService.updateReview(user.id, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewView> {
    return this.reviewsService.removeReview(user.id, id);
  }
}
