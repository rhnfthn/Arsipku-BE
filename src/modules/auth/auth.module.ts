import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Session } from './entities/session.entity';
import { UserRoleEntity } from '../superadmin/entities/user-role.entity';
import { SessionService } from './services/session.service';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './controllers/auth.controller';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { SubAreaAlamatModule } from '../sub-area-alamat/sub-area-alamat.module';
import { DelegasiModule } from '../delegasi/delegasi.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganizationTuModule } from '../organization-tu/organization-tu.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, UserRoleEntity]),
    PassportModule,
    HttpModule,
    OrgDataModule,
    SubAreaAlamatModule,
    forwardRef(() => DelegasiModule),
    forwardRef(() => RbacModule),
    OrganizationTuModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '24h',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [SessionService, AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [SessionService, AuthService, JwtModule],
})
export class AuthModule {}
