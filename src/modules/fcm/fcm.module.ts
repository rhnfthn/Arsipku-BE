import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmController } from './controllers';
import { FcmService } from './services';
import { FcmTokenEntity } from './entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FcmTokenEntity])],
  controllers: [FcmController],
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}
