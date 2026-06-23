import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedomanEntity } from './entities/pedoman.entity';
import { PedomanController } from './controllers/pedoman.controller';
import { PedomanService } from './services/pedoman.service';

@Module({
  imports: [TypeOrmModule.forFeature([PedomanEntity])],
  controllers: [PedomanController],
  providers: [PedomanService],
  exports: [PedomanService],
})
export class PedomanModule {}