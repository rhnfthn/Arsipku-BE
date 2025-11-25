import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AreaService } from './area.service';
import { AreaController } from './area.controller';
import { OmArea } from './entities/om-area.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OmArea])],
  controllers: [AreaController],
  providers: [AreaService],
})
export class AreaModule {}
