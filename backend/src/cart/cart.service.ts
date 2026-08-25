import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(cart): getOrCreateForUser, addItem, updateItem, removeItem — all
  // row-locked, all price computation server-side. See §10, §13.
}
