import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubAreaAlamatController } from './controllers/sub_area_alamat.controller';
import { SubAreaAlamatService } from './services/sub_area_alamat.service';
import { SubAreaAlamatEntity } from './entities/sub_area_alamat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubAreaAlamatEntity])],
  controllers: [SubAreaAlamatController],
  providers: [SubAreaAlamatService],
  exports: [SubAreaAlamatService, TypeOrmModule],
})
export class SubAreaAlamatModule {}
