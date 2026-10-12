import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PersonService } from './person.service';
import { Person } from './entities/person.entity';
import { RelationSp } from '../relation_sp/entities/relation_sp.entity';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OmPosition } from '../position/entities/om-position.entity';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { OrgDataService } from '../org_data/org_data.service';

describe('PersonService', () => {
  let service: PersonService;
  const qb = {
    select: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    setParameters: jest.fn(),
    clone: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getCount: jest.fn(),
    getMany: jest.fn(),
  };
  const org = { findLatestPositionSnapshot: jest.fn() };
  const position = (
    id: number,
    division: number | null,
    company = 1,
    chief = 1,
    directorate: number | null = 100,
  ) => ({
    position: id,
    persnum_person: id,
    persnum_person_text: `Person ${id}`,
    position_text: 'Manager',
    chief,
    company,
    area: 'A000',
    divisi_id: division,
    direktorat_id: directorate,
    organization_id: 200,
  });
  const user = { position: '1', area: 'A000' } as JwtPayload;

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const name of [
      'select',
      'where',
      'orderBy',
      'addOrderBy',
      'setParameters',
      'clone',
      'skip',
      'take',
    ] as const)
      qb[name].mockReturnValue(qb);
    qb.getCount.mockImplementation(() =>
      Promise.resolve(qb.where.mock.calls[0][1].ids.length),
    );
    qb.getMany.mockImplementation(() =>
      Promise.resolve(
        qb.where.mock.calls[0][1].ids.map((persnum: number) => ({ persnum })),
      ),
    );
    org.findLatestPositionSnapshot.mockResolvedValue({
      position_json: [
        position(1, 10),
        position(2, 10),
        position(3, 20),
        position(4, 10, 2),
        position(5, 10, 1, 0),
      ],
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonService,
        {
          provide: getRepositoryToken(Person),
          useValue: { createQueryBuilder: () => qb },
        },
        {
          provide: getRepositoryToken(RelationSp),
          useValue: {},
        },
        {
          provide: getRepositoryToken(NaskahSirkulasi),
          useValue: {},
        },
        {
          provide: getRepositoryToken(OmPosition),
          useValue: {},
        },
        {
          provide: OrgDataService,
          useValue: org,
        },
      ],
    }).compile();

    service = module.get<PersonService>(PersonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  it('returns only managerial signers in the active division, including self', async () => {
    const result = await service.findAllWithPosition(
      undefined,
      1,
      50,
      user,
      true,
    );
    expect(result).toMatchObject({
      total: 2,
      data: [{ position: 1 }, { position: 2 }],
    });
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(50);
  });
  it('keeps the unscoped endpoint contract for other consumers', async () => {
    const result = await service.findAllWithPosition(
      undefined,
      undefined,
      undefined,
      user,
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(4);
  });
  it('uses directorate fallback when division is missing', async () => {
    org.findLatestPositionSnapshot.mockResolvedValue({
      position_json: [
        position(1, null),
        position(2, 20),
        position(3, 20, 1, 1, 101),
      ],
    });
    const result = await service.findAllWithPosition(
      undefined,
      1,
      50,
      user,
      true,
    );
    expect(result).toMatchObject({ total: 2 });
  });
  it('does not treat missing unit IDs as matching all units', async () => {
    org.findLatestPositionSnapshot.mockResolvedValue({
      position_json: [
        { ...position(1, null, 1, 1, null), organization_id: null },
        position(2, 20),
      ],
    });
    expect(
      await service.findAllWithPosition(undefined, 1, 50, user, true),
    ).toMatchObject({ data: [], total: 0 });
  });
  it('fails when active position cannot be scoped rather than returning all signers', async () => {
    await expect(
      service.findAllWithPosition(
        undefined,
        1,
        50,
        { ...user, position: '999' },
        true,
      ),
    ).rejects.toThrow('Posisi aktif tidak ditemukan');
  });
  it('searches within the permitted division', async () => {
    expect(
      await service.findAllWithPosition('Person 2', 1, 50, user, true),
    ).toMatchObject({ total: 1, data: [{ position: 2 }] });
  });
  it('orders same-unit signers EVP, VP, AVP before pagination', async () => {
    org.findLatestPositionSnapshot.mockResolvedValue({
      position_json: [
        { ...position(1, 10), position_text: 'Assistant Vice President' },
        { ...position(2, 10), position_text: 'VP Legal' },
        { ...position(3, 10), position_text: 'EVP Human Capital' },
        { ...position(4, 10), position_text: 'Executive Vice President' },
        { ...position(5, 10), position_text: 'AVP Legal' },
        { ...position(6, 10), position_text: 'Vice President' },
      ],
    });
    await service.findAllWithPosition(undefined, 1, 2, user, true);
    expect(qb.setParameters).toHaveBeenCalledWith({
      signerRank0: [3, 4],
      signerRank1: [2, 6],
      signerRank2: [1, 5],
    });
    expect(qb.orderBy).toHaveBeenLastCalledWith(
      'CASE WHEN person.persnum IN (:...signerRank0) THEN 0 WHEN person.persnum IN (:...signerRank1) THEN 1 WHEN person.persnum IN (:...signerRank2) THEN 2 ELSE 3 END',
      'ASC',
    );
    expect(qb.orderBy.mock.invocationCallOrder.at(-1)).toBeLessThan(
      qb.skip.mock.invocationCallOrder[0],
    );
    expect(qb.take).toHaveBeenCalledWith(2);
  });
});
