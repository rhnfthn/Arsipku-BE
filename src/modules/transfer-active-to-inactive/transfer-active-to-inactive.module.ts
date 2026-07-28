import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferActiveToInactiveEntity } from './entities/transfer-active-to-inactive.entity';
import { TransferActiveToInactiveService } from './services/transfer-active-to-inactive.service';
import { TransferActiveToInactiveController } from './controllers/transfer-active-to-inactive.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferActiveToInactiveEntity]),
    AuditModule,
  ],
  controllers: [TransferActiveToInactiveController],
  providers: [TransferActiveToInactiveService],
  exports: [TransferActiveToInactiveService],
})
export class TransferActiveToInactiveModule {}