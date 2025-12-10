import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EksternalController } from './controllers/eksternal.controller';
import { EksternalService } from './services/eksternal.service';
import { EksternalEntity } from './entities/eksternal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EksternalEntity])],
  controllers: [EksternalController],
  providers: [EksternalService],
  exports: [EksternalService, TypeOrmModule],
})
export class EksternalModule {}
