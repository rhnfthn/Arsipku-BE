import { BadRequestException } from '@nestjs/common';

export interface RoutingPosition {
  position: number;
  company: number;
  position_text?: string;
  persnum_person?: number | null;
  area?: string | null;
  sub_area?: number | null;
  organization_id?: number;
}
export interface ScopeInput {
  side: string;
  entity_type: string;
  entity_id: string;
  include_flag: boolean | number;
}

export function validatePeriod(from: string, to?: string | null) {
  for (const date of [from, to].filter((v): v is string => v != null)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException(
        'Tanggal harus valid dalam format YYYY-MM-DD',
      );
  }
  if (to && to < from)
    throw new BadRequestException('valid_to harus >= valid_from');
}

export function periodsOverlap(
  a: { valid_from: string; valid_to?: string | null },
  b: { valid_from: string; valid_to?: string | null },
) {
  return (
    a.valid_from <= (b.valid_to || '9999-12-31') &&
    b.valid_from <= (a.valid_to || '9999-12-31')
  );
}

export function scopeValue(
  p: RoutingPosition,
  entity: string,
): string | undefined {
  const value = {
    POSITION: p.position,
    ORGANIZATION: p.organization_id,
    SUB_AREA: p.sub_area,
    AREA: p.area,
  }[entity];
  return value == null ? undefined : String(value);
}

// Includes are OR within a side; excludes always win. Membership bounds both sides.
export function matchesScopes(
  p: RoutingPosition,
  side: string,
  scopes: ScopeInput[],
) {
  const relevant = scopes.filter((s) => s.side === side);
  const includes = relevant.filter((s) => Boolean(s.include_flag));
  const matches = (s: ScopeInput) =>
    scopeValue(p, s.entity_type) === s.entity_id;
  return (
    (!includes.length || includes.some(matches)) &&
    !relevant.some((s) => !s.include_flag && matches(s))
  );
}

export function validateRuleShape(
  rule: {
    document_type: string;
    action_type: string;
    behavior: string;
    delivery_type: string;
    effect: string;
    mandatory: boolean | number;
    valid_from: string;
    valid_to?: string | null;
    scope_type: string;
  },
  scopes: ScopeInput[],
) {
  validatePeriod(rule.valid_from, rule.valid_to);
  if (rule.behavior !== 'ADD')
    throw new BadRequestException('Versi pertama hanya mendukung ADD');
  if (rule.document_type === 'SDI' && rule.action_type !== 'CREATE')
    throw new BadRequestException('SDI forward belum termasuk scope');
  const recipient =
    rule.delivery_type === 'PENERIMA' &&
    rule.effect === 'ALLOW_SELECT' &&
    !rule.mandatory;
  const cc =
    rule.document_type === 'SDI' &&
    rule.delivery_type === 'TEMBUSAN' &&
    rule.effect === 'AUTO_INCLUDE' &&
    Boolean(rule.mandatory);
  if (!recipient && !cc)
    throw new BadRequestException(
      'Kombinasi delivery/effect/mandatory tidak didukung',
    );
  if (
    rule.scope_type === 'EXPLICIT'
      ? !scopes.some((s) => s.include_flag)
      : scopes.length > 0
  )
    throw new BadRequestException(
      'EXPLICIT wajib include scope; tipe scope lain tidak menerima scope rows',
    );
  const keys = scopes.map((s) => `${s.side}:${s.entity_type}:${s.entity_id}`);
  if (new Set(keys).size !== keys.length)
    throw new BadRequestException(
      'Scope duplikat atau include/exclude bertentangan',
    );
}
