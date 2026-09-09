import { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PERMISSION_KEY } from '../../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { CorrespondenceRoutingAdminService } from '../services/correspondence-routing-admin.service';
import { CorrespondenceRoutingResolverService } from '../services/correspondence-routing-resolver.service';
import { CorrespondenceRoutingController } from './correspondence-routing.controller';

describe('CorrespondenceRoutingController security contract', () => {
  it('requires authentication and permission guards at controller level', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CorrespondenceRoutingController),
    ).toEqual([JwtAuthGuard, PermissionGuard]);
  });

  it.each([
    ['listRoles', 'read'],
    ['createRole', 'create-role'],
    ['getRole', 'read'],
    ['updateRole', 'update-role'],
    ['toggleRole', 'update-role'],
    ['deleteRole', 'delete-role'],
    ['listMembers', 'read'],
    ['addMembers', 'manage-members'],
    ['validateMembers', 'manage-members'],
    ['updateMember', 'manage-members'],
    ['deleteMember', 'manage-members'],
    ['listRules', 'read'],
    ['createRule', 'create-rule'],
    ['getRule', 'read'],
    ['updateRule', 'update-rule'],
    ['toggleAllRules', 'activate-rule'],
    ['toggleRule', 'activate-rule'],
    ['deleteRule', 'delete-rule'],
    ['validateRule', 'preview'],
    ['health', 'read-health'],
    ['preview', 'preview'],
  ])('protects %s with correspondence-routing:%s', (method, action) => {
    expect(
      Reflect.getMetadata(
        PERMISSION_KEY,
        CorrespondenceRoutingController.prototype[method],
      ),
    ).toEqual({ resource: 'correspondence-routing', action });
  });
});

describe('CorrespondenceRoutingController authorization', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 403 when an authenticated user lacks routing permission', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CorrespondenceRoutingController],
      providers: [
        {
          provide: CorrespondenceRoutingAdminService,
          useValue: { listRoles: jest.fn() },
        },
        {
          provide: CorrespondenceRoutingResolverService,
          useValue: { preview: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = { persnum: 999001 };
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => false })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/correspondence-routing/roles')
      .expect(403);
  });
});
