import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TitelaturEnEntity } from './entities/titelatur-en.entity';
import { TitelaturEnService } from './titelatur-en.service';
import { TitelaturEnController } from './titelatur-en.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TitelaturEnEntity])],
  providers: [TitelaturEnService],
  controllers: [TitelaturEnController],
  exports: [TitelaturEnService],
})
export class TitelaturEnModule {}
