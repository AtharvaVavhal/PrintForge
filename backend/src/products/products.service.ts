import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(products): list/detail/CRUD for products, categories, variants,
  // customization fields — see BLUEPRINT-v1.2.md §8, §9, §15.
}
