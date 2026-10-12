import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, In, Raw } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahShareEntity } from '../entities/naskah-share.entity';
import { NaskahShareRecipientEntity } from '../entities/naskah-share-recipient.entity';
import { NaskahShareLogEntity } from '../entities/naskah-share-log.entity';
import { ShareStatus } from '../enums/share-status.enum';
import { RecipientStatus } from '../enums/recipient-status.enum';
import { ShareLogAksi } from '../enums/share-log-aksi.enum';
import { ShareAccessType } from '../enums/share-access-type.enum';
import { CreateNaskahShareDto, NaskahShareQueryDto } from '../dto';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { Person } from '../../master-data/person/entities/person.entity';
import { NotificationService } from '../../notification/services/notification.service';
import { NotificationType } from '../../notification/entities/notification.entity';
import { StorageService } from '../../storage/services/storage.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ConfigNaskahLainnyaService } from '../../config/services';
import { NaskahLainnyaDokumenEntity } from '../../naskah-lainnya/entities/naskah-lainnya-dokumen.entity';
import { KonsepRiwayatEntity } from '../../konsep/entities/konsep-riwayat.entity';
import { MailServiceService } from '../../mail-service/services/mail-service.service';

@Injectable()
export class NaskahShareService {
  private readonly logger = new Logger(NaskahShareService.name);

  constructor(
    @InjectRepository(NaskahShareEntity)
    private readonly shareRepo: Repository<NaskahShareEntity>,
    @InjectRepository(NaskahShareRecipientEntity)
    private readonly recipientRepo: Repository<NaskahShareRecipientEntity>,
    @InjectRepository(NaskahShareLogEntity)
    private readonly logRepo: Repository<NaskahShareLogEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(NaskahLainnyaDokumenEntity)
    private readonly naskahLainnyaDokumenRepo: Repository<NaskahLainnyaDokumenEntity>,
    @InjectRepository(KonsepRiwayatEntity)
    private readonly konsepRiwayatRepo: Repository<KonsepRiwayatEntity>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
    private readonly configNaskahLainnyaService: ConfigNaskahLainnyaService,
    private readonly mailServiceService: MailServiceService,
  ) {}

  // ────────────────────────────────────────────────────────────────
  // POST /naskah-share — Create share (single or multi naskah)
  // ────────────────────────────────────────────────────────────────

  async createShare(user: JwtPayload, dto: CreateNaskahShareDto) {
    // Resolve naskahIds: support single (naskahId) and multi (naskahIds)
    const naskahIds = dto.naskahIds?.length
      ? dto.naskahIds
      : dto.naskahId
        ? [dto.naskahId]
        : [];
    if (naskahIds.length === 0) {
      throw new BadRequestException('naskahId atau naskahIds wajib diisi');
    }

    // 1. Validate all naskah exist
    const naskahs = await this.naskahRepo.find({
      where: { id: In(naskahIds) },
    });
    if (naskahs.length !== naskahIds.length) {
      const foundIds = new Set(naskahs.map((n) => n.id));
      const missing = naskahIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Naskah tidak ditemukan: ${missing.join(', ')}`,
      );
    }
    const naskahMap = new Map(naskahs.map((n) => [n.id, n]));

    const distributionScope = dto.distributionScope ?? 'SELECTED';

    for (const naskah of naskahs) {
      if (naskah.tahapan == null) continue;
      const config = await this.configNaskahLainnyaService.findByJenis(
        naskah.jenis,
      );
      if (!config.shareEnabled) {
        throw new BadRequestException(
          `Jenis naskah ${naskah.jenis} tidak diizinkan untuk dibagikan`,
        );
      }
    }

    if (distributionScope === 'ALL_EMPLOYEES') {
      if (naskahIds.length !== 1 || naskahs[0]?.jenis !== 'EDR') {
        throw new BadRequestException(
          'Penyebarluasan ke seluruh karyawan hanya tersedia untuk satu Surat Edaran',
        );
      }
    } else if (!dto.recipientIds?.length) {
      throw new BadRequestException('Penerima wajib dipilih');
    }

    // 2. Validate sender has access to ALL naskah
    for (const naskahId of naskahIds) {
      await this.assertSenderCanShareNaskah(user, naskahMap.get(naskahId)!);
    }

    // 2b. Validasi finalisasi. Data Naskah Lainnya lama dapat sudah selesai dan
    // memiliki artifact `dittd`, tetapi status induknya masih `draf` karena bug
    // transisi terdahulu. Artifact final menjadi bukti finalisasi untuk kasus
    // legacy tersebut; TTD fisik `pending` tetap tidak boleh dibagikan.
    const naskahsNotFinal = await this.findNotFinalizedNaskahs(naskahs);
    if (naskahsNotFinal.length > 0) {
      const missingTitles = naskahsNotFinal
        .map((n) => n.perihal || n.id)
        .join(', ');
      throw new BadRequestException(
        `Naskah belum difinalisasi: ${missingTitles}. Finalisasi naskah terlebih dahulu sebelum membagikan.`,
      );
    }

    // 3. Prevent sharing to self
    const requestedRecipientIds = dto.recipientIds ?? [];
    if (
      distributionScope === 'SELECTED' &&
      requestedRecipientIds.includes(user.position)
    ) {
      throw new BadRequestException(
        'Tidak dapat membagikan naskah kepada diri sendiri',
      );
    }

    // 4. Fetch recipient data from org_data + person
    let recipients =
      distributionScope === 'ALL_EMPLOYEES'
        ? await this.fetchAllEmployeeData(user.position, user.persnum)
        : await this.fetchRecipientData(requestedRecipientIds);
    if (recipients.length === 0) {
      throw new BadRequestException('Tidak ada penerima valid yang ditemukan');
    }

    // 5. Prevent duplicate recipients (per naskah)
    // Hanya share yang masih AKTIF dan belum kedaluwarsa yang dianggap
    // "masih berlaku". Share yang sudah lewat expiresAt (auto-expire lazy)
    // tidak boleh memblokir pembagian ulang.
    const now = new Date();
    const existingShares = await this.shareRepo.find({
      where: { naskahId: In(naskahIds), status: ShareStatus.AKTIF },
      relations: ['recipients'],
    });
    const existingByNaskah = new Map<string, string[]>();
    for (const s of existingShares) {
      if (s.expiresAt && new Date(s.expiresAt) <= now) continue;
      const positions = s.recipients.map((r) => r.recipientId);
      existingByNaskah.set(s.naskahId, [
        ...(existingByNaskah.get(s.naskahId) ?? []),
        ...positions,
      ]);
    }
    for (const naskahId of naskahIds) {
      const existingPositions = existingByNaskah.get(naskahId) || [];
      const duplicates = recipients.filter((r) =>
        existingPositions.includes(r.id),
      );
      if (duplicates.length > 0) {
        if (distributionScope === 'ALL_EMPLOYEES') {
          recipients = recipients.filter(
            (recipient) => !existingPositions.includes(recipient.id),
          );
          if (recipients.length === 0) {
            throw new BadRequestException(
              'Surat Edaran ini sudah dibagikan kepada seluruh karyawan aktif',
            );
          }
          continue;
        }
        const naskah = naskahMap.get(naskahId);
        throw new BadRequestException(
          `${duplicates.map((d) => d.nama).join(', ')} sudah menerima share naskah "${naskah?.perihal || naskahId}"`,
        );
      }
    }

    // 6. Create share + recipients + log in transaction (per naskah)
    const accessType =
      (dto.accessType as ShareAccessType) || ShareAccessType.RENTANG_WAKTU;
    let expiresAt: Date | null = null;
    if (accessType === ShareAccessType.RENTANG_WAKTU) {
      if (dto.customTanggalSelesai) {
        // Custom: pakai tanggal berakhir yang dipilih user (akhir hari).
        const custom = new Date(dto.customTanggalSelesai);
        custom.setHours(23, 59, 59, 999);
        expiresAt = custom;
      } else if (dto.durationDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + dto.durationDays);
      }
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const createdShares: any[] = [];

    try {
      for (const naskahId of naskahIds) {
        const naskah = naskahMap.get(naskahId)!;
        const shareId = uuidv4();

        const share = this.shareRepo.create({
          id: shareId,
          naskahId,
          pemberiId: user.position,
          pemberiPersnum: user.persnum,
          pemberiNama: user.nama,
          pemberiPositionText: user.positionText,
          catatan: dto.catatan || null,
          accessType,
          durationDays:
            accessType === ShareAccessType.RENTANG_WAKTU
              ? dto.durationDays || null
              : null,
          expiresAt,
          status: ShareStatus.AKTIF,
        });
        await queryRunner.manager.save(share);

        // Create recipient records
        const recipientEntities = recipients.map((r) =>
          this.recipientRepo.create({
            id: uuidv4(),
            shareId,
            recipientId: r.id,
            recipientPersnum: r.persnum,
            recipientNama: r.nama,
            recipientPositionText: r.positionText,
            recipientOrgText: r.organizationText,
            status: RecipientStatus.TERKIRIM,
          }),
        );
        await queryRunner.manager.save(recipientEntities, { chunk: 500 });

        // Log audit trail
        await queryRunner.manager.save(
          this.logRepo.create({
            id: uuidv4(),
            shareId,
            naskahId,
            aksi: ShareLogAksi.SHARE,
            actorPersnum: user.persnum,
            actorNama: user.nama,
            actorPositionText: user.positionText,
            catatan: dto.catatan || null,
          }),
        );

        createdShares.push({
          id: shareId,
          naskahId,
          naskahPerihal: naskah.perihal || '',
          recipients: recipientEntities.map((r) => ({
            id: r.id,
            recipientId: r.recipientId,
            nama: r.recipientNama,
            positionText: r.recipientPositionText,
            status: r.status,
          })),
        });
      }

      await queryRunner.commitTransaction();

      // 7. Send notification outside transaction. Batasi konkurensi agar
      // penyebarluasan Edaran tidak menghabiskan connection pool.
      for (let offset = 0; offset < recipients.length; offset += 25) {
        const batch = recipients.slice(offset, offset + 25);
        await Promise.allSettled(
          batch.map(async (recipient) => {
            try {
              await this.notificationService.createNotification(
                {
                  positionId: recipient.id,
                  userPersnum: recipient.persnum,
                  type: NotificationType.NASKAH_SHARE_DITERIMA,
                  title: `Anda mendapat akses ${naskahIds.length} naskah dari ${user.nama}`,
                  body:
                    naskahs
                      .map((n) => n.perihal)
                      .filter(Boolean)
                      .join(', ') ||
                    dto.catatan ||
                    'Lihat detail di menu Berbagi',
                  data: {
                    naskahId: naskahIds[0],
                    shareId: createdShares[0]?.id,
                    naskahIds,
                    shareIds: createdShares.map((s) => s.id),
                    pemberiName: user.nama,
                    perihal:
                      naskahs
                        .map((n) => n.perihal)
                        .filter(Boolean)
                        .join(', ') || '',
                    action: 'OPEN_SHARE',
                  },
                },
                true,
              );
            } catch (err: any) {
              this.logger.warn(
                `⚠️ Failed to send share notification to ${recipient.nama}: ${err?.message}`,
              );
            }
          }),
        );
      }

      return {
        success: true,
        statusCode: 201,
        message:
          naskahIds.length > 1
            ? `${naskahIds.length} naskah berhasil dibagikan`
            : 'Naskah berhasil dibagikan',
        data: {
          shares: createdShares,
          count: createdShares.length,
          recipientCount: recipients.length,
          distributionScope,
          pemberiId: user.position,
          status: ShareStatus.AKTIF,
          accessType,
          durationDays: dto.durationDays || null,
          expiresAt,
          createdAt: new Date(),
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share — List shares (tab: shared-by-me | shared-to-me)
  // ────────────────────────────────────────────────────────────────

  async getShares(user: JwtPayload, query: NaskahShareQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const tab = query.tab || 'shared-by-me';

    this.logger.log(
      `[getShares] tab=${tab}, position=${user.position}, page=${page}, limit=${limit}`,
    );

    // NOTE: Legacy enum migration and auto-expire removed from getShares
    // to avoid 5 UPDATE queries per request. Auto-expire handled lazily
    // in getShareDetail() and openNaskah().

    const now = new Date();

    // ── Pagination dua tahap ──────────────────────────────────────────
    // Ambil ID share terlebih dahulu, baru detail + recipients. Untuk tab
    // shared-to-me gunakan EXISTS, bukan JOIN + DISTINCT. MySQL dengan
    // ONLY_FULL_GROUP_BY menolak ORDER BY created_at jika kolom itu tidak
    // ada di SELECT DISTINCT, yang sebelumnya menyebabkan endpoint 500.
    const idQb = this.shareRepo
      .createQueryBuilder('share')
      .select('share.id', 'id');

    if (tab === 'shared-by-me') {
      idQb.where('share.pemberiId = :positionId', { positionId: user.position });
    } else {
      idQb.where(
        `EXISTS (
          SELECT 1
          FROM naskah_share_recipient share_recipient_filter
          WHERE share_recipient_filter.share_id = share.id
            AND share_recipient_filter.recipient_id = :positionId
        )`,
        { positionId: user.position },
      );
    }

    if (query.status === ShareStatus.AKTIF) {
      idQb.andWhere('share.status = :aktifStatus', {
        aktifStatus: ShareStatus.AKTIF,
      });
      idQb.andWhere('(share.expiresAt IS NULL OR share.expiresAt > :now)', {
        now,
      });
      if (tab === 'shared-to-me') {
        idQb.andWhere(
          `EXISTS (
            SELECT 1
            FROM naskah_share_recipient share_recipient_active
            WHERE share_recipient_active.share_id = share.id
              AND share_recipient_active.recipient_id = :positionId
              AND share_recipient_active.status != :recBerakhir
          )`,
          { recBerakhir: RecipientStatus.BERAKHIR },
        );
      }
    } else if (query.status === ShareStatus.BERAKHIR) {
      if (tab === 'shared-to-me') {
        idQb.andWhere(
          `(share.status = :berakhirStatus
            OR (share.expiresAt IS NOT NULL AND share.expiresAt <= :now)
            OR EXISTS (
              SELECT 1
              FROM naskah_share_recipient share_recipient_expired
              WHERE share_recipient_expired.share_id = share.id
                AND share_recipient_expired.recipient_id = :positionId
                AND share_recipient_expired.status = :recBerakhir
            ))`,
          {
            berakhirStatus: ShareStatus.BERAKHIR,
            now,
            recBerakhir: RecipientStatus.BERAKHIR,
          },
        );
      } else {
        idQb.andWhere(
          '(share.status = :berakhirStatus OR (share.expiresAt IS NOT NULL AND share.expiresAt <= :now))',
          {
            berakhirStatus: ShareStatus.BERAKHIR,
            now,
          },
        );
      }
    }

    idQb.leftJoin(NaskahEntity, 'naskah', 'naskah.id = share.naskahId');

    if (query.search) {
      idQb.andWhere(
        '(naskah.perihal LIKE :search OR naskah.nomor LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.jenis) {
      idQb.andWhere('naskah.jenis = :jenis', { jenis: query.jenis });
    }

    // GROUP BY share.id (bukan DISTINCT) — MySQL menolak DISTINCT + ORDER BY
    // kolom yang tidak ada di SELECT list (share.createdAt), sedangkan GROUP BY
    // primary key mengizinkan ORDER BY kolom yang functionally dependent.
    idQb
      .groupBy('share.id')
      .orderBy('share.createdAt', query.sort === 'ASC' ? 'ASC' : 'DESC')
      .skip(skip)
      .take(limit);

    const idRows = await idQb.getRawMany();
    const pageShareIds = idRows.map((r) => r.id);
    const total = await idQb.getCount();

    let shares: NaskahShareEntity[] = [];
    if (pageShareIds.length > 0) {
      shares = await this.shareRepo.find({
        where: { id: In(pageShareIds) },
        relations: ['recipients'],
        order: { createdAt: query.sort === 'ASC' ? 'ASC' : 'DESC' },
      });
    }

    this.logger.log(
      `[getShares] Found ${shares.length} shares, total=${total}`,
    );

    // NOTE: Tidak ada auto-mark DIBACA saat list di-fetch. Status recipient
    // hanya berubah saat user benar-benar membuka naskah (tombol "Buka" →
    // openNaskah). Ini memastikan badge unread & outline biru hanya hilang
    // ketika naskah benar-benar dibuka, bukan saat halaman dibuka.

    // Batch-fetch naskah data to avoid N+1
    const naskahIds = [...new Set(shares.map((s) => s.naskahId))];
    const naskahMap = new Map<string, NaskahEntity>();
    if (naskahIds.length > 0) {
      const naskahs = await this.naskahRepo
        .createQueryBuilder('naskah')
        .where('naskah.id IN (:...ids)', { ids: naskahIds })
        .getMany();
      for (const n of naskahs) {
        naskahMap.set(n.id, n);
      }
    }

    // Enrich with naskah data
    const enriched = await Promise.all(
      shares.map(async (share) => {
        const naskah = naskahMap.get(share.naskahId);

        // In-memory auto-expire: show BERAKHIR if past expiresAt (no DB write)
        const isExpired =
          share.status === ShareStatus.AKTIF &&
          share.expiresAt &&
          new Date() > new Date(share.expiresAt);

        // SEKALI_LIHAT: show BERAKHIR if all recipients already BERAKHIR (opened)
        const isAllRecipientsEnded =
          share.status === ShareStatus.AKTIF &&
          share.accessType === ShareAccessType.SEKALI_LIHAT &&
          share.recipients?.length > 0 &&
          share.recipients.every((r) => r.status === RecipientStatus.BERAKHIR);

        const displayStatus =
          isExpired || isAllRecipientsEnded
            ? ShareStatus.BERAKHIR
            : share.status;

        return {
          id: share.id,
          naskahId: share.naskahId,
          naskahPerihal: naskah?.perihal || '',
          naskahNomor: naskah?.nomor || null,
          naskahJenis: naskah?.jenis || '',
          pemberiId: share.pemberiId,
          pemberiNama: share.pemberiNama,
          pemberiPositionText: share.pemberiPositionText,
          catatan: share.catatan,
          accessType: share.accessType,
          durationDays: share.durationDays,
          expiresAt: share.expiresAt,
          status: displayStatus,
          createdAt: share.createdAt,
          recipients: share.recipients.map((r) => ({
            id: r.id,
            recipientId: r.recipientId,
            nama: r.recipientNama,
            positionText: r.recipientPositionText,
            orgText: r.recipientOrgText,
            status: r.status,
            openedAt: r.openedAt,
          })),
        };
      }),
    );

    return {
      success: true,
      data: enriched,
      total,
      page,
      limit,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share/:id — Share detail (with auto-expire check)
  // ────────────────────────────────────────────────────────────────

  async getShareDetail(user: JwtPayload, id: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Auto-expire: persist BERAKHIR if past expiresAt
    if (
      share.status === ShareStatus.AKTIF &&
      share.expiresAt &&
      new Date() > new Date(share.expiresAt)
    ) {
      share.status = ShareStatus.BERAKHIR;
      share.revokedAt = new Date(share.expiresAt);
      share.revokedReason = 'Akses kedaluwarsa';
      await this.shareRepo.save(share);
    }

    // Only pemberi or recipient can view detail
    const isPemberi = share.pemberiId === user.position;
    const isRecipient = share.recipients.some(
      (r) => r.recipientId === user.position,
    );
    if (!isPemberi && !isRecipient) {
      throw new ForbiddenException('Anda tidak memiliki akses ke share ini');
    }

    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    return {
      success: true,
      data: {
        id: share.id,
        naskahId: share.naskahId,
        naskahPerihal: naskah?.perihal || '',
        naskahNomor: naskah?.nomor || null,
        naskahJenis: naskah?.jenis || '',
        pemberiId: share.pemberiId,
        pemberiNama: share.pemberiNama,
        pemberiPositionText: share.pemberiPositionText,
        catatan: share.catatan,
        accessType: share.accessType,
        durationDays: share.durationDays,
        expiresAt: share.expiresAt,
        status: share.status,
        revokedAt: share.revokedAt,
        revokedReason: share.revokedReason,
        createdAt: share.createdAt,
        recipients: share.recipients.map((r) => ({
          id: r.id,
          recipientId: r.recipientId,
          nama: r.recipientNama,
          positionText: r.recipientPositionText,
          orgText: r.recipientOrgText,
          status: r.status,
          openedAt: r.openedAt,
        })),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE /naskah-share/:shareId/recipients/:recipientId — Revoke single recipient
  // ────────────────────────────────────────────────────────────────

  async revokeRecipient(
    user: JwtPayload,
    shareId: string,
    recipientId: string,
    reason?: string,
  ) {
    const share = await this.shareRepo.findOne({
      where: { id: shareId },
      relations: ['recipients'],
    });
    if (!share) throw new NotFoundException('Share tidak ditemukan');

    if (share.pemberiId !== user.position)
      throw new ForbiddenException('Hanya pemberi yang dapat mencabut akses');

    if (share.status !== ShareStatus.AKTIF)
      throw new BadRequestException('Share sudah berakhir sebelumnya');

    const recipient = share.recipients.find(
      (r) => r.recipientId === recipientId,
    );
    if (!recipient)
      throw new NotFoundException('Penerima tidak ditemukan dalam share ini');

    if (recipient.status === RecipientStatus.BERAKHIR)
      throw new BadRequestException(
        'Akses penerima ini sudah berakhir sebelumnya',
      );

    // Revoke this recipient
    recipient.status = RecipientStatus.BERAKHIR;
    await this.recipientRepo.save(recipient);

    // If all recipients revoked → mark share as BERAKHIR
    const allRevoked = share.recipients.every(
      (r) => r.id === recipient.id || r.status === RecipientStatus.BERAKHIR,
    );
    if (allRevoked) {
      share.status = ShareStatus.BERAKHIR;
      share.revokedAt = new Date();
      share.revokedReason = reason || null;
      await this.shareRepo.save(share);
    }

    // Audit log
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });
    await this.logRepo.save(
      this.logRepo.create({
        id: uuidv4(),
        shareId,
        naskahId: share.naskahId,
        aksi: ShareLogAksi.REVOKED,
        actorPersnum: user.persnum,
        actorNama: user.nama,
        actorPositionText: user.positionText,
        recipientPersnum: recipient.recipientPersnum,
        recipientNama: recipient.recipientNama,
        catatan: reason || null,
      }),
    );

    // Notify revoked recipient
    try {
      await this.notificationService.createNotification(
        {
          positionId: recipient.recipientId,
          userPersnum: recipient.recipientPersnum,
          type: NotificationType.NASKAH_SHARE_DICABUT,
          title: `Akses naskah telah berakhir oleh ${user.nama}`,
          body: naskah?.perihal || reason || 'Akses Anda telah berakhir',
          data: {
            naskahId: share.naskahId,
            shareId,
            pemberiName: user.nama,
            perihal: naskah?.perihal || '',
            action: 'OPEN_SHARE',
          },
        },
        true,
      );
    } catch (err: any) {
      this.logger.warn(
        `⚠️ Failed to send revoke notification: ${err?.message}`,
      );
    }

    return {
      success: true,
      message: `Akses ${recipient.recipientNama} berhasil diakhiri`,
      data: {
        shareId,
        recipientId,
        recipientNama: recipient.recipientNama,
        shareStatus: share.status,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE /naskah-share/:id — Revoke entire share (all recipients)
  // ────────────────────────────────────────────────────────────────

  async revokeShare(user: JwtPayload, id: string, reason?: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Only pemberi can revoke
    if (share.pemberiId !== user.position) {
      throw new ForbiddenException(
        'Hanya pemberi yang dapat mencabut akses share',
      );
    }

    // Must be AKTIF
    if (share.status !== ShareStatus.AKTIF) {
      throw new BadRequestException('Share sudah berakhir sebelumnya');
    }

    // Update share status
    share.status = ShareStatus.BERAKHIR;
    share.revokedAt = new Date();
    share.revokedReason = reason || null;
    await this.shareRepo.save(share);

    // Sinkronkan status semua recipient ke BERAKHIR agar konsisten dengan
    // revoke per-penerima. Tanpa ini, recipient tetap TERKIRIM meskipun
    // share induk sudah BERAKHIR — menyebabkan display status & filter
    // berbasis recipient status di FE tidak akurat.
    for (const recipient of share.recipients) {
      if (recipient.status !== RecipientStatus.BERAKHIR) {
        recipient.status = RecipientStatus.BERAKHIR;
        await this.recipientRepo.save(recipient);
      }
    }

    // Log audit trail
    await this.logRepo.save(
      this.logRepo.create({
        id: uuidv4(),
        shareId: id,
        naskahId: share.naskahId,
        aksi: ShareLogAksi.REVOKED,
        actorPersnum: user.persnum,
        actorNama: user.nama,
        actorPositionText: user.positionText,
        catatan: reason || null,
      }),
    );

    // Fetch naskah data for notification
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    // Send notification to all recipients
    for (const recipient of share.recipients) {
      try {
        await this.notificationService.createNotification(
          {
            positionId: recipient.recipientId,
            userPersnum: recipient.recipientPersnum,
            type: NotificationType.NASKAH_SHARE_DICABUT,
            title: `Akses naskah telah berakhir oleh ${user.nama}`,
            body: naskah?.perihal || reason || 'Akses Anda telah berakhir',
            data: {
              naskahId: share.naskahId,
              shareId: id,
              pemberiName: user.nama,
              perihal: naskah?.perihal || '',
              action: 'OPEN_SHARE',
            },
          },
          true,
        );
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Failed to send revoke notification to ${recipient.recipientNama}: ${err?.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'Akses share berhasil diakhiri',
      data: {
        id: share.id,
        status: ShareStatus.BERAKHIR,
        revokedAt: share.revokedAt,
        revokedReason: share.revokedReason,
        affectedRecipients: share.recipients.length,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // POST /naskah-share/:id/open — Open naskah (returns PDF URL)
  // SEKALI_LIHAT: auto-revoke after first open
  // ────────────────────────────────────────────────────────────────

  async openNaskah(user: JwtPayload, id: string) {
    const share = await this.shareRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
    if (!share) {
      throw new NotFoundException('Share tidak ditemukan');
    }

    // Check if user is sender or recipient
    const isPemberi = share.pemberiId === user.position;
    const recipientRecord = share.recipients.find(
      (r) => r.recipientId === user.position,
    );

    if (!isPemberi && !recipientRecord) {
      throw new ForbiddenException('Anda tidak memiliki akses ke share ini');
    }

    // Must be AKTIF — pemberi can always open (even if BERAKHIR)
    if (share.status !== ShareStatus.AKTIF && !isPemberi) {
      throw new BadRequestException('Share tidak aktif atau sudah berakhir');
    }

    // Check expiry for time-limited shares (pemberi always allowed)
    if (
      !isPemberi &&
      share.accessType === ShareAccessType.RENTANG_WAKTU &&
      share.expiresAt
    ) {
      if (new Date() > new Date(share.expiresAt)) {
        throw new BadRequestException('Akses share sudah kedaluwarsa');
      }
    }

    // Fetch naskah for PDF URL and notifications
    const naskah = await this.naskahRepo.findOne({
      where: { id: share.naskahId },
    });

    // Resolve PDF URL FIRST — before updating any status
    let pdfUrl: string | null = null;
    const pdfKey = naskah ? await this.resolveFinalPdfKey(naskah) : null;
    if (pdfKey) {
      try {
        pdfUrl = await this.storageService.getFileUrl(pdfKey);
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Failed to resolve PDF URL for naskah ${share.naskahId}: ${err?.message}`,
        );
      }
    }

    // If no PDF available, fall back to konten (HTML) instead of rejecting
    // (naskah final tanpa file attachment masih bisa dibuka via konten HTML)
    const konten = naskah?.konten || null;

    // SEKALI_LIHAT: cek "sudah dibuka sekali" SEBELUM cek ketersediaan dokumen,
    // agar pesan error tepat (bukan "dokumen tidak tersedia").
    if (
      recipientRecord &&
      share.accessType === ShareAccessType.SEKALI_LIHAT &&
      (recipientRecord.status === RecipientStatus.DIBACA ||
        recipientRecord.status === RecipientStatus.BERAKHIR)
    ) {
      throw new BadRequestException(
        'Share ini hanya dapat dibuka sekali. Akses sudah berakhir.',
      );
    }

    // Mark recipient as DIBACA BEFORE the document-availability check, so a
    // failed open (dokumen tidak tersedia) still clears the unread badge &
    // outline. SEKALI_LIHAT is handled separately below (after doc confirmed)
    // so a broken document doesn't consume the one-time view.
    if (recipientRecord && share.accessType !== ShareAccessType.SEKALI_LIHAT) {
      if (recipientRecord.status === RecipientStatus.TERKIRIM) {
        recipientRecord.status = RecipientStatus.DIBACA;
        recipientRecord.openedAt = new Date();
        await this.recipientRepo.save(recipientRecord);
      }
    }

    if (!pdfUrl && !konten) {
      throw new BadRequestException(
        'Dokumen tidak tersedia. Naskah mungkin belum difinalisasi atau ditandatangani.',
      );
    }

    // Update recipient status only if user is a recipient
    if (recipientRecord) {
      // SEKALI_LIHAT: langsung tandai BERAKHIR (tanpa save DIBACA perantara).
      if (share.accessType === ShareAccessType.SEKALI_LIHAT) {
        recipientRecord.status = RecipientStatus.BERAKHIR;
        recipientRecord.openedAt = new Date();
        await this.recipientRepo.save(recipientRecord);

        // If all recipients BERAKHIR → close the entire share
        const allRevoked = share.recipients.every(
          (r) =>
            r.id === recipientRecord.id ||
            r.status === RecipientStatus.BERAKHIR,
        );
        if (allRevoked) {
          share.status = ShareStatus.BERAKHIR;
          share.revokedAt = new Date();
          share.revokedReason =
            'Semua penerima sudah menggunakan akses sekali lihat';
          await this.shareRepo.save(share);
        }

        this.logger.log(
          `[openNaskah] View-once: recipient ${user.nama} auto-revoked for share ${id}`,
        );
      } else {
        recipientRecord.status = RecipientStatus.DIBACA;
        recipientRecord.openedAt = new Date();
        await this.recipientRepo.save(recipientRecord);
      }

      // Log audit trail
      await this.logRepo.save(
        this.logRepo.create({
          id: uuidv4(),
          shareId: id,
          naskahId: share.naskahId,
          aksi: ShareLogAksi.OPENED,
          actorPersnum: user.persnum,
          actorNama: user.nama,
          actorPositionText: user.positionText,
          recipientPersnum: share.pemberiPersnum,
          recipientNama: share.pemberiNama,
        }),
      );

      // Skip sending notification for NASKAH_SHARE_DIBUKA (read/open notification disabled per user preference)
      // try {
      //   await this.notificationService.createNotification(
      //     {
      //       positionId: share.pemberiId,
      //       userPersnum: share.pemberiPersnum,
      //       type: NotificationType.NASKAH_SHARE_DIBUKA,
      //       title: `${user.nama} membuka naskah yang Anda bagikan`,
      //       body: naskah?.perihal || '',
      //       data: {
      //         naskahId: share.naskahId,
      //         shareId: id,
      //         recipientName: user.nama,
      //         perihal: naskah?.perihal || '',
      //         action: 'OPEN_INBOX_DETAIL',
      //       },
      //     },
      //     true,
      //   );
      // } catch (err: any) {
      //   this.logger.warn(
      //     `⚠️ Failed to send open notification to pemberi: ${err?.message}`,
      //   );
      // }
    }

    return {
      success: true,
      message: 'Naskah berhasil dibuka',
      data: {
        naskahId: share.naskahId,
        perihal: naskah?.perihal || '',
        nomor: naskah?.nomor || null,
        jenis: naskah?.jenis || '',
        pemberi: {
          id: share.pemberiId,
          nama: share.pemberiNama,
          positionText: share.pemberiPositionText,
        },
        sharedAt: share.createdAt,
        accessType: share.accessType,
        expiresAt: share.expiresAt,
        pdfUrl,
        konten,
      },
    };
  }

  /**
   * Kirim naskah via email ke alamat email eksternal (diketik manual pengirim).
   * Menggunakan service email yang sama dengan fitur "Kirim Email" (mail-service),
   * dengan lampiran PDF final naskah.
   */
  async sendShareEmail(
    user: JwtPayload,
    naskahId: string,
    dto: {
      to: string;
      cc?: string;
      bcc?: string;
      from_as?: string;
    },
  ) {
    const naskah = await this.naskahRepo.findOne({ where: { id: naskahId } });
    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    await this.assertSenderCanShareNaskah(user, naskah);

    if (naskah.tahapan != null) {
      const config = await this.configNaskahLainnyaService.findByJenis(
        naskah.jenis,
      );
      if (!config.shareEnabled) {
        throw new BadRequestException(
          `Jenis naskah ${naskah.jenis} tidak diizinkan untuk dibagikan`,
        );
      }
    }

    // Resolve PDF final (naskah dinas reguler & naskah lainnya)
    const pdfKey = await this.resolveFinalPdfKey(naskah);
    if (!pdfKey) {
      throw new BadRequestException(
        'Naskah belum memiliki PDF final. Pastikan naskah sudah difinalisasi atau ditandatangani.',
      );
    }

    // Ambil PDF final sebagai buffer dari S3
    let pdfBase64: string;
    try {
      const pdfBuffer = await this.storageService.getFile(pdfKey);
      pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
    } catch (err: any) {
      this.logger.warn(
        `⚠️ Failed to fetch PDF for naskah ${naskahId}: ${err?.message}`,
      );
      throw new BadRequestException(
        'Gagal mengambil dokumen naskah. Silakan coba lagi.',
      );
    }

    const lampiran = [
      {
        filename: `${naskah.nomor || naskah.perihal || 'Naskah'}.pdf`.replace(
          /[/\\?%*:|"<>]/g,
          '_',
        ),
        filebase64: pdfBase64,
      },
    ];

    const emailPayload = {
      subjek: `${naskah.perihal || naskah.nomor || naskahId}`,
      from_as: dto.from_as || 'ARSIPKU',
      to: dto.to,
      konten:
        `<p>Yth. Bapak/Ibu,</p><br>` +
        `<p>Bersama email ini kami sampaikan dokumen korespondensi dari AirNav Indonesia.</p>` +
        `<p>Untuk informasi lebih lanjut, mohon dapat mengacu pada dokumen terlampir sesuai kebutuhan tindak lanjut.</p>` +
        `<p>Email ini dikirim secara otomatis melalui sistem korespondensi AirNav Indonesia dan tidak memerlukan balasan. (No Reply)</p>` +
        `<p>Atas perhatian dan kerja sama yang diberikan, kami ucapkan terima kasih.</p><br>` +
        `<p>Hormat kami,</p><p>AirNav Indonesia</p>`,
      cc: dto.cc || '',
      bcc: dto.bcc || '',
      lampiran,
    };

    const result = await this.mailServiceService.sendMailBase64(
      emailPayload,
      user.persnum,
      {
        naskah_id: naskahId,
        jenis_naskah: naskah.jenis || undefined,
        nomor_surat: naskah.nomor || undefined,
        perihal: naskah.perihal || undefined,
        sender_persnum: String(user.persnum),
        sender_nama: user.nama || undefined,
      },
    );

    return {
      success: true,
      message: 'Email berhasil dikirim',
      data: result,
    };
  }

  private async assertSenderCanShareNaskah(
    user: JwtPayload,
    naskah: NaskahEntity,
  ): Promise<void> {
    const hasAccess = user.position
      ? await this.sirkulasiRepo.findOne({
          where: { idNaskah: naskah.id, position: user.position },
        })
      : null;
    // Naskah Lainnya memakai workflow approval sendiri tanpa sirkulasi.
    const isNaskahLainnyaOwner =
      naskah.tahapan != null &&
      ((!!user.position &&
        String(naskah.dikirimOleh?.position_id ?? '') ===
          String(user.position)) ||
        (user.persnum != null &&
          naskah.dikirimOleh?.persnum != null &&
          Number(naskah.dikirimOleh.persnum) === Number(user.persnum)));
    if (!hasAccess && !isNaskahLainnyaOwner) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses ke naskah ${naskah.id}`,
      );
    }
  }

  /**
   * Naskah dinas reguler menyimpan PDF di `naskah.final_pdf`, sedangkan
   * Naskah Lainnya menyimpan artifact final di tabel versi dokumen. Resolver
   * ini menyatukan kedua pola penyimpanan untuk fitur berbagi.
   */
  private async resolveFinalPdfKey(naskah: NaskahEntity) {
    if (naskah.final_pdf) return naskah.final_pdf;

    // Naskah asli (ND/SDI/SDE) yang merupakan bagian dari workflow konsep —
    // final_pdf di naskahAsli baru di-set saat aksi 'finalize'. Sebelum itu,
    // snapshot PDF tersimpan di konsep_riwayat (id_naskah_konsep = id wrapper
    // Konsep). Ambil snapshot terbaru agar bisa dibuka/dibagikan sebelum final.
    if (naskah.id_naskah_konsep) {
      const riwayat = await this.konsepRiwayatRepo.find({
        where: { idNaskahKonsep: naskah.id_naskah_konsep },
        order: { urutan: 'DESC', createdAt: 'DESC' },
      });
      for (const row of riwayat) {
        if (row.pdfSnapshot) return row.pdfSnapshot;
      }
    }

    // Konsep (jenis 'K') wrapper — tiap aksi generate snapshot yang disimpan
    // dengan id_naskah_konsep = id konsep ini.
    if (String(naskah.jenis || '').toUpperCase() === 'K') {
      const riwayat = await this.konsepRiwayatRepo.find({
        where: { idNaskahKonsep: naskah.id },
        order: { urutan: 'DESC', createdAt: 'DESC' },
      });
      for (const row of riwayat) {
        if (row.pdfSnapshot) return row.pdfSnapshot;
      }
    }

    if (naskah.tahapan == null) return null;

    const documents = await this.naskahLainnyaDokumenRepo.find({
      where: {
        naskahId: naskah.id,
        status: In(['dittd', 'final']) as any,
      },
      order: { createdAt: 'DESC' },
    });

    const preferredDocuments =
      naskah.signOption === 'ttd_basah'
        ? [
            ...documents.filter((doc) => doc.tipe === 'naskah_fisik'),
            ...documents.filter((doc) => doc.tipe !== 'naskah_fisik'),
          ]
        : [
            ...documents.filter((doc) => doc.tipe === 'naskah'),
            ...documents.filter((doc) => doc.tipe !== 'naskah'),
          ];

    for (const document of preferredDocuments) {
      if (document.previewMinioKey) return document.previewMinioKey;
      if (
        document.mimetype === 'application/pdf' ||
        document.minioKey.toLowerCase().endsWith('.pdf')
      ) {
        return document.minioKey;
      }
    }

    return naskah.signedLampiran?.toLowerCase().endsWith('.pdf')
      ? naskah.signedLampiran
      : null;
  }

  private async findNotFinalizedNaskahs(naskahs: NaskahEntity[]) {
    // Konsep (jenis 'K') memang belum final — snapshot PDF di konsep_riwayat
    // menjadi bukti dokumen tersedia, jadi dikecualikan dari validasi.
    const candidates = naskahs.filter(
      (naskah) => String(naskah.jenis || '').toUpperCase() !== 'K',
    );
    const legacyCandidates = candidates.filter(
      (naskah) =>
        !['final', 'final_tte'].includes(naskah.status) &&
        naskah.tahapan === 'selesai' &&
        naskah.signOption !== 'ttd_basah',
    );
    if (legacyCandidates.length === 0) {
      return candidates.filter(
        (naskah) => !['final', 'final_tte'].includes(naskah.status),
      );
    }

    const finalDocuments = await this.naskahLainnyaDokumenRepo.find({
      where: {
        naskahId: In(legacyCandidates.map((naskah) => naskah.id)),
        tipe: 'naskah',
        status: 'dittd' as any,
      },
    });
    const finalizedLegacyIds = new Set(
      finalDocuments
        .filter(
          (document) =>
            !!document.previewMinioKey ||
            document.mimetype === 'application/pdf' ||
            document.minioKey.toLowerCase().endsWith('.pdf'),
        )
        .map((document) => document.naskahId),
    );

    return candidates.filter(
      (naskah) =>
        !['final', 'final_tte'].includes(naskah.status) &&
        !finalizedLegacyIds.has(naskah.id),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share/unread-count — Jumlah share diterima yang belum dibaca
  // ────────────────────────────────────────────────────────────────

  async getUnreadCount(user: JwtPayload): Promise<number> {
    const count = await this.recipientRepo
      .createQueryBuilder('r')
      .innerJoin(NaskahShareEntity, 'share', 'share.id = r.shareId')
      .where('r.recipientId = :positionId', { positionId: user.position })
      .andWhere('r.status = :status', { status: RecipientStatus.TERKIRIM })
      .andWhere('share.status = :shareStatus', {
        shareStatus: ShareStatus.AKTIF,
      })
      .andWhere('(share.expiresAt IS NULL OR share.expiresAt > :now)', {
        now: new Date(),
      })
      .getCount();
    return count;
  }

  // ────────────────────────────────────────────────────────────────
  // GET /naskah-share/search-user — Search user
  // ────────────────────────────────────────────────────────────────

  async searchUsers(user: JwtPayload, query: string) {
    if (!query || query.length < 2) {
      return { success: true, data: [] };
    }

    const searchTerm = `%${query}%`;
    const trimmed = query.trim();

    // Deteksi apakah query adalah e-NIK (semua digit, panjang >= 2).
    // Jika iya, gunakan exact-match OR prefix-match pada kolom persnum saja
    // (tidak ikut-ikutan mencari di name/uname), sehingga:
    //   • "10010105" → hanya match persnum persis (1 hasil) atau prefix-match.
    //   • "10010"   → LIKE '%50210%' persnum → tetap beberapa hasil.
    // Untuk query non-digit (nama/uname), gunakan LIKE pada name/uname.
    const isNikQuery = /^\d+$/.test(trimmed);

    let persons: Person[] = [];
    if (isNikQuery) {
      // Exact match (prioritas utama) + prefix match untuk e-NIK panjang.
      // Tidak ikut-ikut mencari di name/uname karena akan mengembalikan nama
      // yang kebetulan mengandung substring angka tersebut.
      persons = await this.personRepo.find({
        where: [
          {
            persnum: Number(trimmed),
            endDate: '9999-12-31',
          },
          {
            persnum: Raw(
              (alias) =>
                `CAST(${alias} AS CHAR) LIKE :persnumPrefix`,
              { persnumPrefix: `${trimmed}%` },
            ),
            endDate: '9999-12-31',
          },
        ],
        order: { persnum: 'ASC' },
        take: 20,
      });
    } else {
      // Pencarian nama/uname (substring match).
      persons = await this.personRepo.find({
        where: [
          { name: Like(searchTerm), endDate: '9999-12-31' },
          { uname: Like(searchTerm), endDate: '9999-12-31' },
        ],
        order: { name: 'ASC' },
        take: 20,
      });
    }

    if (persons.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch org_data for position info
    const orgData = await this.orgDataService.findLatestOrg();
    const persnums = persons
      .map((p) => p.persnum)
      .filter((p): p is number => p != null);

    const positionInfoMap = new Map<
      number,
      {
        id: string;
        positionText: string;
        organizationText: string;
      }
    >();

    if (orgData?.position_json && Array.isArray(orgData.position_json)) {
      for (const pos of orgData.position_json) {
        const pn = pos.persnum_person ?? pos.persnum;
        if (persnums.includes(pn)) {
          if (!positionInfoMap.has(pn)) {
            positionInfoMap.set(pn, {
              id: String(pos.position || ''),
              positionText: pos.position_text || '',
              organizationText: pos.organization_text || '',
            });
          }
        }
      }
    }

    const results = persons
      .map((p) => {
        const posInfo = positionInfoMap.get(p.persnum!);
        if (!posInfo) return null;
        // Exclude current user
        if (posInfo.id === user.position) return null;
        return {
          id: posInfo.id,
          persnum: p.persnum,
          nama: p.name || '',
          positionText: posInfo.positionText,
          organizationText: posInfo.organizationText,
        };
      })
      .filter(Boolean);

    // Dedupe by persnum (exact + prefix OR query dapat mengembalikan baris duplikat).
    const seen = new Set<number>();
    const dedupedResults = results.filter((r: any) => {
      if (seen.has(r.persnum)) return false;
      seen.add(r.persnum);
      return true;
    });

    return { success: true, data: dedupedResults };
  }

  // ────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────

  /**
   * Resolve satu posisi utama untuk setiap karyawan aktif dari snapshot org
   * terbaru. Dedupe berdasarkan persnum mengikuti pola endpoint my-position
   * (posisi pertama pada snapshot) dan mencegah satu orang menerima share serta
   * notifikasi berulang karena assignment/delegasi tambahan.
   */
  private async fetchAllEmployeeData(
    senderPositionId: string,
    senderPersnum: number,
  ): Promise<
    Array<{
      id: string;
      persnum: number;
      nama: string;
      positionText: string;
      organizationText: string;
    }>
  > {
    const orgData = await this.orgDataService.findLatestOrg();
    const positions = Array.isArray(orgData?.position_json)
      ? orgData.position_json
      : [];

    const positionByPersnum = new Map<number, any>();
    for (const position of positions) {
      const positionId = String(position.position ?? '');
      const persnum = Number(position.persnum_person ?? position.persnum);
      if (
        !positionId ||
        !Number.isFinite(persnum) ||
        persnum <= 0 ||
        positionId === String(senderPositionId) ||
        persnum === Number(senderPersnum) ||
        positionByPersnum.has(persnum)
      ) {
        continue;
      }
      positionByPersnum.set(persnum, position);
    }

    const persnums = [...positionByPersnum.keys()];
    const people: Person[] = [];
    for (let offset = 0; offset < persnums.length; offset += 1000) {
      people.push(
        ...(await this.personRepo.find({
          where: {
            persnum: In(persnums.slice(offset, offset + 1000)),
            endDate: '9999-12-31',
          },
        })),
      );
    }
    const personByPersnum = new Map(
      people
        .filter((person) => person.persnum != null)
        .map((person) => [Number(person.persnum), person]),
    );

    return persnums.flatMap((persnum) => {
      const person = personByPersnum.get(persnum);
      const position = positionByPersnum.get(persnum);
      if (!person || !position) return [];
      return [
        {
          id: String(position.position),
          persnum,
          nama: person.name || position.persnum_person_text || '',
          positionText: position.position_text || '',
          organizationText: position.organization_text || '',
        },
      ];
    });
  }

  private async fetchRecipientData(recipientIds: string[]): Promise<
    Array<{
      id: string;
      persnum: number;
      nama: string;
      positionText: string;
      organizationText: string;
    }>
  > {
    const orgData = await this.orgDataService.findLatestOrg();
    if (!orgData?.position_json || !Array.isArray(orgData.position_json)) {
      return [];
    }

    const results: Array<{
      id: string;
      persnum: number;
      nama: string;
      positionText: string;
      organizationText: string;
    }> = [];

    this.logger.debug(
      `[fetchRecipientData] Looking for recipientIds: ${JSON.stringify(recipientIds)}`,
    );
    this.logger.debug(
      `[fetchRecipientData] Total position_json entries: ${orgData.position_json.length}`,
    );

    for (const pos of orgData.position_json) {
      const posId = String(pos.position || '');
      if (recipientIds.includes(posId)) {
        this.logger.debug(
          `[fetchRecipientData] Matched position ${posId}, persnum_person=${pos.persnum_person}, persnum=${pos.persnum}`,
        );
        // Find person by persnum
        const persnum = Number(pos.persnum_person ?? pos.persnum);
        if (!persnum || isNaN(persnum)) {
          this.logger.warn(
            `[fetchRecipientData] Position ${posId} has no valid persnum, skipping`,
          );
          continue;
        }
        let person = await this.personRepo.findOne({
          where: { persnum, endDate: '9999-12-31' },
        });

        if (!person) {
          // Fallback: try without endDate filter
          this.logger.debug(
            `[fetchRecipientData] Person not found with endDate filter, trying without. persnum=${persnum}`,
          );
          person = await this.personRepo.findOne({
            where: { persnum },
          });
        }

        if (person) {
          this.logger.debug(
            `[fetchRecipientData] Found person: ${person.name} (persnum=${person.persnum})`,
          );
          results.push({
            id: posId,
            persnum,
            nama: person.name || '',
            positionText: pos.position_text || '',
            organizationText: pos.organization_text || '',
          });
        } else {
          this.logger.warn(
            `[fetchRecipientData] No person found for persnum=${persnum} (position ${posId})`,
          );
        }
      }
    }

    this.logger.debug(
      `[fetchRecipientData] Returning ${results.length} results`,
    );
    return results;
  }
}
