import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorrespondenceRoutingRole } from './entities/correspondence-routing-role.entity';
import { CorrespondenceRoutingRoleMember } from './entities/correspondence-routing-role-member.entity';
import { CorrespondenceRoutingRule } from './entities/correspondence-routing-rule.entity';
import { CorrespondenceRoutingRuleScope } from './entities/correspondence-routing-rule-scope.entity';
import { NaskahRoutingApplied } from './entities/naskah-routing-applied.entity';
import { CorrespondenceAccessPolicy } from './entities/correspondence-access-policy.entity';
import { OrgDataModule } from '../master-data/org_data/org_data.module';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { CommonGuardsModule } from '../../common/guards/common-guards.module';
import { CorrespondenceRoutingController } from './controllers/correspondence-routing.controller';
import { CorrespondenceRoutingAdminService } from './services/correspondence-routing-admin.service';
import { RoutingConfigCacheService } from './services/routing-config-cache.service';
import { CorrespondenceRoutingResolverService } from './services/correspondence-routing-resolver.service';
import { CorrespondenceAccessService } from './services/correspondence-access.service';

export const CORRESPONDENCE_ROUTING_ENTITIES = [
  CorrespondenceRoutingRole,
  CorrespondenceRoutingRoleMember,
  CorrespondenceRoutingRule,
  CorrespondenceRoutingRuleScope,
  NaskahRoutingApplied,
  CorrespondenceAccessPolicy,
];

// Admin API is registered independently from DI/SDI runtime modules.
@Module({
  imports: [
    TypeOrmModule.forFeature(CORRESPONDENCE_ROUTING_ENTITIES),
    OrgDataModule,
    AuditModule,
    RbacModule,
    CommonGuardsModule,
  ],
  controllers: [CorrespondenceRoutingController],
  providers: [
    CorrespondenceRoutingAdminService,
    CorrespondenceRoutingResolverService,
    CorrespondenceAccessService,
    RoutingConfigCacheService,
  ],
  exports: [
    TypeOrmModule,
    RoutingConfigCacheService,
    CorrespondenceAccessService,
    CorrespondenceRoutingResolverService,
  ],
})
export class CorrespondenceRoutingModule {}
