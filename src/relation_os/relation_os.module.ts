import { Module } from '@nestjs/common';
import { RelationOsService } from './relation_os.service';
import { RelationOsController } from './relation_os.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelationOs } from './entities/relation_os.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RelationOs])],
  controllers: [RelationOsController],
  providers: [RelationOsService],
  exports: [RelationOsService],
})
export class RelationOsModule {}
