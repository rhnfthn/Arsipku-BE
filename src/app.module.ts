import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { CompanyModule } from './modules/master-data/company/company.module';
import { AreaModule } from './modules/master-data/area/area.module';
import { AreasubModule } from './modules/master-data/areasub/areasub.module';
import { OrganizationModule } from './modules/master-data/organization/organization.module';
import { PositionModule } from './modules/master-data/position/position.module';
import { PersonModule } from './modules/master-data/person/person.module';
import { RelationOoModule } from './modules/master-data/relation_oo/relation_oo.module';
import { RelationOaModule } from './modules/master-data/relation_oa/relation_oa.module';
import { RelationOsModule } from './modules/master-data/relation_os/relation_os.module';
import { RelationOscModule } from './modules/master-data/relation_osc/relation_osc.module';
import { RelationSpModule } from './modules/master-data/relation_sp/relation_sp.module';
import { OrgDataModule } from './modules/master-data/org_data/org_data.module';
import { RelationOdModule } from './modules/master-data/relation_od/relation_od.module';
import { DisposisiModule } from './modules/disposisi/disposisi.module';
import { NotaDinasModule } from './modules/nota-dinas/nota-dinas.module';
import { SuratDinasInternalModule } from './modules/surat-dinas-internal/surat-dinas-internal.module';
import { SuratDinasEksternalModule } from './modules/surat-dinas-eksternal/surat-dinas-eksternal.module';
import { KajianModule } from './modules/kajian/kajian.module';
import { LabelModule } from './modules/label/label.module';
import { KlasifikasiModule } from './modules/klasifikasi/klasifikasi.module';
import { DisposisiItemModule } from './modules/disposisi-item/disposisi-item.module';
import { SubAreaAlamatModule } from './modules/sub-area-alamat/sub-area-alamat.module';
import { EksternalModule } from './modules/eksternal/eksternal.module';
import { GrupPenerimaModule } from './modules/grup-penerima/grup-penerima.module';
import { GrupPenerimaDetailModule } from './modules/grup-penerima-detail/grup-penerima-detail.module';
import { NaskahModule } from './modules/naskah/naskah.module';
import { NaskahSirkulasiModule } from './modules/naskah-sirkulasi/naskah-sirkulasi.module';
import { NaskahLampiranModule } from './modules/naskah-lampiran/naskah-lampiran.module';
import { NaskahReferensiModule } from './modules/naskah-referensi/naskah-referensi.module';
import { DraftModule } from './modules/draft/draft.module';
import { KonsepModule } from './modules/konsep/konsep.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TemplateModule } from './modules/template/template.module';
import { TitelaturEnModule } from './modules/titelatur-en/titelatur-en.module';
import { StorageModule } from './modules/storage/storage.module';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { BerkasModule } from './modules/berkas/berkas.module';
import { AdminModule } from './modules/admin/admin.module';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // hanya untuk development
        extra: {
          maxAllowedPacket: 268435456, // 256MB - untuk handle large org_data
        },
      }),
    }),
    CompanyModule,
    AreaModule,
    AreasubModule,
    OrganizationModule,
    PositionModule,
    PersonModule,
    RelationOoModule,
    RelationOaModule,
    RelationOsModule,
    RelationOscModule,
    RelationSpModule,
    OrgDataModule,
    RelationOdModule,
    DisposisiModule,
    NotaDinasModule,
    SuratDinasInternalModule,
    SuratDinasEksternalModule,
    KajianModule,
    LabelModule,
    KlasifikasiModule,
    DisposisiItemModule,
    SubAreaAlamatModule,
    EksternalModule,
    GrupPenerimaModule,
    GrupPenerimaDetailModule,
    NaskahModule,
    NaskahSirkulasiModule,
    NaskahLampiranModule,
    NaskahReferensiModule,
    DraftModule,
    KonsepModule,
    DashboardModule,
    TemplateModule,
    TitelaturEnModule,
    StorageModule,
    UploadModule,
    AuthModule,
    BerkasModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      // Set max_allowed_packet untuk handle large org_data (256MB)
      await this.dataSource.query('SET GLOBAL max_allowed_packet = 268435456');
      console.log('✅ MySQL max_allowed_packet set to 256MB');
    } catch (error) {
      console.warn('⚠️ Could not set max_allowed_packet (might need SUPER privilege):', error.message);
    }
  }
}
