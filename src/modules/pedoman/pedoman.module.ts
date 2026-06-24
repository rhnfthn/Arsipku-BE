import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedomanEntity } from './entities/pedoman.entity';
import { PedomanController } from './controllers/pedoman.controller';
import { PedomanService } from './services/pedoman.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([PedomanEntity]), StorageModule],
  controllers: [PedomanController],
  providers: [PedomanService],
  exports: [PedomanService],
})
export class PedomanModule {}