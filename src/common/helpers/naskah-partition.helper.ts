import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

type PartitionedNaskahKey = {
  id: string;
  tanggal: Date | string;
};

const PARTITIONED_CHILD_TABLES = [
  'naskah_sirkulasi',
  'naskah_lampiran',
  'naskah_referensi',
  'di',
] as const;

/**
 * Normalize a MySQL DATE value without shifting it through UTC.
 */
export function toMysqlDate(value: Date | string): string {
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Tanggal partisi naskah tidak valid: ${String(value)}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Update an existing naskah using its complete, original composite key.
 *
 * TypeORM save() must not be used for this case: when `tanggal` is part of the
 * primary key, a DATE conversion mismatch can make save() issue a second
 * INSERT. If the business date changes, all denormalized partition dates are
 * moved in the same transaction before the parent row is updated.
 */
export async function updatePartitionedNaskah(
  manager: EntityManager,
  target: EntityTarget<ObjectLiteral>,
  current: PartitionedNaskahKey,
  changes: QueryDeepPartialEntity<ObjectLiteral>,
): Promise<void> {
  const oldDate = toMysqlDate(current.tanggal);
  const requestedDate = (changes as Record<string, unknown>).tanggal;
  const newDate =
    requestedDate instanceof Date || typeof requestedDate === 'string'
      ? toMysqlDate(requestedDate)
      : oldDate;

  if (newDate !== oldDate) {
    for (const table of PARTITIONED_CHILD_TABLES) {
      await manager.query(
        `UPDATE \`${table}\` SET \`tanggal\` = ? WHERE \`id_naskah\` = ? AND \`tanggal\` = ?`,
        [newDate, current.id, oldDate],
      );
    }
  }

  const result = await manager.update(
    target,
    { id: current.id, tanggal: oldDate },
    changes,
  );

  if (result.affected !== 1) {
    throw new Error(
      `Naskah ${current.id} dengan tanggal ${oldDate} tidak ditemukan atau tidak unik`,
    );
  }
}
