import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateRoutingRuleDto,
  RoutingListDto,
  RoutingMembersDto,
  UpdateRoutingRuleDto,
} from './routing-admin.dto';

describe('routing admin DTO', () => {
  it('transforms and bounds list query values', async () => {
    const valid = plainToInstance(RoutingListDto, {
      company: '10000',
      page: '2',
      limit: '100',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid).toMatchObject({ company: 10000, page: 2, limit: 100 });

    const invalid = plainToInstance(RoutingListDto, { limit: '101' });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('validates nested member rows', async () => {
    const dto = plainToInstance(RoutingMembersDto, {
      members: [{ position_id: 0, valid_from: '07-09-2026' }],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a complete create rule and keeps code/company immutable', async () => {
    const create = plainToInstance(CreateRoutingRuleDto, {});
    expect(await validate(create)).not.toHaveLength(0);

    const update = plainToInstance(UpdateRoutingRuleDto, {
      name: 'Nama baru',
      code: 'CANNOT_CHANGE',
      company: 20000,
    });
    expect(await validate(update, { whitelist: true })).toHaveLength(0);
    expect(update).toEqual(expect.objectContaining({ name: 'Nama baru' }));
    expect(update).not.toHaveProperty('code');
    expect(update).not.toHaveProperty('company');
  });
});
