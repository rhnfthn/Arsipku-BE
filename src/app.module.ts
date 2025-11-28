import { Module } from '@nestjs/common';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
