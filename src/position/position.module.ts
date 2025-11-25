import { Module } from '@nestjs/common';
import { PositionService } from './position.service';
import { PositionController } from './position.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OmPosition } from './entities/om-position.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OmPosition])],
  controllers: [PositionController],
  providers: [PositionService],
})
export class PositionModule {}
