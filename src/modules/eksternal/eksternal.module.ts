import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EksternalController } from './controllers/eksternal.controller';
import { UsulanTertujuController } from './controllers/usulan-tertuju.controller';
import { EksternalService } from './services/eksternal.service';
import { UsulanTertujuService } from './services/usulan-tertuju.service';
import { EksternalEntity } from './entities/eksternal.entity';
import { UsulanTertujuEksternalEntity } from './entities/usulan-tertuju-eksternal.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { OrganizationTuModule } from '../organization-tu/organization-tu.module';
import { TuGuard } from '../tu-verifikasi/guards/tu-guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([EksternalEntity, UsulanTertujuEksternalEntity]),
    OrgDataModule,
    OrganizationTuModule,
  ],
  controllers: [EksternalController, UsulanTertujuController],
  providers: [EksternalService, UsulanTertujuService, TuGuard],
  exports: [EksternalService, TypeOrmModule],
})
export class EksternalModule {}
