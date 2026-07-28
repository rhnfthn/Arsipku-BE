import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferInactiveFileEntity } from './entities/transfer-inactive-file.entity';
import { TransferInactiveFileService } from './services/transfer-inactive-file.service';
import { TransferInactiveFileController } from './controllers/transfer-inactive-file.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferInactiveFileEntity]),
    AuditModule,
  ],
  controllers: [TransferInactiveFileController],
  providers: [TransferInactiveFileService],
  exports: [TransferInactiveFileService],
})
export class TransferInactiveFileModule {}
