import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelController } from './controllers';
import { LabelService } from './services';
import { LabelEntity, NaskahLabelEntity } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([LabelEntity, NaskahLabelEntity])],
  controllers: [LabelController],
  providers: [LabelService],
  exports: [LabelService, TypeOrmModule],
})
export class LabelModule {}
