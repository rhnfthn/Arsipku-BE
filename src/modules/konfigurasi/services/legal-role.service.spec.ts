import { BadRequestException } from '@nestjs/common';
import { LegalRoleService } from './legal-role.service';

const legalTree = {
  id: 10002099,
  name: 'Legal Unit',
  level: 1,
  positions: [
    {
      position: 'POS_STAFF',
      position_text: 'Legal Staff',
      chief: 0,
      person: { persnum: '1002', persnum_text: 'Legal Staff' },
    },
    {
      position: 'POS_HEAD',
      position_text: 'EVP Legal',
      chief: 1,
      person: { persnum: '1001', persnum_text: 'Legal Head' },
    },
  ],
};

describe('LegalRoleService first recipient', () => {
  const createService = (roles: any[] = []) => {
    const manager = {
      update: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((_entity, value) => value),
      save: jest.fn((value) => value),
    };
    const legalRoleRepo = {
      find: jest.fn().mockResolvedValue(roles),
      manager: {
        transaction: jest.fn((callback) => callback(manager)),
      },
    };
    const delegasiQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const delegasiRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(delegasiQuery),
    };
    const orgDataService = {
      findLatestOrg: jest.fn().mockResolvedValue({
        organization_json: legalTree,
      }),
    };

    return {
      service: new LegalRoleService(
        legalRoleRepo as any,
        delegasiRepo as any,
        orgDataService as any,
      ),
      manager,
    };
  };

  it('uses the top active member when no configuration has been saved', async () => {
    const { service } = createService();

    const people = await service.findAll();

    expect(people.find((person) => person.isFirstRecipient)?.positionId).toBe(
      'POS_HEAD',
    );
  });

  it('persists exactly one active member as the first recipient', async () => {
    const { service, manager } = createService();
    manager.findOne.mockResolvedValue(null);

    await service.setFirstRecipient('POS_STAFF');

    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { isFirstRecipient: true },
      { isFirstRecipient: null },
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'POS_STAFF',
        isActive: true,
        isFirstRecipient: true,
      }),
    );
  });

  it('rejects an inactive member as the first recipient', async () => {
    const { service } = createService([
      {
        positionId: 'POS_STAFF',
        isActive: false,
        isFirstRecipient: null,
      },
    ]);

    await expect(service.setFirstRecipient('POS_STAFF')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
