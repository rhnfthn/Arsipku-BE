import { Module } from '@nestjs/common';
import { RelationOdService } from './relation_od.service';
import { RelationOdController } from './relation_od.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationOd } from './entities/relation_od.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationOd])],
  controllers: [RelationOdController],
  providers: [RelationOdService],
  exports: [RelationOdService],
})
export class RelationOdModule {}
