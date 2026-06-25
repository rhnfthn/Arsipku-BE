import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailServiceController } from './controllers';
import { MailServiceService } from './services';
import { MailLogEntity } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([MailLogEntity])],
  controllers: [MailServiceController],
  providers: [MailServiceService],
  exports: [MailServiceService],
})
export class MailServiceModule {}