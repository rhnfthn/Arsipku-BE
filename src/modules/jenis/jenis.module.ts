import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { JenisController } from './controllers/jenis.controller';
import { JenisService } from './services/jenis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([JenisEntity]),
  ],
  controllers: [JenisController],
  providers: [JenisService],
  exports: [JenisService],
})
export class JenisModule {}
