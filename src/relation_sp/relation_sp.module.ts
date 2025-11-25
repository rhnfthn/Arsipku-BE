import { Module } from '@nestjs/common';
import { RelationSpService } from './relation_sp.service';
import { RelationSpController } from './relation_sp.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationSp } from './entities/relation_sp.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationSp])],
  controllers: [RelationSpController],
  providers: [RelationSpService],
  exports: [RelationSpService],
})
export class RelationSpModule {}
