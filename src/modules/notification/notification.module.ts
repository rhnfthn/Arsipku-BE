import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './controllers';
import { NotificationService } from './services';
import { NotificationEntity } from './entities';
import { FcmModule } from '../fcm/fcm.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    FcmModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
