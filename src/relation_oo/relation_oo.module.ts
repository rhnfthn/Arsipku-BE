import { Module } from '@nestjs/common';
import { RelationOoService } from './relation_oo.service';
import { RelationOoController } from './relation_oo.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationOo } from './entities/relation_oo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationOo])],
  controllers: [RelationOoController],
  providers: [RelationOoService],
  exports: [RelationOoService],
})
export class RelationOoModule {}
