import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailServiceController } from './controllers';
import { MailServiceService } from './services';
import { MailLogEntity } from './entities';
import { Session } from '../auth/entities/session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MailLogEntity, Session])],
  controllers: [MailServiceController],
  providers: [MailServiceService],
  exports: [MailServiceService],
})
export class MailServiceModule {}