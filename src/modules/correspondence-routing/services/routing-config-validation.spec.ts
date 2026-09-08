import { BadRequestException } from '@nestjs/common';
import {
  matchesScopes,
  periodsOverlap,
  validatePeriod,
  validateRuleShape,
} from './routing-config-validation';

const validRule = {
  document_type: 'DI',
  action_type: 'CREATE',
  behavior: 'ADD',
  delivery_type: 'PENERIMA',
  effect: 'ALLOW_SELECT',
  mandatory: false,
  valid_from: '2026-09-07',
  valid_to: null,
  scope_type: 'ALL',
};

describe('routing configuration validation', () => {
  it('rejects invalid and reversed effective periods', () => {
    expect(() => validatePeriod('2026-02-30')).toThrow(BadRequestException);
    expect(() => validatePeriod('2026-09-08', '2026-09-07')).toThrow(
      BadRequestException,
    );
  });

  it('detects inclusive period overlap', () => {
    expect(
      periodsOverlap(
        { valid_from: '2026-01-01', valid_to: '2026-01-31' },
        { valid_from: '2026-01-31', valid_to: '2026-02-28' },
      ),
    ).toBe(true);
    expect(
      periodsOverlap(
        { valid_from: '2026-01-01', valid_to: '2026-01-30' },
        { valid_from: '2026-01-31' },
      ),
    ).toBe(false);
  });

  it('accepts only additive recipient and mandatory SDI CC shapes', () => {
    expect(() => validateRuleShape(validRule, [])).not.toThrow();
    expect(() =>
      validateRuleShape(
        {
          ...validRule,
          document_type: 'SDI',
          delivery_type: 'TEMBUSAN',
          effect: 'AUTO_INCLUDE',
          mandatory: true,
        },
        [],
      ),
    ).not.toThrow();
    expect(() =>
      validateRuleShape({ ...validRule, behavior: 'REPLACE' }, []),
    ).toThrow(BadRequestException);
    expect(() =>
      validateRuleShape(
        { ...validRule, document_type: 'SDI', action_type: 'FORWARD' },
        [],
      ),
    ).toThrow(BadRequestException);
  });

  it('requires explicit include scopes and makes excludes win', () => {
    expect(() =>
      validateRuleShape({ ...validRule, scope_type: 'EXPLICIT' }, []),
    ).toThrow(BadRequestException);
    expect(() =>
      validateRuleShape(validRule, [
        {
          side: 'TARGET',
          entity_type: 'AREA',
          entity_id: 'HQ',
          include_flag: true,
        },
      ]),
    ).toThrow(BadRequestException);

    const position = { position: 1, company: 10000, area: 'HQ' };
    expect(
      matchesScopes(position, 'TARGET', [
        {
          side: 'TARGET',
          entity_type: 'AREA',
          entity_id: 'HQ',
          include_flag: true,
        },
        {
          side: 'TARGET',
          entity_type: 'POSITION',
          entity_id: '1',
          include_flag: false,
        },
      ]),
    ).toBe(false);
  });
});
