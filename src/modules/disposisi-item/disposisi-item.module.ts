import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisposisiItemController } from './controllers/disposisi_item.controller';
import { DisposisiItemService } from './services/disposisi_item.service';
import { DisposisiItemEntity } from './entities/disposisi_item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DisposisiItemEntity])],
  controllers: [DisposisiItemController],
  providers: [DisposisiItemService],
  exports: [DisposisiItemService, TypeOrmModule],
})
export class DisposisiItemModule {}
