import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RbacController } from './controllers/rbac.controller';
import { RbacService } from './services/rbac.service';
import {
  RoleEntity,
  ResourceEntity,
  PermissionEntity,
  RolePermissionEntity,
  RbacUserRoleEntity,
} from './entities';
import { Person } from '../master-data/person/entities/person.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      ResourceEntity,
      PermissionEntity,
      RolePermissionEntity,
      RbacUserRoleEntity,
      Person,
    ]),
    OrgDataModule,
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
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService, TypeOrmModule],
})
export class RbacModule {}
