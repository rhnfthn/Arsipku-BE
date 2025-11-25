import { Module } from '@nestjs/common';
import { AreasubService } from './areasub.service';
import { AreasubController } from './areasub.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OmAreaSub } from './entities/om-areasub.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OmAreaSub])],
  controllers: [AreasubController],
  providers: [AreasubService],
})
export class AreasubModule {}
