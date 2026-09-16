import { getMetadataArgsStorage } from 'typeorm';
import {
  TugasActivityEntity,
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
  TugasTaskEvidenceEntity,
  TugasTaskReferenceEntity,
  tugasJsonTransformer,
} from '.';

describe('Tugas entity metadata', () => {
  const storage = getMetadataArgsStorage();

  const tableName = (target: object): string | undefined =>
    storage.tables.find((table) => table.target === target)?.name;

  const columnOptions = (target: object, propertyName: string) =>
    storage.columns.find(
      (column) =>
        column.target === target && column.propertyName === propertyName,
    )?.options;

  it('maps all domain entities to the expected tables', () => {
    expect(tableName(TugasBoardEntity)).toBe('tugas_board');
    expect(tableName(TugasBoardMemberEntity)).toBe('tugas_board_member');
    expect(tableName(TugasTaskEntity)).toBe('tugas_task');
    expect(tableName(TugasTaskEvidenceEntity)).toBe('tugas_task_evidence');
    expect(tableName(TugasTaskReferenceEntity)).toBe('tugas_task_reference');
    expect(tableName(TugasActivityEntity)).toBe('tugas_activity');
  });

  it('uses soft delete for boards and separate archive state for tasks', () => {
    expect(columnOptions(TugasBoardEntity, 'deletedAt')).toMatchObject({
      name: 'deleted_at',
      nullable: true,
    });
    expect(columnOptions(TugasTaskEntity, 'archivedAt')).toMatchObject({
      name: 'archived_at',
      nullable: true,
    });
  });

  it('keeps assignment and creator membership nullable', () => {
    expect(columnOptions(TugasTaskEntity, 'assigneeMemberId')).toMatchObject({
      name: 'assignee_member_id',
      nullable: true,
    });
    expect(columnOptions(TugasTaskEntity, 'createdByMemberId')).toMatchObject({
      name: 'created_by_member_id',
      nullable: true,
    });

    const nullableSetNullRelations = storage.relations.filter(
      (relation) =>
        relation.target === TugasTaskEntity &&
        ['assigneeMember', 'createdByMember'].includes(relation.propertyName),
    );
    expect(nullableSetNullRelations).toHaveLength(2);
    for (const relation of nullableSetNullRelations) {
      expect(relation.options).toMatchObject({
        nullable: true,
        onDelete: 'SET NULL',
      });
    }
  });

  it('defines the board membership and reference uniqueness boundaries', () => {
    const memberUnique = storage.indices.find(
      (index) =>
        index.target === TugasBoardMemberEntity &&
        index.name === 'uq_tugas_board_member_position',
    );
    const referenceUnique = storage.indices.find(
      (index) =>
        index.target === TugasTaskReferenceEntity &&
        index.name === 'uq_tugas_task_reference',
    );

    expect(memberUnique).toMatchObject({
      columns: ['boardId', 'positionId'],
      unique: true,
    });
    expect(referenceUnique).toMatchObject({
      columns: ['taskId', 'referenceType', 'referenceId'],
      unique: true,
    });
  });

  it('serializes activity detail defensively', () => {
    const detail = { from: 'todo', to: 'in_progress' };
    const serialized = tugasJsonTransformer.to(detail);

    expect(serialized).toBe(JSON.stringify(detail));
    expect(tugasJsonTransformer.from(serialized)).toEqual(detail);
    expect(tugasJsonTransformer.from(detail)).toEqual(detail);
    expect(tugasJsonTransformer.from('{invalid')).toBeNull();
    expect(tugasJsonTransformer.from(null)).toBeNull();
  });
});
