import { DataSource } from 'typeorm';
import { NomorRequestEntity } from '../entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../entities/nomor-request-detail.entity';
import {
  applyNomorListQuery,
  buildNomorStatusCounts,
  approvalStatusSql,
  requestStatusSql,
  manualRequestSql,
} from './nomor-list-query';

describe('penomoran database list query', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = new DataSource({
      type: 'mysql',
      database: 'query_only_test',
      entities: [NomorRequestEntity, NomorRequestDetailEntity],
    });
    await (
      source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
  });
  const builder = () =>
    source.getRepository(NomorRequestEntity).createQueryBuilder('request');

  it.each([approvalStatusSql, requestStatusSql])(
    'groups a derived status column for strict MySQL mode',
    (statusSql) => {
      const query = builder();
      applyNomorListQuery(
        query,
        { search: 'test' },
        { mode: 'approval', position: 123 },
      );
      const before = query.getQueryAndParameters();
      const [sql, parameters] = buildNomorStatusCounts(
        query,
        statusSql,
      ).getQueryAndParameters();
      expect(sql).toContain('FROM (SELECT CASE');
      expect(sql).toContain('GROUP BY status_counts.status');
      expect(sql).not.toContain('GROUP BY CASE');
      expect(sql).not.toContain('ORDER BY');
      expect(parameters).toEqual(expect.arrayContaining(['123', '%test%']));
      expect(query.getQueryAndParameters()).toEqual(before);
    },
  );

  it.each([
    'usulan',
    'submitted',
    'approval',
    'nomor',
    'admin-usulan',
  ] as const)(
    'paginates %s at request level without multiplying detail joins',
    (mode) => {
      const query = builder();
      applyNomorListQuery(
        query,
        { page: 2, limit: 10 },
        {
          mode,
          position: mode === 'usulan' || mode === 'approval' ? 123 : undefined,
          adminPositions: ['123'],
          draftPosition: 123,
        },
      );
      query.offset(10).limit(10);
      const sql = query.getSql();
      expect(sql).toContain('LIMIT 10 OFFSET 10');
      expect(sql).not.toContain('JOIN');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('`request`.`id` DESC');
    },
  );

  it('keeps branch scoping, owner filtering and literal search parameterized', () => {
    const query = builder();
    applyNomorListQuery(
      query,
      { search: "%' OR 1=1 --_!" },
      { mode: 'usulan', position: 123, area: 'A001' },
    );
    const [sql, parameters] = query.getQueryAndParameters();
    expect(sql).toContain('`request`.`position` = ?');
    expect(sql).toContain('`request`.`area` = ?');
    expect(sql).not.toContain('OR 1=1 --');
    expect(parameters).toContain("%!%' or 1=1 --!_!!%");
  });

  it('filters approval before pagination and supports pengusul search by position', () => {
    const query = builder();
    applyNomorListQuery(
      query,
      { status: 'rejected', search: 'rini' },
      { mode: 'approval', position: 123, matchingPositions: ['345'] },
    );
    const [sql, parameters] = query.getQueryAndParameters();
    expect(sql).toContain('`request`.`id_position_penandatangan` = ?');
    expect(sql).toContain('`request`.`position` IN (?)');
    expect(parameters).toContain('rejected');
    expect(parameters).toContain('345');
  });

  it('keeps legacy manual requests and status precedence', () => {
    expect(manualRequestSql).toContain('is_naskah_generated IS NULL');
    expect(manualRequestSql).toContain("NOT IN ('terpakai', 'terpakai_final')");
    expect(requestStatusSql.indexOf("THEN 'Disetujui'")).toBeLessThan(
      requestStatusSql.indexOf("THEN 'Ditolak'"),
    );
    expect(requestStatusSql.indexOf("THEN 'Menunggu Verifikasi'")).toBeLessThan(
      requestStatusSql.indexOf("THEN 'Draft'"),
    );
  });

  it('uses date ranges and latest valid detail time for issued number lists', () => {
    const query = builder();
    applyNomorListQuery(query, { tahun: 2026 }, { mode: 'nomor' });
    const [sql, parameters] = query.getQueryAndParameters();
    expect(sql).toContain('MAX(nd.created_at)');
    expect(sql).not.toContain('YEAR(');
    expect(parameters).toEqual(
      expect.arrayContaining(['2026-01-01', '2027-01-01']),
    );
  });

  it('does not interpolate an arbitrary sort column', () => {
    const query = builder();
    applyNomorListQuery(
      query,
      { sort_by: 'id;DROP TABLE nomor_request' },
      { mode: 'submitted' },
    );
    expect(query.getSql()).not.toContain('DROP TABLE');
  });
});
