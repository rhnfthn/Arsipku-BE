import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { CompanyModule } from './company/company.module';
import { AreaModule } from './area/area.module';
import { AreasubModule } from './areasub/areasub.module';
import { OrganizationModule } from './organization/organization.module';
import { PositionModule } from './position/position.module';
import { PersonModule } from './person/person.module';
import { RelationOoModule } from './relation_oo/relation_oo.module';
import { RelationOaModule } from './relation_oa/relation_oa.module';
import { RelationOsModule } from './relation_os/relation_os.module';
import { RelationOscModule } from './relation_osc/relation_osc.module';
import { RelationSpModule } from './relation_sp/relation_sp.module';
import { OrgDataModule } from './org_data/org_data.module';
import { RelationOdModule } from './relation_od/relation_od.module';
import { PersuratanModule } from './persuratan/persuratan.module';
import { DashboardUserModule } from './dashboard/user/dashboard-user.module';
import { TemplateModule } from './template/template.module';
import { TitelaturEnModule } from './titelatur_en/titelatur-en.module';
import { StorageModule } from './storage/storage.module';
import { UploadModule } from './upload/upload.module';
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
    PersuratanModule,
    DashboardUserModule,
    TemplateModule,
    TitelaturEnModule,
    StorageModule,
    UploadModule,
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
