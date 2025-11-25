import { Module } from '@nestjs/common';
import { RelationOscService } from './relation_osc.service';
import { RelationOscController } from './relation_osc.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationOsc } from './entities/relation_osc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationOsc])],
  controllers: [RelationOscController],
  providers: [RelationOscService],
  exports: [RelationOscService],
})
export class RelationOscModule {}
