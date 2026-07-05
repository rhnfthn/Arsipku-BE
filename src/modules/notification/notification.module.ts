import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './controllers';
import { NotificationService } from './services';
import { NotificationGateway } from './gateways';
import { NotificationEntity } from './entities';
import { FcmModule } from '../fcm/fcm.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    AuthModule,
    FcmModule,
    RealtimeModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
