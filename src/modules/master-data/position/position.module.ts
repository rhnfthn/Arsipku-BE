import { Module } from '@nestjs/common';
import { PositionService } from './position.service';
import { PositionController } from './position.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OmPosition } from './entities/om-position.entity';
import { RelationOs } from '../relation_os/entities/relation_os.entity';
import { RelationOsc } from '../relation_osc/entities/relation_osc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OmPosition, RelationOs, RelationOsc])],
  controllers: [PositionController],
  providers: [PositionService],
})
export class PositionModule {}
