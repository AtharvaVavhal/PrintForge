import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { StoreContextService } from '../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../common/tenant/store-domain-resolution/store-context.service';
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
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly storeContext: StoreContextService,
  ) {}

  // Phase 9 W4 (spec §4.4 "reviews (productId)"): in `host_resolution` mode
  // the client-supplied productId must belong to the resolved store —
  // another store's product is a 404 identical to a nonexistent one.
  @Public()
  @Get()
  async list(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: ListProductReviewsQueryDto,
    @Req() request: StorefrontRequest,
  ): Promise<PaginatedResult<ReviewView>> {
    const scope = await this.storeContext.resolvePublicScope(request);
    return this.reviewsService.listForProduct(productId, query, scope);
  }
}
