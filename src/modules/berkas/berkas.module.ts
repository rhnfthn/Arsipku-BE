import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Berkas } from './entities/berkas.entity';
import { BerkasController } from './controllers';
import { BerkasService } from './services';

@Module({
  imports: [TypeOrmModule.forFeature([Berkas])],
  controllers: [BerkasController],
  providers: [BerkasService],
  exports: [BerkasService],
})
export class BerkasModule {}
