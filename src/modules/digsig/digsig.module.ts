import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigsigController } from './controllers';
import { DigsigService } from './services';

@Module({
  imports: [],
  controllers: [DigsigController],
  providers: [DigsigService],
  exports: [DigsigService],
})
export class DigsigModule {}
