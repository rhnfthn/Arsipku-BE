import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelController } from './controllers/label.controller';
import { LabelService } from './services/label.service';
import { LabelEntity } from './entities/label.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LabelEntity])],
  controllers: [LabelController],
  providers: [LabelService],
  exports: [LabelService, TypeOrmModule],
})
export class LabelModule {}
