import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabelController } from './controllers';
import { LabelService } from './services';
import { LabelEntity, NaskahLabelEntity } from './entities';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LabelEntity, NaskahLabelEntity]),
    RealtimeModule,
  ],
  controllers: [LabelController],
  providers: [LabelService],
  exports: [LabelService, TypeOrmModule],
})
export class LabelModule {}
