// ============================================================
// MODULE: Pedoman
// Deskripsi: Mengelola dokumen Peraturan Direksi, Keputusan
//            Direksi, dan SOP Kearsipan di lingkungan Perum LPPNPI.
// ============================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedomanEntity } from './entities/pedoman.entity';
import { PedomanController } from './controllers/pedoman.controller';
import { PedomanService } from './services/pedoman.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PedomanEntity]), // Registrasi entity ke TypeORM
    StorageModule, // Untuk upload/download file ke MinIO
  ],
  controllers: [PedomanController],
  providers: [PedomanService],
  exports: [PedomanService], // Bisa dipakai module lain
})
export class PedomanModule {}