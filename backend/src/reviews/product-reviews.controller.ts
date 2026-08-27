import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ReviewsService } from './reviews.service';
import { ListProductReviewsQueryDto } from './dto/list-product-reviews-query.dto';
import { ReviewView } from './dto/review-view.interface';
import { PaginatedResult } from '../common/types/api-response.interface';

/**
 * Split from ReviewsController because its path prefix (`/products/:id/
 * reviews`) genuinely differs from `/reviews` — same reasoning
 * ProductsModule already applies to splitting ProductsController from
 * CategoriesController rather than forcing one controller to own two
 * unrelated base paths.
 */
@Controller('products/:id/reviews')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  async list(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: ListProductReviewsQueryDto,
  ): Promise<PaginatedResult<ReviewView>> {
    return this.reviewsService.listForProduct(productId, query);
  }
}
