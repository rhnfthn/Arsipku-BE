import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiteraturEnEntity } from './entities/literatur-en.entity';
import { LiteraturEnService } from './literatur-en.service';
import { LiteraturEnController } from './literatur-en.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LiteraturEnEntity])],
  providers: [LiteraturEnService],
  controllers: [LiteraturEnController],
  exports: [LiteraturEnService],
})
export class LiteraturEnModule {}
