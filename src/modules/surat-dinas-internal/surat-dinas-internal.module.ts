import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuratDinasInternalController } from './controllers/surat-dinas-internal.controller';
import { SuratDinasInternalService } from './services/surat-dinas-internal.service';
// SdiSdeEntity removed - data now stored in naskah and naskah_sirkulasi
import { NaskahEntity } from '../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../shared/entities/naskah_lampiran.entity';
import { NomorEntity } from '../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../nomor/entities/jenis.entity';
import { Session } from '../auth/entities/session.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { NomorSuratService } from '../../shared/services/nomor-surat.service';
import { StorageModule } from '../storage/storage.module';
import { GeneratePdfModule } from '../generate_pdf/generate_pdf.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { DigsigModule } from '../digsig/digsig.module';
import { SearchModule } from '../search/search.module';
import { GrupPenerimaModule } from '../grup-penerima/grup-penerima.module';
import { NaskahSirkulasiModule } from '../naskah-sirkulasi/naskah-sirkulasi.module';
import { KonsepModule } from '../konsep/konsep.module';
import { CorrespondenceRoutingRole } from '../correspondence-routing/entities/correspondence-routing-role.entity';
import { CorrespondenceRoutingRoleMember } from '../correspondence-routing/entities/correspondence-routing-role-member.entity';
import { CorrespondenceRoutingRule } from '../correspondence-routing/entities/correspondence-routing-rule.entity';
import { CorrespondenceRoutingRuleScope } from '../correspondence-routing/entities/correspondence-routing-rule-scope.entity';
import { NaskahRoutingApplied } from '../correspondence-routing/entities/naskah-routing-applied.entity';
import { CorrespondenceRoutingResolverService } from '../correspondence-routing/services/correspondence-routing-resolver.service';
import { RoutingConfigCacheService } from '../correspondence-routing/services/routing-config-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // SdiSdeEntity removed - no longer needed
      NaskahEntity,
      NaskahSirkulasi,
      NaskahLampiranEntity,
      NomorEntity,
      NomorRequestEntity,
      NomorRequestDetailEntity,
      JenisEntity,
      Session,
      CorrespondenceRoutingRole,
      CorrespondenceRoutingRoleMember,
      CorrespondenceRoutingRule,
      CorrespondenceRoutingRuleScope,
      NaskahRoutingApplied,
    ]),
    OrgDataModule,
    StorageModule,
    GeneratePdfModule,
    SubAreaAlamatModule,
    DigsigModule,
    SearchModule,
    GrupPenerimaModule,
    KonsepModule,
    NaskahSirkulasiModule,
  ],
  controllers: [SuratDinasInternalController],
  providers: [
    SuratDinasInternalService,
    NomorSuratService,
    CorrespondenceRoutingResolverService,
    RoutingConfigCacheService,
  ],
  exports: [SuratDinasInternalService],
})
export class SuratDinasInternalModule {}
