import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UsulanAksesBerkasEntity,
  VerificationStepEntity,
  UsulanBerkasEntity,
  AksesBerkasEntity,
} from './entities';
import { Berkas } from '../berkas/entities/berkas.entity';
import { DelegasiEntity } from '../delegasi/entities/delegasi.entity';
import { UsulanAksesBerkasController } from './controllers';
import { UsulanAksesBerkasService } from './services';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsulanAksesBerkasEntity,
      VerificationStepEntity,
      UsulanBerkasEntity,
      AksesBerkasEntity,
      Berkas,
      DelegasiEntity,
    ]),
    OrgDataModule,
    NotificationModule,
  ],
  controllers: [UsulanAksesBerkasController],
  providers: [UsulanAksesBerkasService],
  exports: [UsulanAksesBerkasService],
})
export class UsulanAksesBerkasModule {}