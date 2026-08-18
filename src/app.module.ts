import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { PemeliharaanAccessGuard } from './common/guards/pemeliharaan-access.guard';
import { CommonGuardsModule } from './common/guards/common-guards.module';
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
import { NaskahDinasModule } from './modules/naskah-dinas/naskah-dinas.module';
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
import { TemplateSuratModule } from './modules/template-surat/template-surat.module';
import { TitelaturEnModule } from './modules/titelatur-en/titelatur-en.module';
import { StorageModule } from './modules/storage/storage.module';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { BerkasModule } from './modules/berkas/berkas.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { NomorModule } from './modules/nomor/nomor.module';
import { RekapNaskahModule } from './modules/rekap-naskah/rekap-naskah.module';
import { JenisModule } from './modules/jenis/jenis.module';
import { DataSource } from 'typeorm';
import { DigsigModule } from './modules/digsig/digsig.module';
import { DelegasiModule } from './modules/delegasi/delegasi.module';
import { SearchModule } from './modules/search/search.module';
import { FcmModule } from './modules/fcm/fcm.module';
import { NotificationModule } from './modules/notification/notification.module';
import { CompanySwitchModule } from './modules/company-switch/company-switch.module';
import { ConfigAdminModule } from './modules/config/config.module';
import { FaqModule } from './modules/faq/faq.module';
import { PedomanModule } from './modules/pedoman/pedoman.module';
import { ShortUrlModule } from './modules/short-url/short-url.module';
import { MailServiceModule } from './modules/mail-service/mail-service.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AiModule } from './modules/ai/ai.module';
import { OnlyOfficeModule } from './modules/onlyoffice/onlyoffice.module';
import { NaskahUmumModule } from './modules/naskah-umum/naskah-umum.module';
import { ArsipDinamisModule } from './modules/arsip-dinamis/arsip-dinamis.module';
import { NaskahShareModule } from './modules/naskah-share/naskah-share.module';
import { UsulanAksesBerkasModule } from './modules/usulan-akses-berkas/usulan-akses-berkas.module';
import { AuditModule } from './modules/audit/audit.module';
import { SdeMasalModule } from './modules/sde-masal/sde-masal.module';
import { SentryModule } from './modules/sentry/sentry.module';
import { UsulanPindahModule } from './modules/usulan-pindah/usulan-pindah.module';
import { TransferInactiveFileModule } from './modules/transfer-inactive-file/transfer-inactive-file.module';
import { TransferActiveToInactiveModule } from './modules/transfer-active-to-inactive/transfer-active-to-inactive.module';
import { OrganizationTuModule } from './modules/organization-tu/organization-tu.module';
import { TuVerifikasiModule } from './modules/tu-verifikasi/tu-verifikasi.module';
import { PenyusutanModule } from './modules/penyusutan/penyusutan.module';
import { ArsipModule } from './modules/arsip/arsip.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonGuardsModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 menit
        limit: 60, // baseline (dipakai bila ada @UseGuards(ThrottlerGuard) tanpa @Throttle override)
      },
      {
        name: 'auth',
        ttl: 60000, // 1 menit
        limit: 10, // login/verify/refresh token
      },
      {
        name: 'sign',
        ttl: 60000, // 1 menit
        limit: 5, // BSrE sign — paling ketat (passphrase brute force protection)
      },
    ]),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const store = new KeyvRedis(process.env.REDIS_URL, {
          throwOnConnectError: false,
        });
        store.client.on('error', (err: Error) => {
          // eslint-disable-next-line no-console
          console.warn('[RedisCache] connection error:', err?.message ?? err);
        });
        return {
          stores: [store],
          namespace: 'arsipku',
          ttl: 120_000,
        };
      },
    }),
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
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: false,
        timezone: '+07:00', // Force WIB timezone untuk konsistensi timestamp
      }),
    }),
    // ─── Archive DB (MySQL: arsipku_arsip_local) ──────────────────────────
    // Koneksi kedua untuk backup arsip inaktif/musnah/permanen.
    // Entity-nya pakai pattern *.archive-entity.ts agar tidak ikut ke DB utama.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      name: 'archiveConnection',
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('ARCHIVE_DB_HOST') ?? config.get('DB_HOST'),
        port: config.get<number>('ARCHIVE_DB_PORT') ?? config.get<number>('DB_PORT'),
        username: config.get('ARCHIVE_DB_USER') ?? config.get('DB_USER'),
        password: config.get('ARCHIVE_DB_PASS') ?? config.get('DB_PASS'),
        database: config.get('ARCHIVE_DB_NAME') ?? 'arsipku_arsip_local',
        entities: [__dirname + '/**/*.archive-entity{.ts,.js}'],
        synchronize: false,
        timezone: '+07:00',
      }),
    }),
    // ─── Audit Trail DB (MongoDB: arsipku_audit) ────────────────────────────
    // Database audit trail pindah ke MongoDB. Data utama Arsipku tetap di MySQL.
    // Aktif/nonaktif via env: MONGODB_ENABLED=true|false (default: nonaktif).
    // Saat nonaktif, audit service no-op (model di-inject @Optional).
    ...(process.env.MONGODB_ENABLED === 'true'
      ? [
          MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              uri: config.get<string>('MONGODB_URI'),
            }),
          }),
        ]
      : []),
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
    NaskahDinasModule,
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
    TemplateSuratModule,
    TitelaturEnModule,
    StorageModule,
    UploadModule,
    AuthModule,
    BerkasModule,
    SuperadminModule,
    NomorModule,
    RekapNaskahModule,
    JenisModule,
    DigsigModule,
    DelegasiModule,
    SearchModule,
    FcmModule,
    NotificationModule,
    CompanySwitchModule,
    ConfigAdminModule,
    FaqModule,
    PedomanModule,
    ShortUrlModule,
    MailServiceModule,
    RbacModule,
    RealtimeModule,
    AiModule,
    OnlyOfficeModule,
    NaskahUmumModule,
    ArsipDinamisModule,
    NaskahShareModule,
    // New module for usulan akses berkas
    UsulanAksesBerkasModule,
    AuditModule,
    SdeMasalModule,
    SentryModule,
    UsulanPindahModule,
    TransferInactiveFileModule,
    TransferActiveToInactiveModule,
    OrganizationTuModule,
    TuVerifikasiModule,
    PenyusutanModule,
    ArsipModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PemeliharaanAccessGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      // Set max_allowed_packet untuk handle large org_data (256MB)
      await this.dataSource.query('SET GLOBAL max_allowed_packet = 268435456');
      console.log('✅ MySQL max_allowed_packet set to 256MB');
    } catch (error: any) {
      console.warn(
        '⚠️ Could not set max_allowed_packet (might need SUPER privilege):',
        error?.message,
      );
    }
  }
}
