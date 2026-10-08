import { SelectQueryBuilder } from 'typeorm';
import { NomorRequestEntity } from '../entities/nomor-request.entity';
import { GetNomorQueryDto } from '../dto/get-nomor.dto';

export const detailExists = (condition = '1=1'): string =>
  `EXISTS (SELECT 1 FROM nomor_request_detail nd WHERE nd.id_request = request.id AND (${condition}))`;

// Same priority as determineStatusFromDetails; includes legacy/unknown statuses.
export const requestStatusSql = `CASE
  WHEN ${detailExists("nd.status IN ('terpakai', 'terpakai_final')")} THEN 'Disetujui'
  WHEN ${detailExists("nd.status IN ('hangus', 'ditolak')")} AND NOT ${detailExists("nd.status IN ('booking', 'draft')")} THEN 'Ditolak'
  WHEN ${detailExists("nd.status = 'booking'")} THEN 'Menunggu Verifikasi'
  WHEN ${detailExists("nd.status = 'draft'")} THEN 'Draft'
  ELSE 'Belum Diajukan' END`;

export const approvalStatusSql = `CASE
  WHEN (${requestStatusSql}) = 'Ditolak' THEN 'rejected'
  WHEN ${detailExists("nd.status <> 'draft'")} THEN 'approved'
  ELSE 'draft' END`;

export const manualRequestSql = `(request.is_naskah_generated = 0 OR
  (request.is_naskah_generated IS NULL AND
    (NOT ${detailExists()} OR ${detailExists("nd.status NOT IN ('terpakai', 'terpakai_final')")})))`;

/** Group materialized status values, not correlated expressions referencing request.id. */
export function buildNomorStatusCounts(
  source: SelectQueryBuilder<NomorRequestEntity>,
  statusSql: string,
) {
  const statuses = source.clone().select(statusSql, 'status').orderBy();
  return source.connection
    .createQueryBuilder()
    .select('status_counts.status', 'status')
    .addSelect('COUNT(*)', 'total')
    .from(`(${statuses.getQuery()})`, 'status_counts')
    .setParameters(statuses.getParameters())
    .groupBy('status_counts.status');
}

export function applyNomorListQuery(
  qb: SelectQueryBuilder<NomorRequestEntity>,
  query: GetNomorQueryDto | undefined,
  options: {
    mode: 'usulan' | 'admin-usulan' | 'submitted' | 'approval' | 'nomor';
    position?: number;
    area?: string;
    matchingPositions?: string[];
    adminPositions?: string[];
    draftPosition?: number;
  },
): void {
  const { mode } = options;
  if (options.position !== undefined) {
    qb.andWhere(
      mode === 'approval'
        ? 'request.id_position_penandatangan = :position'
        : 'request.position = :position',
      { position: options.position.toString() },
    );
  }
  if (options.area) qb.andWhere('request.area = :area', { area: options.area });
  if (mode === 'admin-usulan') {
    qb.andWhere('request.is_naskah_generated = 0');
    qb.andWhere(
      `((${requestStatusSql}) <> 'Belum Diajukan' OR request.position = :draftPosition)`,
      { draftPosition: String(options.draftPosition) },
    );
    if (options.adminPositions?.length)
      qb.andWhere('request.position IN (:...adminPositions)', {
        adminPositions: options.adminPositions,
      });
    else qb.andWhere('1=0');
  }
  if (mode === 'submitted') {
    qb.andWhere(manualRequestSql).andWhere(
      `(${requestStatusSql}) <> 'Belum Diajukan'`,
    );
  }
  if (mode === 'approval') {
    qb.andWhere(
      '(request.is_naskah_generated = 0 OR request.is_naskah_generated IS NULL)',
    );
  }
  if (mode === 'nomor') {
    qb.andWhere(
      detailExists("nd.status IN ('terpakai', 'terpakai_final', 'hangus')"),
    );
    if (query?.tahun)
      qb.andWhere(
        'request.tanggal >= :yearStart AND request.tanggal < :yearEnd',
        {
          yearStart: `${query.tahun}-01-01`,
          yearEnd: `${query.tahun + 1}-01-01`,
        },
      );
  }
  const statusSql = mode === 'approval' ? approvalStatusSql : requestStatusSql;
  if (query?.status && !['Semua', 'all'].includes(query.status)) {
    const status =
      mode === 'approval'
        ? query.status
        : ['draft', 'menunggu persetujuan', 'menunggu_persetujuan'].includes(
              query.status.toLowerCase(),
            )
          ? 'Draft'
          : query.status;
    qb.andWhere(`(${statusSql}) = :status`, { status });
  }
  if (query?.search) {
    // Escape LIKE metacharacters to preserve literal substring semantics.
    const search = `%${query.search.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    const columns =
      mode === 'usulan'
        ? ['perihal', 'jenis', 'penandatangan']
        : mode === 'nomor'
          ? ['perihal', 'jenis']
          : [
              'id',
              'company',
              'area',
              'sub_area',
              'organization',
              'position',
              'tanggal',
              'jenis',
              'klasifikasi',
              'perihal',
              'jumlah',
              'penandatangan',
            ];
    const conditions = columns.map(
      (column) =>
        `LOWER(CAST(request.${column} AS CHAR)) LIKE :search ESCAPE '!'`,
    );
    if (mode === 'nomor')
      conditions.push(
        detailExists(
          "nd.status IN ('terpakai', 'terpakai_final', 'hangus') AND LOWER(nd.nomor) LIKE :search ESCAPE '!'",
        ),
      );
    if (mode !== 'nomor' && mode !== 'usulan')
      conditions.push(`LOWER(${statusSql}) LIKE :search ESCAPE '!'`);
    if (options.matchingPositions?.length) {
      conditions.push('request.position IN (:...matchingPositions)');
      qb.setParameter('matchingPositions', options.matchingPositions);
    }
    qb.andWhere(`(${conditions.join(' OR ')})`, { search });
  }
  const latestNumber = `(SELECT MAX(nd.created_at) FROM nomor_request_detail nd
    WHERE nd.id_request = request.id AND nd.status IN ('terpakai', 'terpakai_final', 'hangus'))`;
  const columns: Record<string, string> = {
    tanggal: 'request.tanggal',
    tanggal_usulan: mode === 'nomor' ? latestNumber : 'request.createdAt',
    waktu: mode === 'nomor' ? latestNumber : 'request.createdAt',
    jenis: 'request.jenis',
    status: statusSql,
    perihal: 'request.perihal',
    jumlah: 'request.jumlah',
  };
  const order = query?.sort_order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sort =
    columns[query?.sort_by || ''] ||
    (mode === 'nomor' ? latestNumber : 'request.createdAt');
  qb.orderBy(sort, order).addOrderBy('request.id', order);
}
