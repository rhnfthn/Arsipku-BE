import { Module } from '@nestjs/common';
import { RelationOaService } from './relation_oa.service';
import { RelationOaController } from './relation_oa.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationOa } from './entities/relation_oa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationOa])],
  controllers: [RelationOaController],
  providers: [RelationOaService],
  exports: [RelationOaService],
})
export class RelationOaModule {}
