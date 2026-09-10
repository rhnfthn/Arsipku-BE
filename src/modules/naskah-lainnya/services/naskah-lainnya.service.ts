import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../../storage/services/storage.service';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from '../entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from '../entities/naskah-lainnya-dokumen.entity';
import { WorkflowService, Tahapan, JenisAksi } from './workflow.service';
import { DocxReaderService, DocxParameter } from './docx-reader.service';
import { DocxQrInlineService, SignedSigner } from './docx-qr-inline.service';
import { DigsigService } from '../../digsig/services/digsig.service';
import { GeneratePdfLpdService } from '../../generate_pdf/services/generate_pdf_lpd.service';
import { GeneratePdfBlankoVerbalService } from '../../generate_pdf/services/generate_pdf_blanko_verbal.service';
import { SheetPdfData } from '../../generate_pdf/services/sheet-pdf.shared';
import {
  LegalRoleService,
  LegalPerson,
} from '../../konfigurasi/services/legal-role.service';
import { NomorService } from '../../nomor/services/nomor.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import {
  NASKAH_LAINNYA_JENIS,
  BuatNaskahDto,
  UpdateNaskahDto,
  EvaluasiDto,
  KirimEvaluasiDto,
  KeputusanEvaluasiDto,
  TeruskanPersetujuanDto,
  BlankoDto,
  SheetDataDto,
  AssignDelegasiDireksiDto,
} from '../dto/index.dto';
import { buildNomorRegex } from './nomor-format.helper';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { GotenbergService } from '../../gotenberg/gotenberg.service';

export interface CurrentUser {
  persnum: number;
  nama: string;
  positionText?: string;
  /** Position ID dari JWT (JwtPayload.position) — dipakai match approval table */
  position?: string;
  positionId?: string;
  positionAbbreviation?: string;
  areaText?: string;
  // Penomoran naskah-lainnya — sumber segmen {JABATAN}/{LOKASI}/{INSTANSI} (dari JwtPayload)
  abbreviation?: string;
  area?: string;
  company?: string;
  subArea?: string;
  organization?: string;
}

@Injectable()
export class NaskahLainnyaService {
  private readonly logger = new Logger(NaskahLainnyaService.name);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    @InjectRepository(NaskahLainnyaApprovalEntity)
    private readonly approvalRepo: Repository<NaskahLainnyaApprovalEntity>,
    @InjectRepository(NaskahLainnyaRiwayatEntity)
    private readonly riwayatRepo: Repository<NaskahLainnyaRiwayatEntity>,
    @InjectRepository(NaskahLainnyaBlankoEntity)
    private readonly blankoRepo: Repository<NaskahLainnyaBlankoEntity>,
    @InjectRepository(NaskahLainnyaDokumenEntity)
    private readonly dokumenRepo: Repository<NaskahLainnyaDokumenEntity>,
    private readonly workflow: WorkflowService,
    private readonly docxReader: DocxReaderService,
    private readonly docxQrInline: DocxQrInlineService,
    private readonly lpdService: GeneratePdfLpdService,
    private readonly blankoService: GeneratePdfBlankoVerbalService,
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly legalRoleService: LegalRoleService,
    private readonly nomorService: NomorService,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
    private readonly realtimeEmitService: RealtimeEmitService,
    private readonly gotenberg: GotenbergService,
    private readonly digsigService: DigsigService,
  ) {}

  /**
   * Recalculate queue badges only for positions touched by this naskah plus all
   * active legal positions. Failures here must never roll back the workflow.
   */
  private async emitQueueCounts(naskah: NaskahEntity): Promise<void> {
    try {
      const [approvalRows, legalPeople] = await Promise.all([
        this.approvalRepo.find({ where: { naskahId: naskah.id } }),
        this.legalRoleService.findAll(),
      ]);
      const positions = new Set<string>();
      approvalRows.forEach((row) => {
        if (row.positionId) positions.add(String(row.positionId));
      });
      (naskah.penandatanganChain ?? []).forEach((signer) => {
        if (signer.positionId) positions.add(String(signer.positionId));
      });
      if (naskah.penandatanganPositionId) {
        positions.add(String(naskah.penandatanganPositionId));
      }

      await Promise.all(
        [...positions].map(async (positionId) => {
          const result = await this.getPersetujuan(
            { position: positionId, positionId, persnum: 0, nama: '' },
            'menunggu',
          );
          this.realtimeEmitService.emitNaskahLainnyaPersetujuanCount(
            positionId,
            Array.isArray(result.data) ? result.data.length : 0,
          );
        }),
      );

      const activeLegal = legalPeople.filter((person) => person.isActive);
      if (activeLegal.length > 0) {
        const sample = activeLegal[0];
        const result = await this.getLegalDrafting(
          {
            position: sample.positionId,
            positionId: sample.positionId,
            persnum: sample.persnum ?? 0,
            nama: sample.nama,
          },
          'belum-dikirim',
        );
        const count = Array.isArray(result.data)
          ? result.data.filter((item: any) =>
              ['belum_dikirim', 'revisi'].includes(item.statusLegal),
            ).length
          : 0;
        activeLegal.forEach((person) =>
          this.realtimeEmitService.emitNaskahLainnyaLegalDraftingCount(
            person.positionId,
            count,
          ),
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `[NaskahLainnya] Gagal sinkronisasi badge realtime: ${error?.message}`,
      );
    }
  }

  /** Notify the people whose action is active after a successful transition. */
  private async notifyCurrentQueue(naskah: NaskahEntity): Promise<void> {
    try {
      const commonData = {
        naskahId: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        perihal: naskah.perihal,
      };

      if (naskah.tahapan === 'legal_drafting') {
        const approvalRows = await this.approvalRepo.find({
          where: { naskahId: naskah.id, tahap: 'legal_drafting' },
        });
        const waitingApprovalRows = approvalRows.filter(
          (row) => row.status === 'waiting',
        );

        // Setelah drafter mengirim approval, pekerjaan aktif berpindah ke
        // approver yang dipilih dan muncul di menu Persetujuan mereka.
        if (waitingApprovalRows.length > 0) {
          const minOrder = Math.min(
            ...waitingApprovalRows.map((row) => row.urutan),
          );
          const activeRows = waitingApprovalRows.filter(
            (row) => row.urutan === minOrder,
          );
          await Promise.all(
            activeRows
              .filter((row) => !!row.positionId)
              .map((row) =>
                this.notificationService.createNotification({
                  positionId: String(row.positionId),
                  type: NotificationType.SYSTEM,
                  title: 'Naskah menunggu persetujuan Legal Drafting',
                  body: `${naskah.perihal || naskah.nomor || 'Naskah baru'} menunggu persetujuan Anda.`,
                  data: {
                    ...commonData,
                    action: 'OPEN_NASKAH_LAINNYA_PERSETUJUAN',
                  },
                }),
              ),
          );
          return;
        }

        const legalPeople = (await this.legalRoleService.findAll()).filter(
          (person) => person.isActive,
        );
        await Promise.all(
          legalPeople.map((person) =>
            this.notificationService.createNotification({
              positionId: person.positionId,
              userPersnum: person.persnum ?? undefined,
              type: NotificationType.SYSTEM,
              title: 'Naskah menunggu Legal Drafting',
              body: `${naskah.perihal || naskah.nomor || 'Naskah baru'} menunggu proses Legal Drafting.`,
              data: {
                ...commonData,
                action: 'OPEN_NASKAH_LAINNYA_LEGAL_DRAFTING',
              },
            }),
          ),
        );
        return;
      }

      if (naskah.tahapan === 'tanda_tangan') {
        const chain = naskah.penandatanganChain ?? [];
        const signer = chain[(naskah.signingIndex ?? 1) - 1];
        const positionId = signer?.positionId ?? naskah.penandatanganPositionId;
        if (positionId) {
          await this.notificationService.createNotification({
            positionId: String(positionId),
            userPersnum:
              signer?.persnum ?? naskah.penandatanganPersnum ?? undefined,
            type: NotificationType.SYSTEM,
            title: 'Naskah menunggu tanda tangan',
            body: `${naskah.perihal || naskah.nomor || 'Naskah'} menunggu tanda tangan Anda.`,
            data: {
              ...commonData,
              action: 'OPEN_NASKAH_LAINNYA_PERSETUJUAN',
            },
          });
        }
        return;
      }

      const rows = await this.approvalRepo.find({
        where: { naskahId: naskah.id },
      });
      const activeTahaps =
        naskah.tahapan === 'blanko_verbal'
          ? ['blanko_verbal', 'blanko_verbal_ditetapkan']
          : [String(naskah.tahapan)];
      const waiting = rows.filter(
        (row) => activeTahaps.includes(row.tahap) && row.status === 'waiting',
      );
      if (waiting.length === 0) return;
      const isParallel = ['persetujuan_direksi', 'blanko_verbal'].includes(
        String(naskah.tahapan),
      );
      const minOrder = Math.min(...waiting.map((row) => row.urutan));
      const activeRows = isParallel
        ? waiting
        : waiting.filter((row) => row.urutan === minOrder);
      await Promise.all(
        activeRows
          .filter((row) => !!row.positionId)
          .map((row) =>
            this.notificationService.createNotification({
              positionId: String(row.positionId),
              type: NotificationType.SYSTEM,
              title: 'Naskah menunggu persetujuan',
              body: `${naskah.perihal || naskah.nomor || 'Naskah baru'} menunggu persetujuan Anda.`,
              data: {
                ...commonData,
                action: 'OPEN_NASKAH_LAINNYA_PERSETUJUAN',
              },
            }),
          ),
      );
    } catch (error: any) {
      this.logger.warn(
        `[NaskahLainnya] Gagal membuat notifikasi workflow: ${error?.message}`,
      );
    }
  }

  private async publishWorkflowUpdate(
    naskah: NaskahEntity,
    notify = false,
  ): Promise<void> {
    // Detail client hanya menerima invalidasi ringan dan mengambil ulang data
    // melalui endpoint GET yang tetap menjadi sumber data + otorisasi utama.
    this.emitDetailUpdate(naskah.id);
    await this.emitQueueCounts(naskah);
    if (notify) await this.notifyCurrentQueue(naskah);
  }

  private emitDetailUpdate(naskahId: string): void {
    this.realtimeEmitService.emitNaskahLainnyaUpdated(naskahId);
  }

  private async resolvePenandatanganSnapshot(p: {
    positionId?: string | null;
    persnum?: number | null;
    nama: string;
    jabatan: string;
  }): Promise<{
    positionId?: string;
    persnum?: number;
    nama: string;
    jabatan: string;
  }> {
    let orgSigner: any | null = null;
    if (p.persnum != null) {
      try {
        orgSigner = await this.orgDataService.findByPersnum(Number(p.persnum));
      } catch {
        orgSigner = null;
      }
    }
    if (!orgSigner && p.positionId) {
      try {
        const latestOrg = await this.orgDataService.findLatestOrg();
        const rows = Array.isArray(latestOrg?.position_json)
          ? latestOrg.position_json
          : [];
        const row = rows.find(
          (x: any) => Number(x.position) === Number(p.positionId),
        );
        if (row) {
          orgSigner = {
            position: row.position,
            positionText: row.position_text,
            persnum: row.persnum_person,
            nama: row.persnum_person_text,
          };
        }
      } catch {
        orgSigner = null;
      }
    }
    return {
      positionId: p.positionId
        ? String(p.positionId)
        : orgSigner?.position != null
          ? String(orgSigner.position)
          : undefined,
      persnum:
        orgSigner?.persnum != null
          ? Number(orgSigner.persnum)
          : (p.persnum ?? undefined),
      nama: orgSigner?.nama || p.nama,
      jabatan: orgSigner?.positionText || p.jabatan,
    };
  }

  // ---------- List ----------

  async getList(
    query: {
      tab?: string;
      search?: string;
      jenis?: string;
      tahapan?: string;
      page?: number;
    },
    user: CurrentUser,
  ) {
    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', {
        jenis: NASKAH_LAINNYA_JENIS,
      })
      .orderBy('n.createdAt', 'DESC');

    // Match pemrakarsa via identity unik: position_id ATAU persnum dari dikirim_oleh.
    // JANGAN fallback ke created_by_position (menyimpan jabatan TEXT, bukan id unik) —
    // matching by jabatan text bocorkan naskah antar user yang share jabatan.
    const posId = user.positionId ?? user.position;
    qb.andWhere(
      '(JSON_EXTRACT(n.dikirim_oleh, :jsonPathPos) = :posId OR JSON_EXTRACT(n.dikirim_oleh, :jsonPathPers) = :persnum)',
      {
        jsonPathPos: '$.position_id',
        posId,
        jsonPathPers: '$.persnum',
        persnum: user.persnum,
      },
    );
    if (query.search) {
      qb.andWhere('n.perihal LIKE :s', { s: `%${query.search}%` });
    }
    if (query.jenis) qb.andWhere('n.jenis = :j', { j: query.jenis });
    if (query.tahapan) {
      qb.andWhere('n.tahapan = :t', { t: query.tahapan });
    } else {
      // Exclude draft (konsep) dari daftar utama — draft ada di halaman terpisah.
      // Naskah milik user sendiri tetap muncul regardless of tahapan (persetujuan, selesai, dll).
      qb.andWhere('(n.tahapan IS NULL OR n.tahapan != :konsep)', {
        konsep: 'konsep',
      });
      // Legal-role user mengakses naskah legal_drafting/blanko_verbal via menu
      // Legal Drafting — jangan duplikat di Daftar umum. Non-legal pemrakarsa
      // tetap melihat naskahnya di Daftar (mereka tak punya menu Legal Drafting).
      const activeLegalIds = await this.legalRoleService.getActivePositionIds();
      const legalPosId = String(user.positionId ?? user.position ?? '');
      if (activeLegalIds.includes(legalPosId)) {
        qb.andWhere('n.tahapan NOT IN (:...ex)', {
          ex: ['legal_drafting', 'blanko_verbal'],
        });
      }
    }

    const rows = await qb.getMany();
    const pemrakarsaPejabatByNaskah = await this.getPemrakarsaPejabatByNaskah(
      rows.map((row) => row.id),
    );
    return {
      success: true,
      data: rows.map((r) => ({
        ...this.toListItem(r),
        pemrakarsaPejabat: pemrakarsaPejabatByNaskah.get(r.id),
      })),
    };
  }

  /**
   * Ambil daftar naskahId di mana user ini adalah approver/penandatangan
   * (match berdasarkan positionId atau nama di naskah_lainnya_approval).
   */
  private async getNaskahIdsForApprover(user: CurrentUser): Promise<string[]> {
    const conditions: string[] = [];
    const params: Record<string, any> = {};
    const posId = user.positionId ?? user.position;
    if (posId) {
      conditions.push('a.position_id = :positionId');
      params.positionId = posId;
    }
    if (user.nama) {
      // Data org/recipient sering menyimpan kapitalisasi nama berbeda dengan JWT.
      // Normalisasi ini memastikan naskah yang sudah disetujui tetap muncul pada
      // tab "Disetujui" milik approver yang sama.
      conditions.push('LOWER(TRIM(a.nama)) = LOWER(TRIM(:nama))');
      params.nama = user.nama;
    }
    if (conditions.length === 0) return [];
    const rows = await this.approvalRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.naskah_id', 'naskahId')
      .where(`(${conditions.join(' OR ')})`)
      .setParameters(params)
      .getRawMany<{ naskahId: string }>();
    return rows.map((r) => r.naskahId);
  }

  // Apakah user (by positionId) adalah penandatangan AKTIF — giliran menandatangani
  // sekarang — pada naskah? Dipakai filter antrian "Menunggu" agar naskah yang SUDAH
  // ditandatangani user (signingIndex lewat posisi user di chain) tidak muncul lagi.
  private isCurrentSigner(n: NaskahEntity, posId: string): boolean {
    const chain = n.penandatanganChain ?? [];
    if (chain.length) {
      // Multi-signer: signingIndex null → fase tanda tangan belum/diluar aktif →
      // bukan giliran siapa pun di chain.
      if (n.signingIndex == null) return false;
      return chain[n.signingIndex - 1]?.positionId === posId;
    }
    // Single-signer fallback: satu-satunya penandatangan → saat tahapan=tanda_tangan
    // (filter query sudah batasi tanda_tangan) giliran-nya.
    return (n.penandatanganPositionId ?? undefined) === posId;
  }

  private toListItem(r: NaskahEntity) {
    // Pemrakarsa: ambil nama & jabatan dari dikirimOleh (JSON snapshot),
    // fallback ke createdByPosition (jabatan saja) jika dikirimOleh null.
    const dikirim = r.dikirimOleh;
    const pemrakarsaNama = dikirim?.nama ?? r.createdByPosition ?? '-';
    const pemrakarsaJabatan =
      dikirim?.position_text ?? r.createdByPosition ?? '-';
    const pemrakarsaPersnum = dikirim?.persnum
      ? Number(dikirim.persnum)
      : undefined;

    // Penandatangan: kembalikan sebagai array (dukung multiple).
    // Jika penandatanganChain ada, pakai isinya; jika tidak, fallback ke single
    // dari atasNama + penandatanganJabatan (backward compat).
    const penandatangan = r.penandatanganChain?.length
      ? r.penandatanganChain.map((p) => ({
          nama: p.nama,
          jabatan: p.jabatan,
          positionId: p.positionId,
          persnum: p.persnum,
        }))
      : [
          {
            nama: r.atasNama ?? '-',
            jabatan: r.penandatanganJabatan ?? '',
            positionId: r.penandatanganPositionId ?? undefined,
            persnum: r.penandatanganPersnum ?? undefined,
          },
        ];

    return {
      id: r.id,
      nomor: r.nomor,
      jenis: r.jenis,
      // Tidak semua template mempunyai placeholder/perihal. Tetap tampilkan
      // label yang jelas di seluruh daftar dan halaman detail.
      perihal: r.perihal?.trim() || 'Tanpa Perihal',
      pemrakarsa: {
        nama: pemrakarsaNama,
        jabatan: pemrakarsaJabatan,
        persnum: pemrakarsaPersnum,
      },
      tahapan: (r.tahapan ?? 'konsep') as Tahapan,
      signOption: r.signOption ?? 'digsig',
      documentStatus: r.status ?? 'draf',
      // Tahapan tetap merepresentasikan workflow. Metadata ini secara eksplisit
      // membedakan naskah TTD fisik yang selesai tetapi file finalnya belum diunggah.
      isTtdFisik: r.signOption === 'ttd_basah',
      manualFinalStatus:
        r.signOption === 'ttd_basah'
          ? r.status === 'final'
            ? 'final'
            : 'belum_final'
          : undefined,
      butuhLegal: r.butuhLegal,
      penandatangan,
      tanggal: new Date(r.tanggal).toISOString().slice(0, 10),
      terakhirDiubah: r.createdAt.toISOString(),
    };
  }

  /**
   * Pejabat pemrakarsa pada daftar adalah simpul terakhir/tertinggi dari rantai
   * approval awal (`tahap=persetujuan`), bukan user konseptor yang mengirim.
   * Query dilakukan sekali untuk seluruh halaman agar tidak menimbulkan N+1.
   */
  private async getPemrakarsaPejabatByNaskah(
    naskahIds: string[],
  ): Promise<
    Map<string, { nama: string; jabatan: string; positionId?: string }>
  > {
    if (naskahIds.length === 0) return new Map();
    const rows =
      (await this.approvalRepo.find({
        where: {
          naskahId: In(naskahIds),
          tahap: 'persetujuan',
        },
        select: [
          'naskahId',
          'tahap',
          'positionId',
          'nama',
          'jabatan',
          'urutan',
        ],
      })) ?? [];
    const grouped = new Map<string, NaskahLainnyaApprovalEntity[]>();
    for (const row of rows) {
      if (row.tahap !== 'persetujuan' || !naskahIds.includes(row.naskahId)) {
        continue;
      }
      const group = grouped.get(row.naskahId) ?? [];
      group.push(row);
      grouped.set(row.naskahId, group);
    }
    return new Map(
      [...grouped.entries()].flatMap(([naskahId, group]) => {
        const pejabat = this.resolvePemrakarsaPejabat(group);
        return pejabat ? [[naskahId, pejabat]] : [];
      }),
    );
  }

  /**
   * Pemrakarsa pejabat adalah approval paling akhir pada rantai persetujuan
   * awal. Identitas pembuat/konseptor tetap disimpan terpisah di `pemrakarsa`
   * karena masih dipakai untuk otorisasi edit dan pengelolaan naskah.
   */
  private resolvePemrakarsaPejabat(
    approval: NaskahLainnyaApprovalEntity[],
  ): { nama: string; jabatan: string; positionId?: string } | undefined {
    const lastApproval = approval
      .filter((row) => row.tahap === 'persetujuan')
      .reduce<
        NaskahLainnyaApprovalEntity | undefined
      >((latest, row) => (!latest || row.urutan > latest.urutan ? row : latest), undefined);
    if (!lastApproval) return undefined;
    return {
      nama: lastApproval.nama,
      jabatan: lastApproval.jabatan,
      positionId: lastApproval.positionId ?? undefined,
    };
  }

  // ---------- Detail ----------

  async getDetail(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    await this.repairLegacyManualFinalDocument(n);
    const [approval, riwayat, dokumen, manualFinalDoc] = await Promise.all([
      this.approvalRepo.find({
        where: { naskahId: id },
        order: { urutan: 'ASC' },
      }),
      this.riwayatRepo.find({
        where: { naskahId: id },
        order: { tanggal: 'ASC' },
      }),
      this.findDokumen(n),
      n.signOption === 'ttd_basah'
        ? this.dokumenRepo.findOne({
            where: {
              naskahId: id,
              tipe: 'naskah_fisik',
              status: 'final' as any,
            },
          })
        : Promise.resolve(null),
    ]);
    await this.repairLegacySheetMetadataApprovals(approval);
    await this.recoverCompletedCombinedLpd(n, approval, user);
    await this.recoverCompletedBlankoVerbal(n, approval, user);
    await this.recoverEvaluasiEvpRow(n, approval);
    this.applySheetDocumentStatuses(dokumen, approval);
    const pemrakarsaPejabat = this.resolvePemrakarsaPejabat(approval);

    // Cek apakah user adalah approver yang sedang menunggu (status='waiting')
    // untuk naskah ini. Berjenjang: hanya urutan terendah yang masih waiting yang
    // berhak setuju/tolak/kembalikan; urutan lebih tinggi tunggu urutan sebelumnya.
    // Giliran approval hanya dibandingkan dalam tahap aktif. Waiting dari tahap
    // lain (mis. legal drafting/direksi) tidak boleh memengaruhi aksi Persetujuan.
    const waitingRows = approval.filter(
      (a) => a.tahap === n.tahapan && a.status === 'waiting',
    );
    const minUrutan = waitingRows.length
      ? Math.min(...waitingRows.map((a) => a.urutan))
      : null;
    const isCurrentApprover = waitingRows
      .filter((a) => a.urutan === minUrutan)
      .some((a) => this.isApprovalAssignedToUser(a, user));

    // Cek apakah user adalah pemrakarsa (match via identity unik: position_id atau persnum).
    // Jangan match by createdByPosition (jabatan text) — bocor antar user dengan jabatan sama.
    const posId = user.positionId ?? user.position;
    const isPemrakarsa = this.isPemrakarsa(n, user);

    // POV approval: legal role hanya lihat approval legal_drafting; pemrakarsa hanya
    // persetujuan. Flat `approval` tetap utuh (dipakai FE untuk logic aksi);
    // hanya `approvalByTahap` (display grup approval) yang difilter per POV.
    const legalPeople = await this.legalRoleService.findAll();
    const activeLegalIds = legalPeople
      .filter((person) => person.isActive)
      .map((person) => person.positionId);
    const isLegal = !!posId && activeLegalIds.includes(String(posId));
    const delegatedLegalActors = new Map(
      legalPeople
        .filter((person) => person.isDelegasi)
        .map((person) => [
          person.positionId,
          { nama: person.nama, positionStatus: person.positionStatus },
        ]),
    );
    // Lembar persetujuan direksi adalah kelanjutan pekerjaan legal drafter, bukan
    // pekerjaan setiap user yang kebetulan memiliki role legal. Tanpa pembatasan
    // ini, approver legal yang sudah menyetujui bisa kembali melihat aksi membuat
    // lembar saat naskah masuk tahap evaluasi.
    const latestLegalSubmission = [...riwayat]
      .reverse()
      .find((row) => row.aksi === 'kirim-approval-legal');
    const isLegalDrafter =
      !!latestLegalSubmission?.aktor &&
      !!user.nama &&
      latestLegalSubmission.aktor.trim().toLowerCase() ===
        user.nama.trim().toLowerCase();

    // Build available actions, lalu filter berdasarkan role user:
    // - persetujuan: hanya approver waiting yang bisa setuju/tolak/kembalikan
    // - konsep/perlu_perbaikan: hanya pemrakarsa yang bisa kirim
    // - tanda_tangan_*: hanya penandatangan yang bisa tanda-tangan
    const hasWaitingLegalRows = approval.some(
      (a) => a.tahap === 'legal_drafting' && a.status === 'waiting',
    );
    // Keberadaan approval lembar harus dihitung khusus untuk tahap aktif.
    // Riwayat Persetujuan Direksi legacy tidak boleh membuat tombol pembuatan
    // Blanko Verbal baru menghilang (dan sebaliknya).
    const activeSheetTahaps =
      n.tahapan === 'blanko_verbal'
        ? ['blanko_verbal', 'blanko_verbal_ditetapkan']
        : ['persetujuan_direksi', 'persetujuan_direksi_ditetapkan'];
    const hasDireksiRows = approval.some((a) =>
      activeSheetTahaps.includes(a.tahap),
    );
    let availableActions = await this.workflow.buildAvailableActions(
      (n.tahapan ?? 'konsep') as Tahapan,
      n.butuhLegal,
      user,
      hasWaitingLegalRows,
      hasDireksiRows,
      n.signOption,
    );

    // Filter aksi persetujuan: hanya approver waiting yang berhak
    if (n.tahapan === 'persetujuan' && !isCurrentApprover) {
      availableActions = availableActions.filter(
        (a) => a !== 'setuju' && a !== 'tolak' && a !== 'kembalikan',
      );
    }

    // Rantai Legal Drafting diproses hanya dari workspace Legal.
    if (n.tahapan === 'legal_drafting' && hasWaitingLegalRows) {
      const approvalActions: JenisAksi[] = ['setuju', 'tolak', 'kembalikan'];
      availableActions = availableActions.filter(
        (action) => !approvalActions.includes(action),
      );
      if (isCurrentApprover) {
        availableActions = [
          ...availableActions.filter(
            (action) => action !== 'kirim-approval-legal',
          ),
          'kirim-approval-legal',
        ];
      }
    }

    // Filter aksi kirim: hanya pemrakarsa yang bisa kirim (konsep/perlu_perbaikan)
    if (
      (n.tahapan === 'konsep' || n.tahapan === 'perlu_perbaikan') &&
      !isPemrakarsa
    ) {
      availableActions = availableActions.filter((a) => a !== 'kirim');
    }

    // Evaluasi: hasil Legal Drafting otomatis jatuh ke pejabat pemrakarsa (EVP)
    // saat drafting selesai — konseptor pemrakarsa tidak lagi menerima naskah
    // di tahap ini. Keputusan hanya milik EVP aktif.
    if (n.tahapan === 'evaluasi') {
      availableActions = availableActions.filter(
        (a) => a !== 'evaluasi' && a !== 'kembalikan-evaluasi',
      );
      if (isCurrentApprover) {
        availableActions.push(
          'lanjut-persetujuan',
          'legal-drafting-ulang',
          'batalkan-evaluasi',
        );
      }
    }

    if (n.tahapan === 'persetujuan_lanjutan') {
      availableActions = isCurrentApprover
        ? ['teruskan-persetujuan', 'selesai-persetujuan']
        : [];
    }

    if (n.tahapan === 'evaluasi_final') {
      availableActions = isCurrentApprover
        ? ['lanjut-persetujuan', 'legal-drafting-ulang', 'batalkan-evaluasi']
        : [];
    }

    // Saat evaluasi/PD, hanya drafter yang mengirim approval legal terakhir yang
    // boleh menyusun atau mengirim lembar persetujuan direksi. Approver legal
    // sebelumnya tetap dapat melihat riwayat, tetapi tidak mendapat aksi baru.
    if (
      (n.tahapan === 'evaluasi' || n.tahapan === 'persetujuan_direksi') &&
      !isLegalDrafter
    ) {
      availableActions = availableActions.filter(
        (action) => action !== 'kirim-lembar-persetujuan-direksi',
      );
    }

    if (n.tahapan === 'persetujuan_direksi' || n.tahapan === 'blanko_verbal') {
      const sheetTahaps =
        n.tahapan === 'persetujuan_direksi'
          ? ['persetujuan_direksi_ditetapkan', 'persetujuan_direksi']
          : ['blanko_verbal_ditetapkan', 'blanko_verbal'];
      const isCurrentSheetApprover = approval
        .filter((a) => sheetTahaps.includes(a.tahap) && a.status === 'waiting')
        .some((a) => this.isApprovalAssignedToUser(a, user));
      const sheetActions: JenisAksi[] = ['paraf', 'tolak'];
      if (isCurrentSheetApprover) {
        availableActions = Array.from(
          new Set([
            ...availableActions.filter(
              (action) => !sheetActions.includes(action),
            ),
            ...sheetActions,
          ]),
        );
      } else {
        availableActions = availableActions.filter(
          (action) => !sheetActions.includes(action),
        );
      }
    }

    // Hanya penandatangan aktif yang boleh menandatangani atau menolak ke legal.
    if (n.tahapan === 'tanda_tangan') {
      const chain = n.penandatanganChain?.length
        ? n.penandatanganChain
        : [
            {
              positionId:
                n.penandatanganPositionId != null
                  ? String(n.penandatanganPositionId)
                  : '',
              persnum: n.penandatanganPersnum ?? undefined,
            },
          ];
      const idx = n.signingIndex ?? 1;
      const current = chain[idx - 1];
      const isCurrent =
        !!current &&
        ((current.persnum != null &&
          Number(current.persnum) === Number(user.persnum)) ||
          (current.positionId != null && current.positionId === posId));
      if (!isCurrent) {
        availableActions = availableActions.filter(
          (a) => a !== 'tanda-tangan' && a !== 'tolak-tanda-tangan',
        );
      }
      // Digital tanpa proses Legal tidak mempunyai tujuan pengembalian ke Unit
      // Legal, sehingga penandatangan hanya memperoleh aksi tanda tangan.
      if (n.signOption !== 'ttd_basah' && !n.butuhLegal) {
        availableActions = availableActions.filter(
          (a) => a !== 'tolak-tanda-tangan',
        );
      }
    }

    return {
      success: true,
      data: {
        ...this.toListItem(n),
        // Untuk display: pejabat tertinggi/terakhir pada approval awal.
        // `pemrakarsa` tetap menunjuk konseptor agar authorization existing aman.
        pemrakarsaPejabat,
        klasifikasi: n.klasifikasi ?? 'Biasa',
        sifat: n.sifat,
        signOption: n.signOption ?? 'digsig',
        approvalChain: n.approvalChain,
        fileUrl: n.lampiran ? `/naskah-lainnya/${n.id}/file` : null,
        filePreviewUrl: dokumen.some(
          (d: any) => d.tipe === 'naskah' && d.isCurrent && d.hasPdfPreview,
        )
          ? `/naskah-lainnya/${n.id}/file?preview=1`
          : null,
        dokumen,
        approval: approval.map((a) =>
          this.toApprovalRow(a, delegatedLegalActors),
        ),
        // Rantai approval dikelompokkan per tahap (fase) agar approval pemrakarsa
        // (persetujuan) dan legal unit (legal_drafting) tidak tercampur. Difilter
        // per POV: legal hanya lihat legal_drafting, pemrakarsa hanya persetujuan.
        approvalByTahap: this.buildApprovalByTahapForPov(
          approval,
          isLegal,
          isPemrakarsa,
          delegatedLegalActors,
        ),
        riwayat: this.mapRiwayatForResponse(riwayat, approval),
        // Riwayat dikelompokkan per tahap (fase) agar approval pemrakarsa, legal unit,
        // evaluasi, dll tidak tercampur dalam satu list flat.
        riwayatByTahap: this.groupRiwayatForResponse(
          this.mapRiwayatForResponse(riwayat, approval),
        ),
        stepper: this.workflow.buildStepper(
          (n.tahapan ?? 'konsep') as Tahapan,
          n.butuhLegal,
          this.workflow.effectiveSignerCount(n),
          n.signingIndex,
          n.signOption,
        ),
        signingIndex: n.signingIndex,
        signerCount: this.workflow.effectiveSignerCount(n),
        signedFileUrl: n.signedLampiran ? `/naskah-lainnya/${n.id}/file` : null,
        documentStatus: n.status,
        manualFinalStatus: n.status === 'final' ? 'final' : 'belum_final',
        manualFinalFileUploaded: Boolean(manualFinalDoc),
        canManageManualFinal:
          n.signOption === 'ttd_basah' &&
          (isPemrakarsa || this.isPenandatanganFisik(n, user)) &&
          n.tahapan === 'selesai',
        catatanLegal: n.catatanLegal ?? null,
        companyId: n.dikirimOleh?.company ?? null,
        availableActions,
      },
    };
  }

  // ---------- Riwayat (kontrak: GET /:id/riwayat) ----------

  async getRiwayat(id: string) {
    const [rows, approval] = await Promise.all([
      this.riwayatRepo.find({
        where: { naskahId: id },
        order: { tanggal: 'ASC' },
      }),
      this.approvalRepo.find({ where: { naskahId: id } }),
    ]);
    const riwayat = this.mapRiwayatForResponse(rows, approval);
    return {
      success: true,
      data: riwayat,
      // Riwayat dikelompokkan per tahap (fase) agar approval pemrakarsa, legal unit,
      // evaluasi, dll tidak tercampur. `data` (flat) tetap disertakan untuk backward-compat.
      riwayatByTahap: this.groupRiwayatForResponse(riwayat),
    };
  }

  // ── Riwayat helpers ──

  private toRiwayatRow(r: NaskahLainnyaRiwayatEntity) {
    return {
      id: r.id,
      aksi: r.aksi,
      aktor: r.aktor,
      jabatan: r.jabatan ?? '',
      tahap: r.tahap ?? '',
      status: r.status ?? '',
      catatan: r.catatan ?? undefined,
      tanggal: new Date(r.tanggal).toISOString(),
    };
  }

  /**
   * Persetujuan Direksi/Blanko menyimpan nama yang dapat diedit dari template
   * pada tabel approval. Untuk tampilan riwayat, gunakan nama tersebut juga
   * (bukan semata nama akun login), termasuk riwayat yang dibuat sebelum
   * penyesuaian ini diterapkan.
   */
  private mapRiwayatForResponse(
    rows: NaskahLainnyaRiwayatEntity[],
    approval: NaskahLainnyaApprovalEntity[],
  ) {
    const sheetTahaps = new Set(['persetujuan_direksi', 'blanko_verbal']);
    return rows.map((r) => {
      const mapped = this.toRiwayatRow(r);
      if (!sheetTahaps.has(r.tahap ?? '') || !r.tanggal) return mapped;

      const eventTime = new Date(r.tanggal).getTime();
      const matchingApproval = approval
        .filter(
          (a) =>
            (a.tahap === r.tahap || a.tahap === `${r.tahap}_ditetapkan`) &&
            !!a.tanggal,
        )
        .sort(
          (a, b) =>
            Math.abs(new Date(a.tanggal!).getTime() - eventTime) -
            Math.abs(new Date(b.tanggal!).getTime() - eventTime),
        )[0];

      // Riwayat dan approval ditulis dalam transaksi yang sama. Toleransi dua
      // detik menutup perbedaan presisi timestamp MySQL pada data lama.
      if (
        !matchingApproval ||
        Math.abs(new Date(matchingApproval.tanggal!).getTime() - eventTime) >
          2000
      ) {
        return mapped;
      }
      const delegateName = matchingApproval.delegateName?.trim();
      const delegateStatus = matchingApproval.delegatePositionStatus
        ?.trim()
        .replace(/\.+$/, '');
      const originalPosition = matchingApproval.jabatan?.trim();
      const delegatedPosition =
        delegateName && delegateStatus && originalPosition
          ? new RegExp(`^${delegateStatus}\\.\\s*`, 'i').test(originalPosition)
            ? originalPosition
            : `${delegateStatus}. ${originalPosition}`
          : originalPosition;
      return {
        ...mapped,
        // Approval delegasi ditampilkan atas nama orang yang benar-benar
        // melakukan aksi. Jabatan tetap jabatan pejabat asal dengan prefix
        // status delegasi (PH/PT/PS).
        aktor: delegateName || matchingApproval.nama || mapped.aktor,
        jabatan: delegatedPosition || mapped.jabatan,
      };
    });
  }

  private groupRiwayatForResponse(
    rows: ReturnType<NaskahLainnyaService['toRiwayatRow']>[],
  ) {
    const byTahap: Record<string, typeof rows> = {};
    for (const row of rows) {
      const key = row.tahap || 'lainnya';
      if (!byTahap[key]) byTahap[key] = [];
      byTahap[key].push(row);
    }
    return byTahap;
  }

  // ── Approval (rantai) helpers ──

  private toApprovalRow(
    a: NaskahLainnyaApprovalEntity,
    delegatedLegalActors?: Map<
      string,
      { nama: string; positionStatus?: string | null }
    >,
  ) {
    const delegatedActor =
      a.tahap === 'legal_drafting' && a.positionId
        ? delegatedLegalActors?.get(String(a.positionId))
        : undefined;
    const delegatedName = delegatedActor?.positionStatus
      ? `${delegatedActor.positionStatus}. ${delegatedActor.nama}`
      : delegatedActor?.nama;
    return {
      id: a.id,
      tahap: a.tahap,
      // Position adalah identitas otorisasi approval. Nama dapat berubah saat
      // posisi dijalankan oleh delegasi PH/PT/PS.
      positionId: a.positionId ?? undefined,
      nama: delegatedName || a.nama,
      jabatan: a.jabatan,
      urutan: a.urutan,
      status: a.status,
      catatan: a.catatan ?? undefined,
      delegatePersnum: a.delegatePersnum ?? undefined,
      delegateName: a.delegateName ?? undefined,
      delegatePositionStatus: a.delegatePositionStatus ?? undefined,
      tanggal: a.tanggal ? new Date(a.tanggal).toISOString() : null,
    };
  }

  // Kelompokkan rantai approval per tahap (fase): { persetujuan: [...], legal_drafting: [...], ... }.
  // Urutan per fase dipertahankan (sudah ASC by urutan dari query).
  private groupApprovalByTahap(
    rows: NaskahLainnyaApprovalEntity[],
    delegatedLegalActors?: Map<
      string,
      { nama: string; positionStatus?: string | null }
    >,
  ) {
    const byTahap: Record<
      string,
      ReturnType<NaskahLainnyaService['toApprovalRow']>[]
    > = {};
    for (const a of rows) {
      const key = a.tahap ?? 'lainnya';
      if (!byTahap[key]) byTahap[key] = [];
      byTahap[key].push(this.toApprovalRow(a, delegatedLegalActors));
    }
    return byTahap;
  }

  // approvalByTahap difilter per POV: legal role melihat approval legal_drafting
  // plus progress direksi/blanko untuk monitoring; pemrakarsa melihat rantai
  // awal beserta seluruh fase evaluasi yang dia kirim.
  // Viewer lain (approver persetujuan, penandatangan, dll) lihat semua tahap.
  // Hanya display yang difilter — flat `approval` tetap utuh.
  private buildApprovalByTahapForPov(
    rows: NaskahLainnyaApprovalEntity[],
    isLegal: boolean,
    isPemrakarsa: boolean,
    delegatedLegalActors?: Map<
      string,
      { nama: string; positionStatus?: string | null }
    >,
  ) {
    const byTahap = this.groupApprovalByTahap(rows, delegatedLegalActors);
    if (isLegal)
      return {
        legal_drafting: byTahap['legal_drafting'] ?? [],
        persetujuan_direksi: byTahap['persetujuan_direksi'] ?? [],
        persetujuan_direksi_ditetapkan:
          byTahap['persetujuan_direksi_ditetapkan'] ?? [],
        blanko_verbal: byTahap['blanko_verbal'] ?? [],
        blanko_verbal_ditetapkan: byTahap['blanko_verbal_ditetapkan'] ?? [],
      };
    if (isPemrakarsa)
      return {
        persetujuan: byTahap['persetujuan'] ?? [],
        evaluasi: byTahap['evaluasi'] ?? [],
        persetujuan_lanjutan: byTahap['persetujuan_lanjutan'] ?? [],
        evaluasi_final: byTahap['evaluasi_final'] ?? [],
      };
    return byTahap;
  }

  // ---------- Create / Update / Kirim ----------

  async createDraft(dto: BuatNaskahDto, user: CurrentUser) {
    const tanggal = dto.tanggal ? new Date(dto.tanggal) : new Date();
    if (isNaN(tanggal.getTime())) {
      throw new BadRequestException('Format tanggal tidak valid');
    }
    // Normalisasi penandatangan: single object → array, atau langsung pakai array.
    const penandatanganList = Array.isArray(dto.penandatangan)
      ? dto.penandatangan
      : [dto.penandatangan];
    // Simpan rantai penandatangan ke penandatanganChain (array JSON).
    const penandatanganChain = penandatanganList.length
      ? await Promise.all(
          penandatanganList.map((p) => this.resolvePenandatanganSnapshot(p)),
        )
      : null;
    // Legacy single fields: ambil dari penandatangan pertama (backward compat).
    const first = penandatanganChain?.[0] ?? penandatanganList[0];
    const naskah = this.naskahRepo.create({
      id: uuidv4(),
      jenis: dto.jenis as any,
      // Draft boleh belum lengkap. Jangan isi fallback "Biasa" karena akan
      // menyamarkan klasifikasi yang belum dipilih ketika validasi kirim.
      klasifikasi: dto.klasifikasi?.trim() || null,
      sifat: (dto.sifat ?? 'biasa') as any,
      // Kosong → diterbitkan saat penandatangan terakhir menyetujui. Nomor manual
      // tetap disimpan sebagai calon nomor dan divalidasi ketika naskah dikirim.
      nomor:
        dto.nomor && !/{{\s*nomor\s*}}/i.test(dto.nomor)
          ? dto.nomor.trim()
          : null,
      tanggal,
      perihal: dto.perihal ?? null,
      signOption: (dto.signOption ?? 'digsig') as any,
      butuhLegal: dto.butuhLegal,
      tahapan: 'konsep',
      atasNama: first?.nama,
      penandatanganJabatan: first?.jabatan ?? null,
      penandatanganPositionId: first?.positionId
        ? String(first.positionId)
        : null,
      penandatanganPersnum: first?.persnum ?? null,
      penandatanganChain,
      approvalChain: dto.approval?.length ? dto.approval : null,
      createdByPosition: user.positionText ?? user.nama,
      dikirimOleh: {
        persnum: user.persnum,
        nama: user.nama,
        position_text: user.positionText ?? '',
        position_id: user.position ?? user.positionId ?? '',
      },
    } as unknown as NaskahEntity);
    const saved = await this.naskahRepo.save(naskah);
    return { success: true, data: { id: saved.id } };
  }

  async updateDraft(id: string, dto: UpdateNaskahDto) {
    const n = await this.findNaskah(id);
    if (n.tahapan === 'dibatalkan') {
      throw new BadRequestException(
        'Naskah yang sudah dibatalkan tidak dapat diperbaiki atau diubah.',
      );
    }
    if (
      dto.nomor !== undefined &&
      (n.tahapan ?? 'konsep') !== 'konsep' &&
      n.tahapan !== 'perlu_perbaikan'
    ) {
      throw new BadRequestException(
        'Nomor sudah dikunci setelah kirim dan tidak dapat diubah.',
      );
    }
    // tanggal bagian PK (id, tanggal). Simpan tanggal ASLI (DB) untuk WHERE — bila
    // n.tanggal dimutasi ke tanggal baru lalu dipakai di WHERE, row tidak ditemukan
    // (0 row ter-update) & patch termasuk penandatanganChain tidak tersimpan. Tanggal
    // baru di-update via patch (kolom PK), child table hanya FK ke naskah_id → aman.
    const originalTanggal = n.tanggal as any;
    const patch: Partial<NaskahEntity> = {};
    if (dto.perihal !== undefined) {
      n.perihal = dto.perihal;
      patch.perihal = dto.perihal;
    }
    // Nomor: abaikan literal placeholder {{nomor}} (sentinel "belum di-generate" dari
    // pre-fill docx template) — treat sebagai kosong → null, agar kirim auto-generate.
    // Tanpa ini, placeholder tersimpan sebagai nomor & memblok kirim (validateManualNomorFormat).
    if (dto.nomor !== undefined) {
      const cleanNomor = /{{\s*nomor\s*}}/i.test(dto.nomor) ? null : dto.nomor;
      n.nomor = cleanNomor as any;
      patch.nomor = cleanNomor as any;
    }
    if (dto.tanggal !== undefined) {
      const t = new Date(dto.tanggal);
      const valid = !isNaN(t.getTime());
      n.tanggal = valid ? t : new Date();
      patch.tanggal = n.tanggal; // update kolom PK tanggal ke nilai baru
    }
    if (dto.butuhLegal !== undefined) {
      n.butuhLegal = dto.butuhLegal;
      patch.butuhLegal = dto.butuhLegal;
    }
    if (dto.klasifikasi !== undefined) {
      n.klasifikasi = dto.klasifikasi;
      patch.klasifikasi = dto.klasifikasi;
    }
    if (dto.approval !== undefined) {
      n.approvalChain = dto.approval?.length ? dto.approval : null;
      patch.approvalChain = n.approvalChain;
    }
    // Simpan penandatangan (single atau array → normalisasi ke chain)
    if (dto.penandatangan) {
      const penandatanganList = Array.isArray(dto.penandatangan)
        ? dto.penandatangan
        : [dto.penandatangan];
      const chain = await Promise.all(
        penandatanganList.map((p) => this.resolvePenandatanganSnapshot(p)),
      );
      n.penandatanganChain = chain;
      patch.penandatanganChain = chain;
      // Legacy single fields dari penandatangan pertama
      const first = penandatanganList[0];
      n.atasNama = first?.nama ?? null;
      patch.atasNama = n.atasNama;
      n.penandatanganJabatan = first?.jabatan ?? null;
      patch.penandatanganJabatan = n.penandatanganJabatan;
      n.penandatanganPositionId = first?.positionId
        ? String(first.positionId)
        : null;
      patch.penandatanganPositionId = n.penandatanganPositionId;
      n.penandatanganPersnum = first?.persnum ?? null;
      patch.penandatanganPersnum = n.penandatanganPersnum;
    }
    if (dto.sifat !== undefined) {
      n.sifat = dto.sifat as any;
      patch.sifat = dto.sifat as any;
    }
    if (dto.signOption !== undefined) {
      n.signOption = dto.signOption as any;
      patch.signOption = dto.signOption as any;
    }
    if (Object.keys(patch).length > 0) {
      await this.naskahRepo.update(
        { id: n.id, tanggal: originalTanggal },
        patch,
      );
      this.emitDetailUpdate(n.id);
    }
    return this.getDetail(id, { persnum: 0, nama: '' });
  }

  async kirim(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (
      (n.tahapan ?? 'konsep') !== 'konsep' &&
      n.tahapan !== 'perlu_perbaikan'
    ) {
      throw new BadRequestException(
        'Hanya naskah konsep / perlu perbaikan yang bisa dikirim',
      );
    }
    this.validateRequiredFieldsBeforeKirim(n);
    // Digital maupun fisik membutuhkan penandatangan. Pada TTD fisik,
    // penandatangan menyetujui Naskah Draft sebelum nomor diterbitkan.
    const N = this.workflow.effectiveSignerCount(n);
    if (
      (n.signOption === 'qr_only' || n.signOption === 'ttd_basah') &&
      N === 0
    ) {
      throw new BadRequestException(
        `Opsi ${n.signOption === 'ttd_basah' ? 'TTD Fisik' : 'TTD Digital (QR)'} butuh minimal 1 penandatangan.`,
      );
    }

    // ── Penomoran saat finalisasi ──────────────────────────────────────
    const tanggalNaskah =
      n.tanggal instanceof Date ? n.tanggal : new Date(n.tanggal as any);
    if (!tanggalNaskah || isNaN(tanggalNaskah.getTime())) {
      throw new BadRequestException(
        'Tanggal naskah wajib diisi sebelum kirim (untuk penomoran).',
      );
    }
    const klasifikasiNaskah = n.klasifikasi ?? null;

    await this.dataSource.transaction(async (manager) => {
      // ── Validasi nomor manual early (TANPA counter naik, TANPA fill docx) ──
      // Generasi auto pindah ke tahap penandatanganan (lihat ensureNomorFinal).
      // Nomor manual divalidasi di kirim supaya pemrakarsa dapat feedback sebelum
      // approval cycle. Counter TIDAK naik di kirim — nomor final baru di-signing.
      const nomorManual =
        n.nomor && !/{{\s*nomor\s*}}/i.test(n.nomor) ? n.nomor : null;
      if (nomorManual) {
        const jenisRepo = manager.getRepository(JenisEntity);
        const jenisData = await jenisRepo.findOne({
          where: { jenis: n.jenis as any },
        });
        if (!jenisData?.formatPenomoran) {
          throw new BadRequestException(
            `Format penomoran untuk jenis ${n.jenis} belum dikonfigurasi.`,
          );
        }
        const format = jenisData.formatPenomoran;
        if (format.includes('{KLASIFIKASI}') && !klasifikasiNaskah) {
          throw new BadRequestException(
            `Klasifikasi wajib diisi untuk jenis ${n.jenis} sebelum kirim.`,
          );
        }
        this.validateManualNomorFormat(nomorManual, format, n.jenis);
        const clash = await manager
          .getRepository(NaskahEntity)
          .createQueryBuilder('n')
          .where('n.nomor = :nomor', { nomor: nomorManual })
          .andWhere('n.id != :id', { id: n.id })
          .getCount();
        if (clash > 0) {
          throw new BadRequestException(
            `Nomor "${nomorManual}" sudah digunakan naskah lain.`,
          );
        }
        // keep n.nomor manual apa adanya. No fill, no counter.
      }

      // Placeholder {{nomor}} bersifat opsional. Nomor tetap dibuat dan disimpan
      // oleh sistem pada fase tanda tangan; bila placeholder tidak ada, dokumen
      // hanya tidak menampilkan nomor tersebut di body template. Ini penting untuk
      // template tanda tangan fisik maupun template legacy.

      // Snapshot pengirim tetap disimpan untuk audit dan fallback data legacy.
      // Nomor otomatis memakai konteks penandatangan terakhir saat finalisasi.
      n.dikirimOleh = {
        persnum: String(user.persnum),
        nama: user.nama,
        position_text: user.positionText ?? '',
        position_id: user.position ?? user.positionId ?? '',
        company: user.company,
        area: user.area,
        subArea: user.subArea,
        organization: user.organization,
        abbreviation: user.abbreviation,
      };
      await manager
        .getRepository(NaskahEntity)
        .update(
          { id: n.id, tanggal: n.tanggal as any },
          { dikirimOleh: n.dikirimOleh },
        );

      // ── Lanjut workflow kirim ──
      await this.workflow.transisi(n, 'kirim', {
        aktor: user.nama,
        jabatan: user.positionText,
        manager,
      });
    });

    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  private validateRequiredFieldsBeforeKirim(n: NaskahEntity): void {
    if (!String(n.jenis ?? '').trim()) {
      throw new BadRequestException('Jenis naskah wajib diisi sebelum kirim.');
    }
    if (!String(n.klasifikasi ?? '').trim()) {
      throw new BadRequestException('Klasifikasi wajib diisi sebelum kirim.');
    }
    if (!String(n.sifat ?? '').trim()) {
      throw new BadRequestException('Sifat naskah wajib diisi sebelum kirim.');
    }
    const hasSigner =
      (Array.isArray(n.penandatanganChain) &&
        n.penandatanganChain.length > 0) ||
      !!n.penandatanganPositionId ||
      !!String(n.atasNama ?? '').trim();
    if (!hasSigner) {
      throw new BadRequestException(
        'Urutan penandatangan wajib diisi sebelum kirim.',
      );
    }
    if (!Array.isArray(n.approvalChain) || n.approvalChain.length === 0) {
      throw new BadRequestException('Verifikator wajib dipilih sebelum kirim.');
    }
    if (n.signOption !== 'ttd_basah' && !n.lampiran) {
      throw new BadRequestException(
        'Dokumen naskah DOCX wajib diunggah untuk metode tanda tangan Digital.',
      );
    }
  }

  // ---------- Persetujuan (antrian) ----------

  // Filter persetujuan (antrian approver/penandatangan):
  //  - menunggu (default): persetujuan/perlu_perbaikan (approver waiting, berjenjang)
  //    + tanda_tangan/blanko_verbal (penandatangan).
  //  - disetujui: naskah di mana user pernah setuju (riwayat, tahapan apa pun).
  //  - ditolak: naskah di mana user pernah tolak (riwayat, tahapan apa pun).
  //  - semua: gabungan menunggu + disetujui + ditolak (dedupe by id, urut desc).
  async getPersetujuan(user: CurrentUser, status?: string) {
    const validFilter = ['semua', 'menunggu', 'disetujui', 'ditolak'];
    const filter = (
      validFilter.includes(status as string) ? status : 'menunggu'
    ) as 'semua' | 'menunggu' | 'disetujui' | 'ditolak';

    const rows: NaskahEntity[] = [];
    const seen = new Set<string>();
    const approvalStatusByNaskah = new Map<
      string,
      'waiting' | 'verified' | 'rejected'
    >();
    const approvalStatusPriority = { verified: 1, rejected: 2, waiting: 3 };
    const markApprovalStatus = (
      naskahId: string,
      approvalStatus: 'waiting' | 'verified' | 'rejected',
    ) => {
      const current = approvalStatusByNaskah.get(naskahId);
      if (
        !current ||
        approvalStatusPriority[approvalStatus] > approvalStatusPriority[current]
      ) {
        approvalStatusByNaskah.set(naskahId, approvalStatus);
      }
    };
    const push = (r: NaskahEntity) => {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        rows.push(r);
      }
    };

    // 1. Menunggu (default & termasuk 'semua') — persetujuan/perlu_perbaikan
    //    (approver waiting, berjenjang) + persetujuan_direksi/blanko_verbal (paraf
    //    direksi parallel, urutan=1 jadi lolos gate berjenjang MIN di helper) +
    //    tanda_tangan/blanko_verbal (penandatangan). blanko_verbal di part 1 & part 2
    //    di-dedupe oleh `seen` (push) — BOD paraf-er lewat sini, penandatangan lewat part 2.
    if (filter === 'menunggu' || filter === 'semua') {
      const approvalNaskahIds = await this.getNaskahIdsForApproverStatus(
        user,
        'waiting',
      );
      approvalNaskahIds.forEach((id) => markApprovalStatus(id, 'waiting'));
      if (approvalNaskahIds.length > 0) {
        const r1 = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', {
            jenis: NASKAH_LAINNYA_JENIS,
          })
          .andWhere('n.tahapan IN (:...t)', {
            t: [
              'persetujuan',
              'legal_drafting',
              'perlu_perbaikan',
              'persetujuan_direksi',
              'blanko_verbal',
              'evaluasi',
              'persetujuan_lanjutan',
              'evaluasi_final',
            ],
          })
          .andWhere('n.id IN (:...ids)', { ids: approvalNaskahIds })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        r1.forEach(push);
      }
      const posId = String(user.positionId ?? user.position ?? '');
      if (posId) {
        const ttdRows = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', {
            jenis: NASKAH_LAINNYA_JENIS,
          })
          .andWhere('n.tahapan = :tTandaTangan', {
            tTandaTangan: 'tanda_tangan',
          })
          .andWhere(
            "(JSON_CONTAINS(n.penandatangan_chain, JSON_OBJECT('positionId', :posId)) OR n.penandatangan_position_id = :posIdStr)",
            { posId, posIdStr: posId },
          )
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        // Hanya naskah di mana user adalah penandatangan AKTIF (signingIndex menunjuk
        // ke posisi user di chain). Naskah yang SUDAH ditandatangani user (signingIndex
        // lewat posisi user) tidak boleh muncul di "Menunggu".
        ttdRows
          .filter((n) => this.isCurrentSigner(n, posId))
          .forEach((n) => {
            markApprovalStatus(n.id, 'waiting');
            push(n);
          });
      }
    }

    // 2. Disetujui / Ditolak (termasuk 'semua' → keduanya): riwayat approval user
    //    (status row verified/rejected — lihat workflow.applyApproval), tahapan apa pun.
    if (filter === 'disetujui' || filter === 'ditolak' || filter === 'semua') {
      const approvalStatuses =
        filter === 'semua'
          ? ['verified', 'rejected']
          : [filter === 'disetujui' ? 'verified' : 'rejected'];
      const ids: string[] = [];
      for (const s of approvalStatuses) {
        const statusIds = await this.getNaskahIdsForApproverStatus(user, s);
        const responseStatus = s === 'verified' ? 'verified' : 'rejected';
        statusIds.forEach((id) => markApprovalStatus(id, responseStatus));
        ids.push(...statusIds);
      }
      if (ids.length > 0) {
        const r2 = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', {
            jenis: NASKAH_LAINNYA_JENIS,
          })
          .andWhere('n.id IN (:...ids2)', { ids2: ids })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        r2.forEach(push);
      }
    }

    // Penandatangan: naskah selesai yang user ini tandatangani → masuk "Disetujui"
    // (signing = approve dari POV penandatangan). Penandatangan tidak memiliki baris
    // di tabel approval (disimpan di penandatangan_chain), jadi tidak tertangkap query
    // setuju/tolak di atas. Match sama dengan query menunggu: penandatangan_chain /
    // penandatangan_position_id by positionId.
    if (filter === 'disetujui' || filter === 'semua') {
      const posId = String(user.positionId ?? user.position ?? '');
      if (posId) {
        const ttdDone = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', {
            jenis: NASKAH_LAINNYA_JENIS,
          })
          .andWhere('n.tahapan = :tSelesai', { tSelesai: 'selesai' })
          .andWhere(
            "(JSON_CONTAINS(n.penandatangan_chain, JSON_OBJECT('positionId', :posId)) OR n.penandatangan_position_id = :posIdStr)",
            { posId, posIdStr: posId },
          )
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        ttdDone.forEach((n) => {
          markApprovalStatus(n.id, 'verified');
          push(n);
        });
      }
    }

    // 'semua' mencampur beberapa himpunan → urut ulang desc. Filter tunggal sudah DESC.
    if (filter === 'semua') {
      rows.sort((a, b) => {
        const ta =
          a.createdAt instanceof Date
            ? a.createdAt.getTime()
            : new Date(a.createdAt ?? 0).getTime();
        const tb =
          b.createdAt instanceof Date
            ? b.createdAt.getTime()
            : new Date(b.createdAt ?? 0).getTime();
        return tb - ta;
      });
    }

    const pemrakarsaPejabatByNaskah = await this.getPemrakarsaPejabatByNaskah(
      rows.map((row) => row.id),
    );
    return {
      success: true,
      data: rows.map((r) => ({
        ...this.toListItem(r),
        pemrakarsaPejabat: pemrakarsaPejabatByNaskah.get(r.id),
        // Status aksi user pada menu Persetujuan. Tidak diturunkan dari tahapan
        // naskah karena naskah yang sudah disetujui dapat lanjut ke tahap lain.
        approvalStatus: approvalStatusByNaskah.get(r.id),
      })),
    };
  }

  // ---------- Legal Drafting (antrian khusus legal role) ----------

  // Status persetujuan legal drafting (filter di halaman Legal Drafting):
  //  - semua: semua naskah legal_drafting (butuh legal) + blanko_verbal, tanpa
  //    sub-filter status (campur belum-dikirim/menunggu/revisi/sudah-dikerjakan).
  //  - belum-dikirim: legal_drafting tanpa baris approval (belum pernah kirim approval legal).
  //  - menunggu: sudah dikirim dan masih ada approval legal/direksi yang waiting.
  //  - revisi: ada baris rejected, tidak ada waiting (ditolak approver → balik ke
  //    drafter legal untuk direvisi & kirim ulang).
  //  - sudah-dikerjakan: seluruh approval selesai; `aksi-saya` tetap diterima
  //    sebagai alias kompatibilitas. Filter ini
  //    murni berdasarkan statusLegal, bukan berdasarkan nama aktor yang login.
  async getLegalDrafting(user: CurrentUser, status: string = 'belum-dikirim') {
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    const posId = String(user.positionId ?? user.position ?? '');
    if (!posId || !activeLegalIds.includes(posId)) {
      throw new ForbiddenException('Anda bukan legal role');
    }
    const validStatus = [
      'semua',
      'belum-dikirim',
      'menunggu',
      'revisi',
      'aksi-saya',
      'sudah-dikerjakan',
      'sudah_dikerjakan',
    ];
    const st = validStatus.includes(status) ? status : 'belum-dikirim';

    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', {
        jenis: NASKAH_LAINNYA_JENIS,
      })
      .orderBy('n.createdAt', 'DESC');

    // Semua tab memakai universe data yang sama. Status dihitung setelah batch
    // approval/riwayat selesai, lalu difilter berdasarkan statusLegal. Dengan
    // demikian setiap tab selalu menjadi subset yang konsisten dari tab Semua.
    qb.andWhere(
      '((n.tahapan = :ld AND n.butuh_legal = :bl) OR (n.tahapan = :pd) OR (n.tahapan = :bv))',
      {
        ld: 'legal_drafting',
        bl: true,
        pd: 'persetujuan_direksi',
        bv: 'blanko_verbal',
      },
    );

    const rows = await qb.getMany();
    // statusLegal per-row (badge kolom Status — dibutuhkan terutama untuk filter
    // 'semua' yang mencampur sub-status). Batch-query baris legal_drafting approval
    // + aksi riwayat TERAKHIR per naskah (sinyal revisi dari tahap evaluasi).
    const ids = rows.map((r) => r.id);
    // Batch-query baris approval untuk legal_drafting, persetujuan_direksi, dan
    // blanko_verbal — supaya sub-status per tahap akurat (badge kolom Status).
    const apprRows = ids.length
      ? ((await this.approvalRepo.find({
          where: {
            naskahId: In(ids),
            tahap: In([
              'legal_drafting',
              'persetujuan_direksi',
              'blanko_verbal',
            ] as any),
          },
          select: ['naskahId', 'tahap', 'status'] as any,
        })) ?? [])
      : [];
    const statusByNaskah = new Map<string, string[]>();
    const pdStatusByNaskah = new Map<string, string[]>();
    const bvStatusByNaskah = new Map<string, string[]>();
    for (const a of apprRows) {
      const tahap = String((a as any).tahap ?? '');
      const map =
        tahap === 'persetujuan_direksi'
          ? pdStatusByNaskah
          : tahap === 'blanko_verbal'
            ? bvStatusByNaskah
            : statusByNaskah;
      const arr = map.get(a.naskahId) ?? [];
      arr.push(a.status as string);
      map.set(a.naskahId, arr);
    }
    // Aksi riwayat terbaru per naskah (order DESC → kemunculan pertama per id = terbaru).
    const latestAksiByNaskah = new Map<string, string>();
    if (ids.length) {
      const rws =
        (await this.riwayatRepo.find({
          where: { naskahId: In(ids) as any },
          order: { createdAt: 'DESC' as any },
          select: ['naskahId', 'aksi'] as any,
        })) ?? [];
      for (const rw of rws) {
        if (!latestAksiByNaskah.has(rw.naskahId))
          latestAksiByNaskah.set(rw.naskahId, rw.aksi);
      }
    }
    const pemrakarsaPejabatByNaskah =
      await this.getPemrakarsaPejabatByNaskah(ids);
    const data = rows.map((r) => ({
      ...this.toListItem(r),
      pemrakarsaPejabat: pemrakarsaPejabatByNaskah.get(r.id),
      statusLegal: this.computeStatusLegal(
        String(r.tahapan ?? 'konsep'),
        statusByNaskah.get(r.id) ?? [],
        latestAksiByNaskah.get(r.id),
        pdStatusByNaskah.get(r.id) ?? [],
        bvStatusByNaskah.get(r.id) ?? [],
      ),
    }));
    const statusFilterMap: Record<string, string | null> = {
      semua: null,
      'belum-dikirim': 'belum_dikirim',
      menunggu: 'menunggu_persetujuan',
      revisi: 'revisi',
      'aksi-saya': 'sudah_dikerjakan',
      'sudah-dikerjakan': 'sudah_dikerjakan',
      sudah_dikerjakan: 'sudah_dikerjakan',
    };
    const expectedStatus = statusFilterMap[st];
    return {
      success: true,
      data: expectedStatus
        ? data.filter((item) => item.statusLegal === expectedStatus)
        : data,
    };
  }

  // Sub-status legal per naskah (badge kolom Status di halaman Legal Drafting).
  //  - persetujuan_direksi: legal sudah kirim lembar, menunggu paraf direksi
  //    → menunggu_persetujuan (bila ada waiting), kalau kosong fallback persetujuan_direksi.
  //  - blanko_verbal: belum kirim blanko (tanpa baris BOD) → belum_dikirim;
  //    ada waiting → menunggu_persetujuan; semua verified → sudah_dikerjakan (siap lanjut).
  //  - tahapan lain (evaluasi/tanda tangan/selesai) → sudah_dikerjakan.
  //  - legal_drafting: waiting → menunggu_persetujuan;
  //    rejected (no waiting) → revisi;
  //    ada baris (all verified) → sudah_dikerjakan; tanpa baris → belum_dikirim
  //    (kecuali dikembalikan dari evaluasi → revisi).
  private computeStatusLegal(
    tahapan: string,
    statuses: string[],
    latestAksi?: string,
    pdStatuses: string[] = [],
    bvStatuses: string[] = [],
  ): string {
    if (tahapan === 'persetujuan_direksi') {
      // Legal belum kirim lembar (tanpa baris BOD) → belum_dikirim;
      // sudah kirim & ada waiting → menunggu_persetujuan.
      return pdStatuses.includes('waiting')
        ? 'menunggu_persetujuan'
        : 'belum_dikirim';
    }
    if (tahapan === 'blanko_verbal') {
      if (bvStatuses.includes('waiting')) return 'menunggu_persetujuan';
      if (bvStatuses.length > 0 && bvStatuses.every((s) => s === 'verified'))
        return 'sudah_dikerjakan';
      return 'belum_dikirim';
    }
    if (tahapan !== 'legal_drafting') return 'sudah_dikerjakan';
    if (statuses.includes('rejected')) return 'revisi';
    if (statuses.includes('waiting')) return 'menunggu_persetujuan';
    // Penolakan Blanko Verbal/LPD mengembalikan naskah ke legal_drafting, tetapi
    // approval Legal Drafting dari siklus sebelumnya tetap verified sebagai jejak
    // proses. Karena itu sinyal riwayat terbaru harus diperiksa sebelum fallback
    // statuses.length, supaya naskah masuk antrean Revisi dan bukan Sudah Dikerjakan.
    if (
      latestAksi === 'tolak' ||
      latestAksi === 'kembalikan-evaluasi' ||
      latestAksi === 'legal_drafting_ulang'
    )
      return 'revisi';
    if (statuses.length > 0) return 'sudah_dikerjakan';
    return 'belum_dikirim';
  }

  /**
   * Ambil daftar naskahId di mana user ini adalah approver dengan status tertentu
   * ('waiting' = menunggu aksi user, 'setuju' = disetujui, 'tolak' = ditolak).
   */
  private async getNaskahIdsForApproverStatus(
    user: CurrentUser,
    status: string,
  ): Promise<string[]> {
    const conditions: string[] = [];
    const params: Record<string, any> = { status };
    const posId = user.positionId ?? user.position;
    if (posId) {
      conditions.push('a.position_id = :positionId');
      params.positionId = posId;
    }
    // Delegasi direksi: pengganti (PT/PH/PS) melihat antrean naskah yang
    // paraf-nya didelegasikan ke dia — samakan dengan isApprovalAssignedToUser.
    if (user.persnum) {
      conditions.push('a.delegate_persnum = :persnum');
      params.persnum = user.persnum;
    }
    if (user.nama) {
      // Nama hanya fallback untuk approval legacy tanpa position_id. Approval
      // modern harus cocok ke jabatan aktif agar YBS tidak menerima antrean yang
      // sedang dijalankan oleh delegasi PT/PH/PS.
      conditions.push(
        '(a.position_id IS NULL AND LOWER(TRIM(a.nama)) = LOWER(TRIM(:nama)))',
      );
      params.nama = user.nama;
    }
    if (conditions.length === 0) return [];
    const qb = this.approvalRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.naskah_id', 'naskahId')
      .where(`(${conditions.join(' OR ')})`)
      .andWhere('a.status = :status');
    // Berjenjang: untuk antrian 'menunggu', hanya approver pada urutan terendah
    // yang masih waiting yang melihat naskah — urutan lebih tinggi tunggu giliran.
    if (status === 'waiting') {
      qb.andWhere(
        "a.urutan = (SELECT MIN(a2.urutan) FROM naskah_lainnya_approval a2 WHERE a2.naskah_id = a.naskah_id AND a2.status = 'waiting')",
      );
    }
    const rows = await qb
      .setParameters(params)
      .getRawMany<{ naskahId: string }>();
    return rows.map((r) => r.naskahId);
  }

  // ---------- Upload & Template ----------

  /**
   * Baca parameter docx (perihal/tanggal) TANPA persist ke storage/DB. Dipakai FE
   * saat user memilih file naskah di halaman tulis — agar auto-fill perihal tetap
   * jalan tanpa menumpuk baris versi naskah (yg hanya boleh tercatat saat kirim).
   */
  async parseDokumen(file: Express.Multer.File) {
    if (!file?.buffer)
      throw new BadRequestException('File docx wajib diunggah');
    let parameter: DocxParameter;
    try {
      parameter = await this.docxReader.readParameters(file.buffer);
    } catch {
      throw new BadRequestException(
        'Gagal membaca file .docx. Pastikan file dari template sistem.',
      );
    }
    return { success: true, data: { parameter } };
  }

  async uploadDokumen(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ) {
    if (!file?.buffer || !file.originalname?.toLowerCase().endsWith('.docx')) {
      throw new BadRequestException('File naskah wajib berformat DOCX.');
    }
    const n = await this.findNaskah(id);
    if (n.tahapan === 'dibatalkan') {
      throw new BadRequestException(
        'Naskah yang sudah dibatalkan tidak dapat diperbaiki atau diubah.',
      );
    }
    // tanggal bagian PK — simpan tanggal ASLI (DB) untuk WHERE. Mutasi in-memory
    // n.tanggal (dari params.tanggal) TIDAK boleh ikut ke WHERE, kalau tidak row
    // tidak ditemukan & lampiran/docx tidak tersimpan.
    const originalTanggal = n.tanggal as any;
    const params = await this.docxReader.readParameters(file.buffer);
    const patch: Partial<NaskahEntity> = {};
    const parsedPerihal = params.perihal?.trim();
    const shouldUseParsedPerihal =
      !!parsedPerihal && (n.signOption !== 'ttd_basah' || !n.perihal?.trim());
    if (shouldUseParsedPerihal && parsedPerihal) {
      n.perihal = parsedPerihal;
      patch.perihal = parsedPerihal;
    }
    // tanggal adalah bagian PK — skip update di sini (hindari PK change)
    if (params.tanggal) {
      const t = new Date(params.tanggal);
      if (!isNaN(t.getTime())) n.tanggal = t; // update in-memory only
    }
    // Nama file kanonik — rumus identik dengan FE (utils/naskah-file-name.ts)
    // agar display/download di semua halaman konsisten dengan object storage.
    const namaFile = this.buildNaskahFileName(
      n.perihal,
      n.jenis,
      n.id,
      n.nomor,
    );
    // Struktur direktori: naskah-lainnya/{jenis}/{id}/naskah/{timestamp}-{nama-kanonik}.docx
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/naskah`;
    const filename = `${Date.now()}-${namaFile}`;
    const uploadedKeys: string[] = [];
    try {
      const result = await this.storage.uploadBuffer(
        file.buffer,
        filename,
        file.mimetype || 'application/octet-stream',
        folder,
      );
      uploadedKeys.push(result.key);
      const pdf = await this.gotenberg.convertDocxToPdf(file.buffer, namaFile);
      const pdfResult = await this.storage.uploadBuffer(
        pdf,
        filename.replace(/\.docx$/i, '.pdf'),
        'application/pdf',
        folder,
      );
      uploadedKeys.push(pdfResult.key);
      const preview = {
        minioKey: pdfResult.key,
        nama: namaFile.replace(/\.docx$/i, '.pdf'),
        mimetype: 'application/pdf',
        ukuran: pdf.length,
      };
      patch.lampiran = result.key; // simpan MinIO key agar bisa di-fetch ulang saat buka draft
      await this.naskahRepo.update(
        { id: n.id, tanggal: originalTanggal },
        patch,
      );
      await this.catatVersiNaskah(
        n.id,
        n.tahapan,
        result.key,
        namaFile,
        file.mimetype,
        file.size,
        user,
        preview,
      );
      this.emitDetailUpdate(n.id);
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) =>
          this.storage.deleteFile(key).catch(() => undefined),
        ),
      );
      throw error;
    }
    return { success: true, data: { parameter: params } };
  }

  async uploadRevisiDokumen(
    id: string,
    docx: Express.Multer.File | undefined,
    user: CurrentUser,
  ) {
    if (!docx)
      throw new BadRequestException('File naskah DOCX wajib diunggah.');
    if (!docx.originalname.toLowerCase().endsWith('.docx')) {
      throw new BadRequestException(
        'File naskah editable wajib berformat DOCX.',
      );
    }
    const n = await this.findNaskah(id);
    if (n.tahapan === 'dibatalkan') {
      throw new BadRequestException(
        'Naskah yang sudah dibatalkan tidak dapat diperbaiki atau diubah.',
      );
    }
    const originalTanggal = n.tanggal as any;
    let params: DocxParameter;
    try {
      params = await this.docxReader.readParameters(docx.buffer);
    } catch {
      throw new BadRequestException(
        'Gagal membaca file DOCX. Pastikan file berasal dari template sistem.',
      );
    }

    const namaDocx = this.buildNaskahFileName(
      n.signOption === 'ttd_basah' && n.perihal?.trim()
        ? n.perihal
        : params.perihal || n.perihal,
      n.jenis,
      n.id,
      n.nomor,
    );
    const namaPdf = namaDocx.replace(/\.docx$/i, '.pdf');
    const generatedPdf = await this.gotenberg.convertDocxToPdf(
      docx.buffer,
      namaDocx,
    );
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/naskah`;
    const stamp = Date.now();
    const uploadedKeys: string[] = [];
    try {
      const docxUpload = await this.storage.uploadBuffer(
        docx.buffer,
        `${stamp}-${namaDocx}`,
        docx.mimetype ||
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folder,
      );
      uploadedKeys.push(docxUpload.key);
      const pdfUpload = await this.storage.uploadBuffer(
        generatedPdf,
        `${stamp}-${namaPdf}`,
        'application/pdf',
        folder,
      );
      uploadedKeys.push(pdfUpload.key);

      const patch: Partial<NaskahEntity> = { lampiran: docxUpload.key };
      if (
        params.perihal &&
        (n.signOption !== 'ttd_basah' || !n.perihal?.trim())
      ) {
        patch.perihal = params.perihal;
      }
      await this.naskahRepo.update(
        { id: n.id, tanggal: originalTanggal },
        patch,
      );
      await this.catatVersiNaskah(
        n.id,
        n.tahapan,
        docxUpload.key,
        namaDocx,
        docx.mimetype,
        docx.size,
        user,
        {
          minioKey: pdfUpload.key,
          nama: namaPdf,
          mimetype: 'application/pdf',
          ukuran: generatedPdf.length,
        },
      );
      this.emitDetailUpdate(n.id);
      return { success: true, data: { parameter: params } };
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) =>
          this.storage.deleteFile(key).catch(() => undefined),
        ),
      );
      throw error;
    }
  }

  /** Nama file naskah kanonik — identik dengan FE utils/naskah-file-name.ts.
   *  Format: {JENIS}-{NOMOR}-{slug-perihal}.docx
   *  - jenis uppercase (PER, KEP, BAC, …)
   *  - nomor: '/' → '-' (unsafe di nama file); kosong/placeholder → DRAFT
   *  - perihal: slug lowercase, max 40 char; kosong → 'naskah'
   *  Nama file hanya untuk display/download — MinIO key tetap timestamp-based. */
  private buildNaskahFileName(
    perihal: string | null,
    jenis: string | null,
    naskahId: string,
    nomor?: string | null,
  ): string {
    const slug = (s: string | null, max = 40) => {
      const v = String(s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max);
      return v;
    };
    const jenisKode = String(jenis ?? '').toUpperCase() || 'NASKAH';
    // Nomor final mengandung '/' (mis. PER.001/P/LPPNPI/…) → sanitize.
    // Placeholder {{nomor}} / kosong berarti belum final → DRAFT.
    const nomorRaw = String(nomor ?? '').trim();
    const isPlaceholder = !nomorRaw || /\{\{.*\}\}/.test(nomorRaw);
    const nomorSlug = isPlaceholder
      ? 'DRAFT'
      : nomorRaw.replace(/[^A-Za-z0-9.\-]+/g, '-').replace(/^-+|-+$/g, '');
    const perihalSlug = slug(perihal) || 'naskah';
    return `${jenisKode}-${nomorSlug}-${perihalSlug}.docx`;
  }

  /** Direktori template menurut metode tanda tangan:
   *  Digital (qr_only) → templates/naskah-lainnya/{jenis}.docx
   *  Fisik (ttd_basah) → templates/naskah-lainnya-original/{jenis}.docx */
  private templateKey(jenis: string, signOption?: string) {
    const dir =
      signOption === 'ttd_basah' ? 'naskah-lainnya-original' : 'naskah-lainnya';
    return `templates/${dir}/${jenis}.docx`;
  }

  async getTemplateUrl(jenis: string, signOption?: string) {
    const key = this.templateKey(jenis, signOption);
    const url = await this.storage.getFileUrl(key, 3600);
    return { success: true, data: url };
  }

  /** Deteksi jumlah slot penandatangan dari placeholder {{tanda_tangan_N}} di template. */
  async getTemplateSigners(jenis: string, signOption?: string) {
    const key = this.templateKey(jenis, signOption);
    let buffer: Buffer;
    try {
      buffer = await this.storage.getFile(key);
    } catch {
      throw new NotFoundException(
        `Template ${jenis} tidak ditemukan di storage.`,
      );
    }
    const { count, slots } = this.docxReader.readSignerSlots(buffer);
    return { success: true, data: { count, slots } };
  }

  async downloadFile(
    id: string,
    preview = false,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const n = await this.findNaskah(id);
    // Saat fase signing/selesai, prefer artifact signed (QR / upload fisik); fallback lampiran asli.
    const sourceKey = n.signedLampiran ?? n.lampiran;
    let key = sourceKey;
    let forcedMimetype: string | null = null;
    // Naskah final (selesai/final/final_tte): unduhan otomatis memakai PDF
    // bila tersedia — dokumen final untuk dibaca/diarsip, bukan diedit.
    // Draft/revisi tetap mendapat DOCX asli (approver perlu memodifikasi).
    const isFinalPhase =
      n.tahapan === 'selesai' ||
      n.status === 'final' ||
      n.status === 'final_tte';
    if ((preview || isFinalPhase) && sourceKey) {
      const version = await this.dokumenRepo.findOne({
        where: { naskahId: n.id, minioKey: sourceKey },
      });
      if (version?.previewMinioKey) {
        key = version.previewMinioKey;
        forcedMimetype = version.previewMimetype || 'application/pdf';
      }
    }
    if (!key) throw new NotFoundException('File naskah belum diunggah');
    try {
      const buffer = await this.storage.getFile(key);
      const isDocx = key.toLowerCase().endsWith('.docx');
      return {
        buffer,
        mimetype:
          forcedMimetype ??
          (isDocx
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : key.toLowerCase().endsWith('.pdf')
              ? 'application/pdf'
              : 'application/octet-stream'),
      };
    } catch {
      throw new NotFoundException(
        'File naskah tidak ditemukan di storage. Silakan unggah ulang.',
      );
    }
  }

  async deleteDraft(id: string) {
    const n = await this.findNaskah(id);
    // Hanya bisa hapus draft yang masih konsep/perlu_perbaikan
    if (
      n.tahapan &&
      n.tahapan !== 'konsep' &&
      n.tahapan !== 'perlu_perbaikan'
    ) {
      throw new BadRequestException(
        'Hanya naskah draft (konsep/perlu_perbaikan) yang bisa dihapus',
      );
    }
    // Hapus semua MinIO key versi naskah (lampiran, signedLampiran, baris history) + child tables.
    const versiRows = await this.dokumenRepo.find({
      where: { naskahId: id, tipe: 'naskah' },
    });
    const keys = new Set<string>();
    if (n.lampiran) keys.add(n.lampiran);
    if (n.signedLampiran) keys.add(n.signedLampiran);
    for (const v of versiRows) {
      if (v.minioKey) keys.add(v.minioKey);
      if (v.previewMinioKey) keys.add(v.previewMinioKey);
    }
    for (const k of keys) {
      try {
        await this.storage.deleteFile(k);
      } catch {
        /* abaikan — file mungkin sudah tidak ada */
      }
    }
    // Hapus child tables
    await this.approvalRepo.delete({ naskahId: id });
    await this.riwayatRepo.delete({ naskahId: id });
    await this.blankoRepo.delete({ naskahId: id });
    await this.dokumenRepo.delete({ naskahId: id });
    // Hapus naskah
    await this.naskahRepo.delete({ id, tanggal: n.tanggal as any });
    return { success: true, data: { id } };
  }

  // ---------- Delegasi aksi approval & workflow ----------

  async setuju(
    id: string,
    approvalId: string,
    catatan: string | undefined,
    user: CurrentUser,
  ) {
    return this.aksiApproval(id, approvalId, 'setuju', catatan, user);
  }
  async tolak(
    id: string,
    approvalId: string,
    catatan: string,
    user: CurrentUser,
  ) {
    if (!catatan)
      throw new BadRequestException('Alasan wajib diisi saat menolak');
    return this.aksiApproval(id, approvalId, 'tolak', catatan, user);
  }
  async kembalikan(
    id: string,
    approvalId: string,
    catatan: string,
    user: CurrentUser,
  ) {
    if (!catatan)
      throw new BadRequestException('Alasan wajib diisi saat mengembalikan');
    return this.aksiApproval(id, approvalId, 'kembalikan', catatan, user);
  }

  private async aksiApproval(
    id: string,
    approvalId: string,
    aksi: 'setuju' | 'tolak' | 'kembalikan',
    catatan: string | undefined,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });

    // Guard: hanya approver dengan status 'waiting' yang bisa melakukan aksi.
    // Satu pejabat boleh merangkap pemrakarsa, verifikator, dan penandatangan.
    const targetRow = rows.find((r) => r.id === approvalId);
    if (!targetRow) {
      throw new BadRequestException('Baris approval tidak ditemukan');
    }
    if (targetRow.status !== 'waiting') {
      throw new BadRequestException('Baris approval sudah diproses');
    }
    // Approval Legal diselesaikan melalui Kirim/Teruskan di workspace Legal.
    // Pengecualian hanya untuk penolakan oleh pengesah aktif; aksi ini tetap
    // melewati validasi tahap, urutan, dan identitas approver di bawah.
    if (targetRow.tahap === 'legal_drafting' && aksi !== 'tolak') {
      throw new BadRequestException(
        'Gunakan aksi Kirim atau Teruskan pada halaman Legal Drafting.',
      );
    }
    if (targetRow.tahap === 'legal_drafting') {
      const legalCertifier = rows
        .filter((row) => row.tahap === 'legal_drafting')
        .sort((a, b) => b.urutan - a.urutan)[0];
      if (!legalCertifier || legalCertifier.id !== targetRow.id) {
        throw new ForbiddenException(
          'Hanya Pejabat yang Mengesahkan yang dapat menolak Legal Drafting.',
        );
      }
    }
    if (targetRow.tahap !== n.tahapan) {
      throw new BadRequestException(
        'Baris approval tidak berada pada tahap aktif',
      );
    }
    // Approval pemrakarsa/legal berjalan berjenjang. Baris dengan urutan
    // berikutnya baru dapat diproses setelah semua urutan sebelumnya selesai.
    const waitingAtStage = rows.filter(
      (row) => row.tahap === targetRow.tahap && row.status === 'waiting',
    );
    const activeOrder = Math.min(...waitingAtStage.map((row) => row.urutan));
    if (targetRow.urutan !== activeOrder) {
      throw new ForbiddenException(
        'Belum giliran Anda untuk melakukan persetujuan.',
      );
    }
    // Superadmin bypass — bisa approve siapapun
    const isSuperadmin = (user as any).role === 'superadmin';
    const isApprover =
      isSuperadmin || this.isApprovalAssignedToUser(targetRow, user);
    if (!isApprover) {
      throw new ForbiddenException(
        'Anda tidak berhak melakukan aksi persetujuan ini',
      );
    }

    const prevTahap = n.tahapan as Tahapan;
    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(
        n,
        rows,
        approvalId,
        aksi,
        {
          catatan,
          aktor: user.nama,
          jabatan: user.positionText,
          manager,
        },
      );
      // Update via manager.update() — entity di-load di luar transaction.
      // Digital dan fisik masuk fase penandatangan. Pada fisik fase tersebut
      // merupakan approval Naskah Draft, tanpa injeksi tanda tangan digital.
      const patch: Partial<NaskahEntity> = { tahapan: newTahap };
      if (newTahap === 'tanda_tangan' && prevTahap !== 'tanda_tangan')
        patch.signingIndex = 1;
      if (newTahap === 'selesai') {
        patch.signingIndex = null;
        if (n.signOption === 'ttd_basah') {
          patch.status = 'pending';
          n.status = 'pending';
        }
      }
      if (patch.signingIndex !== undefined)
        n.signingIndex = patch.signingIndex as number | null;
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        patch,
      );
    });
    await this.publishWorkflowUpdate(
      n,
      aksi === 'setuju' || n.tahapan === 'legal_drafting',
    );
    return this.getDetail(id, user);
  }

  private async tulisRiwayatEvaluasi(
    manager: EntityManager,
    naskahId: string,
    aksi: string,
    tahap: string,
    status: string,
    user: CurrentUser,
    catatan?: string,
  ) {
    await manager.save(
      this.riwayatRepo.create({
        id: uuidv4(),
        naskahId,
        aksi,
        aktor: user.nama,
        jabatan: user.positionText ?? null,
        tahap,
        status,
        catatan: catatan?.trim() || null,
        tanggal: new Date(),
      }),
    );
  }

  private activeDynamicApproval(
    rows: NaskahLainnyaApprovalEntity[],
    tahap: string,
    user: CurrentUser,
  ) {
    const waiting = rows.filter(
      (row) => row.tahap === tahap && row.status === 'waiting',
    );
    if (!waiting.length) {
      throw new BadRequestException('Tidak ada tugas aktif pada tahap ini.');
    }
    const activeOrder = Math.min(...waiting.map((row) => row.urutan));
    const row = waiting.find(
      (item) =>
        item.urutan === activeOrder &&
        this.isApprovalAssignedToUser(item, user),
    );
    if (!row) {
      throw new ForbiddenException('Tugas ini bukan giliran Anda.');
    }
    return row;
  }

  private async assertSameUnitRecipient(
    currentPositionId: string,
    recipientPositionId?: string,
    blockedPositionIds: string[] = [],
  ) {
    if (!recipientPositionId) {
      throw new BadRequestException('Penerima wajib dipilih.');
    }
    if (blockedPositionIds.includes(String(recipientPositionId))) {
      throw new BadRequestException(
        'Penerima sudah pernah berada dalam alur persetujuan ini.',
      );
    }
    const result = await this.orgDataService.getManagerialSameUnit(
      Number(currentPositionId),
    );
    const recipient = result.data.find(
      (row: any) => String(row.position) === String(recipientPositionId),
    );
    if (!recipient) {
      throw new BadRequestException(
        'Penerima harus pejabat managerial dalam unit yang sama.',
      );
    }
    return recipient;
  }

  async kirimEvaluasi(_id: string, _dto: KirimEvaluasiDto, _user: CurrentUser) {
    // Tugas evaluasi otomatis di-seed ke pejabat pemrakarsa (EVP) saat seluruh
    // approval Legal Drafting terverifikasi — konseptor tidak perlu mengirim.
    throw new BadRequestException(
      'Evaluasi otomatis diteruskan ke EVP saat Legal Drafting selesai.',
    );
  }

  async keputusanEvaluasi(
    id: string,
    dto: KeputusanEvaluasiDto,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'evaluasi' && n.tahapan !== 'evaluasi_final') {
      throw new BadRequestException('Naskah tidak menunggu keputusan EVP.');
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const tahap = n.tahapan;
    const evpRow = this.activeDynamicApproval(rows, tahap, user);
    if (dto.keputusan !== 'lanjut_persetujuan' && !dto.catatan?.trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi.');
    }

    let next: Tahapan;
    // Legal Drafting Ulang kembali langsung ke workspace Unit Legal. Ini bukan
    // revisi oleh konseptor, sehingga tidak boleh memakai tahap perlu_perbaikan.
    if (dto.keputusan === 'legal_drafting_ulang') next = 'legal_drafting';
    else if (dto.keputusan === 'batalkan') next = 'dibatalkan';
    else next = 'blanko_verbal';

    await this.dataSource.transaction(async (manager) => {
      evpRow.status =
        dto.keputusan === 'lanjut_persetujuan' ? 'verified' : 'rejected';
      evpRow.catatan = dto.catatan?.trim() || null;
      evpRow.tanggal = new Date();
      await manager.save(evpRow);

      if (next === 'legal_drafting') {
        // Mulai satu siklus Legal Drafting baru. Riwayat approval sebelumnya
        // tetap tersimpan pada tabel riwayat, sedangkan state aktif di-reset.
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: id,
          tahap: 'legal_drafting',
        });
      }
      if (next === 'blanko_verbal') {
        // Pengiriman ulang setelah penolakan selalu menyusun satu blanko baru.
        // Riwayat keputusan lama tetap tersimpan di tabel riwayat.
        // Bersihkan approval state lama agar dua tahap yang sudah dipangkas tidak
        // ikut muncul pada detail naskah setelah Evaluasi dilanjutkan.
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: id,
          tahap: In(['persetujuan_lanjutan', 'evaluasi_final']),
        });
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: id,
          tahap: 'blanko_verbal',
        });
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: id,
          tahap: 'blanko_verbal_ditetapkan',
        });
      }
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: next },
      );
      await this.tulisRiwayatEvaluasi(
        manager,
        id,
        dto.keputusan,
        tahap,
        next,
        user,
        dto.catatan,
      );
    });
    n.tahapan = next;
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async getKandidatPersetujuanLanjutan(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'evaluasi' && n.tahapan !== 'persetujuan_lanjutan') {
      throw new BadRequestException('Kandidat tidak tersedia pada tahap ini.');
    }
    const positionId = String(user.positionId ?? user.position ?? '');
    if (!positionId)
      throw new BadRequestException('Position ID tidak tersedia.');
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    this.activeDynamicApproval(rows, n.tahapan, user);
    const result = await this.orgDataService.getManagerialSameUnit(
      Number(positionId),
    );
    const blocked = new Set(
      rows
        .filter((row) =>
          ['evaluasi', 'persetujuan_lanjutan'].includes(row.tahap),
        )
        .map((row) => String(row.positionId ?? '')),
    );
    return {
      success: true,
      data: result.data.filter(
        (row: any) => !blocked.has(String(row.position ?? '')),
      ),
    };
  }

  async teruskanPersetujuan(
    id: string,
    dto: TeruskanPersetujuanDto,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_lanjutan') {
      throw new BadRequestException('Naskah tidak dalam persetujuan lanjutan.');
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const current = this.activeDynamicApproval(
      rows,
      'persetujuan_lanjutan',
      user,
    );
    const officialRecipient = await this.assertSameUnitRecipient(
      String(user.positionId ?? user.position ?? ''),
      dto.penerima.positionId,
      rows
        .filter((row) =>
          ['evaluasi', 'persetujuan_lanjutan'].includes(row.tahap),
        )
        .map((row) => String(row.positionId ?? '')),
    );
    const nextOrder =
      Math.max(
        ...rows
          .filter((r) => r.tahap === 'persetujuan_lanjutan')
          .map((r) => r.urutan),
        0,
      ) + 1;
    await this.dataSource.transaction(async (manager) => {
      current.status = 'verified';
      current.catatan = dto.catatan?.trim() || null;
      current.tanggal = new Date();
      await manager.save(current);
      await manager.save(
        this.approvalRepo.create({
          id: uuidv4(),
          naskahId: id,
          tahap: 'persetujuan_lanjutan',
          positionId: String(dto.penerima.positionId),
          nama:
            officialRecipient.persnum_person_text ??
            officialRecipient.nama ??
            dto.penerima.nama,
          jabatan: officialRecipient.position_text ?? dto.penerima.jabatan,
          urutan: nextOrder,
          status: 'waiting',
        }),
      );
      await this.tulisRiwayatEvaluasi(
        manager,
        id,
        'teruskan-persetujuan',
        'persetujuan_lanjutan',
        'diteruskan',
        user,
        dto.catatan,
      );
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async selesaiPersetujuan(
    id: string,
    catatan: string | undefined,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_lanjutan') {
      throw new BadRequestException('Naskah tidak dalam persetujuan lanjutan.');
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const current = this.activeDynamicApproval(
      rows,
      'persetujuan_lanjutan',
      user,
    );
    const evp = [...rows]
      .filter((row) => row.tahap === 'evaluasi')
      .sort((a, b) => b.urutan - a.urutan)[0];
    if (!evp?.positionId) {
      throw new BadRequestException('EVP evaluasi awal tidak ditemukan.');
    }
    await this.dataSource.transaction(async (manager) => {
      current.status = 'verified';
      current.catatan = catatan?.trim() || null;
      current.tanggal = new Date();
      await manager.save(current);
      await manager.delete(NaskahLainnyaApprovalEntity, {
        naskahId: id,
        tahap: 'evaluasi_final',
      });
      await manager.save(
        this.approvalRepo.create({
          id: uuidv4(),
          naskahId: id,
          tahap: 'evaluasi_final',
          positionId: evp.positionId,
          nama: evp.nama,
          jabatan: evp.jabatan,
          urutan: 1,
          status: 'waiting',
        }),
      );
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: 'evaluasi_final' },
      );
      await this.tulisRiwayatEvaluasi(
        manager,
        id,
        'selesai-persetujuan',
        'persetujuan_lanjutan',
        'evaluasi_final',
        user,
        catatan,
      );
    });
    n.tahapan = 'evaluasi_final';
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async evaluasi(_id: string, _dto: EvaluasiDto, _user: CurrentUser) {
    throw new BadRequestException(
      'Evaluasi langsung sudah tidak digunakan. Kirim evaluasi ke EVP terlebih dahulu.',
    );
  }

  // Pemrakarsa mengembalikan naskah dari evaluasi ke legal_drafting agar drafter legal
  // merevisi. Alasan (catatan) wajib → dicatat ke riwayat (aksi='kembalikan-evaluasi')
  // & ditampilkan ke drafter legal di halaman legal drafting. Baris approval legal lama
  // (semua verified) dihapus — drafter kirim ulang approval (buatApprovalLegalDrafting
  // idempotent seed baru). Hanya untuk naskah butuh legal.
  async kembalikanEvaluasi(
    _id: string,
    _catatan: string | undefined,
    _user: CurrentUser,
  ) {
    throw new BadRequestException(
      'Pengembalian legal drafting harus melalui keputusan EVP.',
    );
  }

  async simpanBlanko(id: string, dto: BlankoDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const blanko = this.blankoRepo.create({
      id: uuidv4(),
      naskahId: id,
      nomorVerbal: dto.nomorVerbal ?? null,
      tanggal: dto.tanggal ? new Date(dto.tanggal) : null,
      perihal: dto.perihal ?? null,
      dasarNaskah: dto.dasarNaskah ?? null,
      catatan: dto.catatan ?? null,
      status: 'draf',
    });
    await this.blankoRepo.save(blanko);
    this.emitDetailUpdate(n.id);
    return this.getDetail(id, user);
  }

  async kirimApprovalBlanko(_id: string, _user: CurrentUser) {
    throw new BadRequestException(
      'Blanko Verbal selesai otomatis setelah approval Ditetapkan/Disahkan Oleh.',
    );
  }

  async kirimApprovalLegal(
    id: string,
    approval: { positionId?: string | null; nama: string; jabatan: string }[],
    user: CurrentUser,
    catatan?: string,
    catatanLegal?: string,
  ) {
    const n = await this.findNaskah(id);
    this.assertLegalDraftingStage(n);
    const legalPeople = (await this.legalRoleService.findAll()).filter(
      (person) => person.isActive,
    );
    const currentPerson = this.requireCurrentLegalPerson(user, legalPeople);
    let rows = await this.getLegalDraftingRows(id);

    await this.dataSource.transaction(async (manager) => {
      let active = rows.find((row) => row.status === 'waiting');
      if (!active) {
        const pengesah = this.requireLegalCertifier(
          approval?.at(-1),
          legalPeople,
        );
        rows = await this.createLegalDraftingChain(
          manager,
          n,
          currentPerson,
          pengesah,
          user,
        );
        active = rows[0];
      }

      this.assertActiveLegalRecipient(active, user);
      active.status = 'verified';
      active.catatan = catatan ?? active.catatan;
      active.tanggal = new Date();
      await manager.save(active);

      const next = rows
        .filter((row) => row.urutan > active.urutan && row.status === 'pending')
        .sort((a, b) => a.urutan - b.urutan)[0];
      if (next) {
        next.status = 'waiting';
        await manager.save(next);
        await this.writeLegalDraftingHistory(
          manager,
          n.id,
          'kirim-legal-drafting',
          user,
          `Dikirim kepada ${next.nama}`,
          catatan,
        );
      } else {
        // Pejabat yang Mengesahkan merupakan simpul terakhir. Jika ia sendiri
        // yang mengerjakan, Kirim langsung memfinalkan tahap Legal Drafting.
        await this.workflow.transisi(n, 'kirim-approval-legal', {
          aktor: user.nama,
          jabatan: user.positionText,
          catatan,
          manager,
        });
        // Legal Drafting sah → hasilnya otomatis jatuh ke pejabat pemrakarsa
        // (EVP): verifikator akhir rantai persetujuan awal, bukan konseptor
        // pemrakarsa. (ponytail: evaluasi row di-seed di transisi ini —
        // satu-satunya pintu masuk tahap evaluasi.)
        if (n.tahapan === 'evaluasi') {
          await this.seedEvaluasiEvpRow(manager, n);
        }
      }
      await this.persistLegalNote(manager, n, catatanLegal);
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async teruskanLegalDrafting(
    id: string,
    penerima: { positionId?: string | null; nama: string; jabatan: string },
    pengesahInput:
      | { positionId?: string | null; nama: string; jabatan: string }
      | undefined,
    user: CurrentUser,
    catatan?: string,
    catatanLegal?: string,
  ) {
    const n = await this.findNaskah(id);
    this.assertLegalDraftingStage(n);
    const legalPeople = (await this.legalRoleService.findAll()).filter(
      (person) => person.isActive,
    );
    const currentPerson = this.requireCurrentLegalPerson(user, legalPeople);
    const penerimaResmi = this.requireLegalRecipient(penerima, legalPeople);
    let rows = await this.getLegalDraftingRows(id);

    await this.dataSource.transaction(async (manager) => {
      let active = rows.find((row) => row.status === 'waiting');
      if (!active) {
        const pengesah = this.requireLegalCertifier(pengesahInput, legalPeople);
        rows = await this.createLegalDraftingChain(
          manager,
          n,
          currentPerson,
          pengesah,
          user,
        );
        active = rows[0];
      }

      this.assertActiveLegalRecipient(active, user);
      if (
        rows.some(
          (row) =>
            row.positionId &&
            row.positionId === String(penerimaResmi.positionId),
        )
      ) {
        throw new BadRequestException(
          'Penerima sudah terdapat pada rantai Legal Drafting.',
        );
      }

      const insertAt = active.urutan;
      const rowsToShift = rows
        .filter((row) => row.urutan >= insertAt)
        .sort((a, b) => b.urutan - a.urutan);
      for (const row of rowsToShift) {
        row.urutan += 1;
        if (row.id === active.id) row.status = 'pending';
        await manager.save(row);
      }

      const newActive = this.approvalRepo.create({
        id: uuidv4(),
        naskahId: n.id,
        tahap: 'legal_drafting',
        positionId: String(penerimaResmi.positionId),
        nama: penerimaResmi.nama,
        jabatan: penerimaResmi.jabatan,
        urutan: insertAt,
        status: 'waiting',
      });
      await manager.save(newActive);
      await this.writeLegalDraftingHistory(
        manager,
        n.id,
        'teruskan-legal-drafting',
        user,
        `Diteruskan kepada ${newActive.nama}`,
        catatan,
      );
      await this.persistLegalNote(manager, n, catatanLegal);
    });

    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  private assertLegalDraftingStage(naskah: NaskahEntity): void {
    if (naskah.tahapan !== 'legal_drafting') {
      throw new BadRequestException(
        'Naskah tidak berada pada tahap Legal Drafting.',
      );
    }
  }

  private requireCurrentLegalPerson(
    user: CurrentUser,
    legalPeople: LegalPerson[],
  ): LegalPerson {
    const positionId = String(user.positionId ?? user.position ?? '');
    const person = legalPeople.find(
      (item) => String(item.positionId) === positionId,
    );
    if (!person) {
      throw new ForbiddenException(
        'Hanya penerima aktif dari Unit Legal yang dapat memproses Legal Drafting.',
      );
    }
    return person;
  }

  private requireLegalRecipient(
    input: { positionId?: string | null; nama: string; jabatan: string },
    legalPeople: LegalPerson[],
  ): LegalPerson {
    const positionId = String(input?.positionId ?? '');
    const person = legalPeople.find(
      (item) => String(item.positionId) === positionId,
    );
    if (!person) {
      throw new BadRequestException(
        'Penerima harus anggota aktif dari Unit Legal.',
      );
    }
    return person;
  }

  private requireLegalCertifier(
    input:
      | { positionId?: string | null; nama: string; jabatan: string }
      | undefined,
    legalPeople: LegalPerson[],
  ): LegalPerson {
    if (!input) {
      throw new BadRequestException('Pilih Pejabat yang Mengesahkan.');
    }
    const person = this.requireLegalRecipient(input, legalPeople);
    if (!person.chief) {
      throw new BadRequestException(
        'Pejabat yang Mengesahkan harus pejabat manajerial Unit Legal.',
      );
    }
    return person;
  }

  private async getLegalDraftingRows(
    naskahId: string,
  ): Promise<NaskahLainnyaApprovalEntity[]> {
    const rows = await this.approvalRepo.find({
      where: { naskahId, tahap: 'legal_drafting' },
    });
    return rows.sort((a, b) => a.urutan - b.urutan);
  }

  private assertActiveLegalRecipient(
    row: NaskahLainnyaApprovalEntity | undefined,
    user: CurrentUser,
  ): asserts row is NaskahLainnyaApprovalEntity {
    if (!row || !this.isApprovalAssignedToUser(row, user)) {
      throw new ForbiddenException(
        'Saat ini bukan giliran Anda memproses Legal Drafting.',
      );
    }
  }

  private async createLegalDraftingChain(
    manager: EntityManager,
    naskah: NaskahEntity,
    current: LegalPerson,
    pengesah: LegalPerson,
    user: CurrentUser,
  ): Promise<NaskahLainnyaApprovalEntity[]> {
    await manager.delete(NaskahLainnyaApprovalEntity, {
      naskahId: naskah.id,
      tahap: 'legal_drafting',
    });
    const people =
      current.positionId === pengesah.positionId
        ? [current]
        : [current, pengesah];
    const rows = people.map((person, index) =>
      this.approvalRepo.create({
        id: uuidv4(),
        naskahId: naskah.id,
        tahap: 'legal_drafting',
        positionId: String(person.positionId),
        nama: person.nama,
        jabatan: person.jabatan,
        urutan: index + 1,
        status: index === 0 ? 'waiting' : 'pending',
      }),
    );
    for (const row of rows) await manager.save(row);
    await this.writeLegalDraftingHistory(
      manager,
      naskah.id,
      'tetapkan-pengesah-legal',
      user,
      `Pejabat yang Mengesahkan: ${pengesah.nama}`,
    );
    return rows;
  }

  private async writeLegalDraftingHistory(
    manager: EntityManager,
    naskahId: string,
    aksi: string,
    user: CurrentUser,
    status: string,
    catatan?: string,
  ): Promise<void> {
    await manager.save(
      this.riwayatRepo.create({
        id: uuidv4(),
        naskahId,
        aksi,
        aktor: user.nama,
        jabatan: user.positionText ?? null,
        tahap: 'legal_drafting',
        status,
        catatan: catatan ?? null,
        tanggal: new Date(),
      }),
    );
  }

  private async persistLegalNote(
    manager: EntityManager,
    naskah: NaskahEntity,
    catatanLegal?: string,
  ): Promise<void> {
    if (catatanLegal === undefined) return;
    await manager.update(
      NaskahEntity,
      { id: naskah.id, tanggal: naskah.tanggal as any },
      { catatanLegal: catatanLegal || null },
    );
  }

  async kembalikanLegal(id: string, catatan: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kembalikan-legal', {
        aktor: user.nama,
        jabatan: user.positionText,
        catatan,
        manager,
      });
    });
    await this.publishWorkflowUpdate(n);
    return this.getDetail(id, user);
  }

  async tandaTangan(
    id: string,
    _passphrase: string | undefined,
    user: CurrentUser,
    signMethod: 'qr_only' | 'digsig' = 'qr_only',
    catatan?: string,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'tanda_tangan') {
      throw new BadRequestException(
        'Naskah tidak dalam fase tanda tangan penandatangan.',
      );
    }
    if (
      n.signOption !== 'qr_only' &&
      n.signOption !== 'ttd_basah' &&
      n.signOption !== 'digsig'
    ) {
      throw new BadRequestException(
        'Approval penandatangan hanya tersedia untuk opsi TTD Digital atau TTD Fisik.',
      );
    }
    const chain = n.penandatanganChain ?? [];
    const N = chain.length;
    if (N === 0)
      throw new BadRequestException('Tidak ada penandatangan pada naskah ini.');
    const idx = n.signingIndex ?? 1;
    const current = chain[idx - 1];
    if (!current)
      throw new BadRequestException('Penandatangan aktif tidak ditemukan.');

    // Guard: hanya penandatangan aktif (match persnum atau positionId).
    const posId = String(user.positionId ?? user.position ?? '');
    const isCurrent =
      (current.persnum != null &&
        Number(current.persnum) === Number(user.persnum)) ||
      (current.positionId != null && current.positionId === posId);
    if (!isCurrent) {
      throw new ForbiddenException(
        'Bukan giliran Anda menandatangani naskah ini.',
      );
    }
    if (!n.lampiran)
      throw new BadRequestException('Lampiran naskah asli tidak ditemukan.');

    // Penandatangan terakhir? Nomor surat & status final hanya muncul di signer
    // terakhir. Signer 1..N-1 menandatangani dokumen "proses TTD" (belum final).
    const isLast = idx >= N;

    // TTD fisik: penandatangan hanya menyetujui Naskah Draft di aplikasi.
    // Nomor baru diterbitkan setelah penandatangan terakhir menyetujui; dokumen
    // bertanda tangan basah diunggah pemrakarsa setelah workflow ini selesai.
    if (n.signOption === 'ttd_basah') {
      if (isLast) await this.ensureNomorFinal(n, user);
      await this.dataSource.transaction(async (manager) => {
        await this.workflow.transisiTandaTangan(n, {
          aktor: user.nama,
          jabatan: user.positionText,
          catatan,
          manager,
        });
      });
      await this.publishWorkflowUpdate(n, true);
      return this.getDetail(id, user);
    }

    // ── Generate nomor final HANYA di signer terakhir (konteks signer terakhir). ──
    // Signer 1..N-1: nomor belum keluar (dokumen in-progress) → isi '' agar
    // placeholder {{nomor}} (bila ada) render kosong, bukan error docxtemplater.
    const nomor = isLast
      ? await this.ensureNomorFinal(n, user)
      : n.nomor && !/{{\s*nomor\s*}}/i.test(n.nomor)
        ? n.nomor
        : '';

    // Generate visualisasi Digsig untuk signer 1..idx (re-render dari lampiran
    // asli tiap step — idempotent). Placeholder {{tanda_tangan_N}} tidak lagi
    // memakai QR supaya konsisten dengan LPD dan Blanko Verbal.
    const originalBuffer = await this.storage.getFile(n.lampiran);
    const signedSigners: SignedSigner[] = [];
    for (let i = 0; i < idx; i++) {
      const s = chain[i];
      signedSigners.push({
        index: i + 1,
        nama: s.nama,
        jabatan: s.jabatan,
        nik: s.persnum,
      });
    }
    // Merge { nomor } ke pass-1 fill → {{nomor}} ter-fill sekali dengan {{tanda_tangan_*}}.
    // Aman bila {{nomor}} absen (docxtemplater ignore key tanpa placeholder cocok).
    const signedBuffer = await this.docxQrInline.injectQrSigners(
      originalBuffer,
      signedSigners,
      { nomor },
    );
    const signedDocxName = this.buildNaskahFileName(
      n.perihal,
      n.jenis,
      n.id,
      nomor,
    );
    const signedPdfName = signedDocxName.replace(/\.docx$/i, '.pdf');
    const signedPdf = await this.gotenberg.convertDocxToPdf(
      signedBuffer,
      signedDocxName,
    );

    // Satu artifact signed aktif per naskah. uploadBuffer selalu menambah prefix
    // {Date.now()}- sehingga "timpa" tidak pernah terjadi secara fisik — file
    // lama harus dihapus eksplisit berdasarkan key yang tercatat di DB.
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/signed`;
    const filename = 'signed.docx';
    const prevSignedKey = n.signedLampiran;
    // Preview PDF lama (dari signer sebelumnya) — diambil dari row dokumen
    // 'dittd'/'proses_ttd' existing agar bisa dihapus setelah artifact baru
    // berhasil tersimpan.
    const prevDittdRow = await this.dokumenRepo.findOne({
      where: {
        naskahId: n.id,
        tipe: 'naskah',
        status: In(['dittd', 'proses_ttd']) as any,
      },
    });
    const prevPreviewKey = prevDittdRow?.previewMinioKey ?? null;

    const result = await this.storage.uploadBuffer(
      signedBuffer,
      filename,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder,
    );
    // Upload PDF visualisasi internal sebagai preview dasar.
    const previewResult = await this.storage.uploadBuffer(
      signedPdf,
      'signed.pdf',
      'application/pdf',
      folder,
    );

    // ── TTE BSrE (digsig) untuk penandatangan TERAKHIR ──
    // Visualisasi internal tetap dirender seperti biasa; PDF final kemudian
    // ditambah invisible signature BSrE via API v2. Passphrase wajib.
    let finalPdfKey = previewResult.key;
    let tteSourceKey: string | null = null;
    if (isLast && signMethod === 'digsig') {
      if (!_passphrase?.trim()) {
        throw new BadRequestException(
          'Passphrase BSrE wajib diisi untuk Tanda Tangan Elektronik (digsig).',
        );
      }
      console.log(
        `[NaskahLainnya] TTE BSrE untuk naskah ${n.id} (signer terakhir)`,
      );
      const bsreResponse = await this.digsigService.hitDigsigEndpoint(
        {
          key: previewResult.key,
          filename: 'signed.pdf',
          nomorDokumen: nomor || n.nomor || '-',
          tanggalDokumen:
            n.tanggal instanceof Date
              ? n.tanggal.toISOString().split('T')[0]
              : String(n.tanggal ?? new Date().toISOString().split('T')[0]),
          klasifikasi: n.klasifikasi || 'Biasa',
          jenisNaskah: n.jenis,
          perihal: n.perihal || '-',
          nik: String(current.persnum ?? ''),
          passphrase: _passphrase,
          path_dokumen: `naskah-lainnya/${n.jenis}/${n.id}/digsig`,
          no_wa: '',
        },
        {
          userPersnum: Number(user.persnum),
          userName: user.nama,
          idNaskah: n.id,
          jenisNaskah: n.jenis,
        },
      );
      // hitDigsigEndpoint v2 meng-upload signed PDF ke path_dokumen dan
      // mengembalikan name_doc (key aktual MinIO). Ambil file TTE tersebut
      // sebagai PDF final (timpa preview signed.pdf).
      const bsreNameDoc =
        bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0];
      if (bsreNameDoc) {
        tteSourceKey = `naskah-lainnya/${n.jenis}/${n.id}/digsig/${bsreNameDoc}`;
        const ttePdfBuffer = await this.storage.getFile(tteSourceKey);
        const tteUpload = await this.storage.uploadBuffer(
          ttePdfBuffer,
          'signed.pdf',
          'application/pdf',
          folder,
        );
        finalPdfKey = tteUpload.key;
        console.log(
          `[NaskahLainnya] PDF final TTE BSrE tersimpan: ${tteUpload.key} (${ttePdfBuffer.length} bytes)`,
        );
      }
    }
    // Hapus artifact signed sebelumnya agar storage tidak menumpuk (timpa, bukan tambah):
    // - docx lama (prevSignedKey)
    // - preview PDF lama (prevPreviewKey)
    // - preview visualisasi dasar bila digsig (finalPdfKey sudah versi TTE)
    // - file sumber TTE di digsif/ (sudah di-copy ke signed/)
    const staleKeys = new Set<string>();
    if (
      prevSignedKey &&
      prevSignedKey !== n.lampiran &&
      prevSignedKey !== result.key
    ) {
      staleKeys.add(prevSignedKey);
    }
    if (prevPreviewKey && prevPreviewKey !== finalPdfKey) {
      staleKeys.add(prevPreviewKey);
    }
    if (finalPdfKey !== previewResult.key) {
      // digsig sukses — preview visualisasi dasar tidak dipakai lagi
      staleKeys.add(previewResult.key);
    }
    if (tteSourceKey) {
      staleKeys.add(tteSourceKey);
    }
    for (const staleKey of staleKeys) {
      try {
        await this.storage.deleteFile(staleKey);
      } catch {
        /* abaikan — file lama mungkin sudah terhapus */
      }
    }
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { signedLampiran: result.key },
    );
    n.signedLampiran = result.key;
    // Row dokumen signed: 'proses_ttd' (signer 1..N-1, belum final) → 'dittd'
    // (signer terakhir = final, terhighlight paling atas di section dokumen).
    // minioKey memakai finalPdfKey — versi TTE BSrE bila signMethod digsig.
    await this.upsertDittdRow(n.id, result.key, user, isLast, signedDocxName, {
      minioKey: finalPdfKey,
      nama: signedPdfName,
      mimetype: 'application/pdf',
      ukuran: signedPdf.length,
    });

    // Advance signing index / transisi ke selesai.
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisiTandaTangan(n, {
        aktor: user.nama,
        jabatan: user.positionText,
        catatan,
        manager,
      });
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async tolakTandaTangan(
    id: string,
    catatan: string | undefined,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'tanda_tangan') {
      throw new BadRequestException(
        'Naskah tidak dalam fase tanda tangan penandatangan.',
      );
    }
    if (!catatan?.trim() || catatan.trim().length < 5) {
      throw new BadRequestException(
        'Alasan penolakan wajib diisi minimal 5 karakter.',
      );
    }

    const chain = n.penandatanganChain ?? [];
    const current = chain[(n.signingIndex ?? 1) - 1];
    const posId = String(user.positionId ?? user.position ?? '');
    const isCurrent =
      !!current &&
      ((current.persnum != null &&
        Number(current.persnum) === Number(user.persnum)) ||
        (current.positionId != null && current.positionId === posId));
    if (!isCurrent) {
      throw new ForbiddenException('Bukan giliran Anda memeriksa naskah ini.');
    }

    const isPhysical = n.signOption === 'ttd_basah';
    const returnTahap: Tahapan = isPhysical
      ? 'perlu_perbaikan'
      : 'legal_drafting';

    await this.dataSource.transaction(async (manager) => {
      if (!isPhysical) {
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: id,
          tahap: 'legal_drafting',
        });
      }
      await manager.update(
        NaskahLainnyaDokumenEntity,
        {
          naskahId: id,
          tipe: 'naskah',
          status: In(['proses_ttd', 'dittd']) as any,
        },
        { status: 'revisi' },
      );
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        isPhysical
          ? {
              tahapan: returnTahap,
              signingIndex: null,
              signedLampiran: null,
            }
          : {
              tahapan: returnTahap,
              signingIndex: null,
              signedLampiran: null,
              butuhLegal: true,
            },
      );
      await this.tulisRiwayatEvaluasi(
        manager,
        id,
        'tolak-tanda-tangan',
        'tanda_tangan',
        returnTahap,
        user,
        catatan,
      );
    });
    n.tahapan = returnTahap;
    n.signingIndex = null;
    n.signedLampiran = null;
    if (!isPhysical) n.butuhLegal = true;
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async unggahTtdFisik(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.signOption !== 'ttd_basah') {
      throw new BadRequestException(
        'Unggah dokumen final manual hanya tersedia untuk opsi TTD Fisik.',
      );
    }
    if (n.tahapan !== 'selesai') {
      throw new BadRequestException(
        'Dokumen final manual baru dapat diunggah setelah seluruh penandatangan menyetujui Naskah Draft.',
      );
    }
    if (!this.canManageManualFinalData(n, user)) {
      throw new ForbiddenException(
        'Hanya pemrakarsa atau penandatangan yang dapat mengunggah dokumen final manual.',
      );
    }
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('Dokumen final wajib diunggah.');
    }
    const lowerName = file.originalname.toLowerCase();
    const isPdf =
      lowerName.endsWith('.pdf') || file.mimetype === 'application/pdf';
    if (!isPdf) {
      throw new BadRequestException('Dokumen final harus berformat PDF.');
    }

    await this.ensureNomorFinal(n);
    await this.repairLegacyManualFinalDocument(n);

    // Satu artifact final aktif. Upload berikutnya menggantikan artifact sebelumnya,
    // tetapi status final/belum final tetap dapat diubah terpisah dari butuhLegal.
    const previousKey = n.signedLampiran;
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/final-manual`;
    const filename = `${Date.now()}-${file.originalname}`;
    // PDF: simpan langsung — file itu sendiri adalah artifact final & preview.
    const result = await this.storage.uploadBuffer(
      file.buffer,
      filename,
      file.mimetype,
      folder,
    );
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      {
        signedLampiran: result.key,
        status: 'final',
        tahapan: 'selesai',
        signingIndex: null,
      },
    );
    n.signedLampiran = result.key;
    n.status = 'final';
    n.tahapan = 'selesai';
    n.signingIndex = null;
    await this.upsertFinalManualRow(n.id, result.key, file, user, {
      minioKey: result.key,
      nama: file.originalname,
      ukuran: file.size,
    });
    await this.catatRiwayatManual(
      n,
      user,
      'unggah-final-manual',
      'manual_final',
      `Dokumen final diunggah: ${file.originalname}`,
    );

    if (
      previousKey &&
      previousKey !== result.key &&
      previousKey !== n.lampiran
    ) {
      try {
        await this.storage.deleteFile(previousKey);
      } catch {
        /* file lama mungkin sudah tidak ada */
      }
    }
    this.emitDetailUpdate(n.id);
    return this.getDetail(id, user);
  }

  async ubahStatusFinalManual(id: string, final: boolean, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.signOption !== 'ttd_basah') {
      throw new BadRequestException(
        'Status manual hanya tersedia untuk opsi TTD Fisik.',
      );
    }
    if (n.tahapan !== 'selesai') {
      throw new BadRequestException(
        'Status manual baru dapat diubah setelah seluruh penandatangan menyetujui Naskah Draft.',
      );
    }
    if (!this.canManageManualFinalData(n, user)) {
      throw new ForbiddenException(
        'Hanya pemrakarsa atau penandatangan yang dapat mengubah status manual.',
      );
    }
    if (final) {
      const finalDoc = await this.dokumenRepo.findOne({
        where: {
          naskahId: n.id,
          tipe: 'naskah_fisik',
          status: 'final' as any,
        },
      });
      if (!finalDoc) {
        throw new BadRequestException(
          'Unggah dokumen final terlebih dahulu sebelum mengubah status menjadi Manual Final.',
        );
      }
    }

    const status: NaskahEntity['status'] = final ? 'final' : 'pending';
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { status, tahapan: 'selesai', signingIndex: null },
    );
    n.status = status;
    n.tahapan = 'selesai';
    n.signingIndex = null;
    await this.catatRiwayatManual(
      n,
      user,
      'ubah-status-final-manual',
      final ? 'manual_final' : 'belum_final',
    );
    this.emitDetailUpdate(n.id);
    return this.getDetail(id, user);
  }

  /** Nomor naskah fisik dapat dikoreksi pemrakarsa setelah dokumen ditandatangani
   * di luar aplikasi. Fase tetap selesai; hanya metadata nomor yang diperbarui. */
  async ubahNomorFinalManual(id: string, nomor: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.signOption !== 'ttd_basah') {
      throw new BadRequestException(
        'Perubahan nomor manual hanya tersedia untuk opsi TTD Fisik.',
      );
    }
    if (n.tahapan !== 'selesai') {
      throw new BadRequestException(
        'Nomor manual dapat diubah setelah proses verifikasi selesai.',
      );
    }
    if (!this.canManageManualFinalData(n, user)) {
      throw new ForbiddenException(
        'Hanya pemrakarsa atau penandatangan yang dapat mengubah nomor naskah fisik.',
      );
    }
    const cleanNomor = nomor?.trim();
    if (!cleanNomor) {
      throw new BadRequestException('Nomor naskah wajib diisi.');
    }

    await this.dataSource.transaction(async (manager) => {
      const jenisData = await manager.getRepository(JenisEntity).findOne({
        where: { jenis: n.jenis as any },
      });
      if (!jenisData?.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${n.jenis} belum dikonfigurasi.`,
        );
      }
      this.validateManualNomorFormat(
        cleanNomor,
        jenisData.formatPenomoran,
        n.jenis,
      );
      const duplicate = await manager
        .getRepository(NaskahEntity)
        .createQueryBuilder('n')
        .where('n.nomor = :nomor', { nomor: cleanNomor })
        .andWhere('n.id != :id', { id: n.id })
        .getCount();
      if (duplicate > 0) {
        throw new BadRequestException(
          `Nomor "${cleanNomor}" sudah digunakan naskah lain.`,
        );
      }
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { nomor: cleanNomor },
      );
    });
    n.nomor = cleanNomor;
    await this.catatRiwayatManual(
      n,
      user,
      'ubah-nomor-final-manual',
      'manual_final',
      `Nomor naskah fisik diubah menjadi ${cleanNomor}`,
    );
    this.emitDetailUpdate(n.id);
    return this.getDetail(id, user);
  }

  /**
   * Setelah TTD fisik selesai, pemrakarsa tetap dapat melengkapi catatan
   * penandatangan di sistem. Ini murni metadata: tidak mengubah file final,
   * tahapan, approval, maupun mengaktifkan workflow tanda tangan kembali.
   */
  async updateMetadataPenandatanganFisik(
    id: string,
    penandatangan: Array<{
      nama: string;
      jabatan: string;
      positionId?: string;
      persnum?: number;
    }>,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.signOption !== 'ttd_basah' || n.tahapan !== 'selesai') {
      throw new BadRequestException(
        'Data penandatangan hanya dapat dilengkapi pada naskah TTD fisik yang telah selesai.',
      );
    }
    if (!this.canManageManualFinalData(n, user)) {
      throw new ForbiddenException(
        'Hanya pemrakarsa atau penandatangan yang dapat melengkapi data penandatangan.',
      );
    }

    const chain = await Promise.all(
      penandatangan.map((item) => this.resolvePenandatanganSnapshot(item)),
    );
    const first = chain[0] ?? null;
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      {
        penandatanganChain: chain.length ? chain : null,
        atasNama: first?.nama ?? null,
        penandatanganJabatan: first?.jabatan ?? null,
        penandatanganPositionId: first?.positionId ?? null,
        penandatanganPersnum: first?.persnum ?? null,
      },
    );
    n.penandatanganChain = chain;
    n.atasNama = first?.nama ?? null;
    n.penandatanganJabatan = first?.jabatan ?? null;
    n.penandatanganPositionId = first?.positionId ?? null;
    n.penandatanganPersnum = first?.persnum ?? null;
    await this.catatRiwayatManual(
      n,
      user,
      'ubah-metadata-penandatangan',
      'metadata_penandatangan',
      'Data penandatangan fisik diperbarui sebagai metadata sistem.',
    );
    this.emitDetailUpdate(n.id);
    return this.getDetail(id, user);
  }

  /**
   * Pastikan n.nomor final sebelum render docx di tahap penandatanganan.
   * - Nomor manual sudah set (real, bukan placeholder) → pakai apa adanya (divalidasi di kirim).
   * - null/placeholder → auto-generate via nomorService (counter naik) dalam tx + persist.
   * Idempotent: aman dipanggil ulang (signer ke-2 dst. menemukan n.nomor sudah ter-set).
   *
   * Saat dipanggil oleh aksi tanda tangan final, konteks generasi nomor memakai
   * penandatangan terakhir. Snapshot dikirimOleh hanya menjadi fallback untuk
   * perbaikan data legacy di luar fase tanda tangan.
   */
  private async ensureNomorFinal(
    n: NaskahEntity,
    finalSigner?: CurrentUser,
  ): Promise<string> {
    const existing =
      n.nomor && !/{{\s*nomor\s*}}/i.test(n.nomor) ? n.nomor : null;
    if (existing) return existing;

    const ctx = finalSigner
      ? {
          company: finalSigner.company,
          area: finalSigner.area,
          subArea: finalSigner.subArea,
          organization: finalSigner.organization,
          position_id: finalSigner.positionId ?? finalSigner.position ?? '',
          abbreviation:
            finalSigner.positionAbbreviation ?? finalSigner.abbreviation,
        }
      : n.dikirimOleh;
    if (!ctx?.company || !ctx.area || !ctx.abbreviation) {
      throw new BadRequestException(
        finalSigner
          ? 'Data jabatan/lokasi penandatangan terakhir belum lengkap (abbreviation/area/company), hubungi admin.'
          : 'Konteks penomoran legacy (company/area/abbreviation) tidak lengkap. Hubungi admin.',
      );
    }
    const tanggalNaskah =
      n.tanggal instanceof Date ? n.tanggal : new Date(n.tanggal as any);
    if (!tanggalNaskah || isNaN(tanggalNaskah.getTime())) {
      throw new BadRequestException(
        'Tanggal naskah wajib diisi sebelum penandatangan.',
      );
    }

    const nomorFinal = await this.dataSource.transaction(async (manager) => {
      const jenisData = await manager
        .getRepository(JenisEntity)
        .findOne({ where: { jenis: n.jenis as any } });
      if (!jenisData?.formatPenomoran) {
        throw new BadRequestException(
          `Format penomoran untuk jenis ${n.jenis} belum dikonfigurasi.`,
        );
      }
      const format = jenisData.formatPenomoran;
      if (format.includes('{KLASIFIKASI}') && !(n.klasifikasi ?? null)) {
        throw new BadRequestException(
          `Klasifikasi wajib diisi untuk jenis ${n.jenis} sebelum penandatangan.`,
        );
      }
      const gen = await this.nomorService.generateNomorForNaskah(
        {
          jenis: n.jenis,
          klasifikasi: n.klasifikasi ?? undefined,
          tanggal: tanggalNaskah,
          company: ctx.company!,
          area: ctx.area!,
          subArea: ctx.subArea,
          organization: ctx.organization,
          position: ctx.position_id ?? '',
          jabatanAbbrev: ctx.abbreviation!,
          perihal: n.perihal,
        },
        manager,
      );
      await manager
        .getRepository(NaskahEntity)
        .update({ id: n.id, tanggal: n.tanggal as any }, { nomor: gen.nomor });
      return gen.nomor;
    });
    n.nomor = nomorFinal;
    return nomorFinal;
  }

  private async findNaskah(id: string): Promise<NaskahEntity> {
    const n = await this.naskahRepo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Naskah tidak ditemukan');
    return n;
  }

  private isPemrakarsa(n: NaskahEntity, user: CurrentUser): boolean {
    const userPositionId = String(user.positionId ?? user.position ?? '');
    const pemrakarsaPositionId = String(n.dikirimOleh?.position_id ?? '');
    return (
      (Boolean(userPositionId) && pemrakarsaPositionId === userPositionId) ||
      (n.dikirimOleh?.persnum != null &&
        Number(n.dikirimOleh.persnum) === Number(user.persnum))
    );
  }

  /** Penandatangan rantai TTD fisik (match persnum atau positionId) —
   *  boleh mengunggah dokumen final & mengelola metadata fisik seperti
   *  pemrakarsa (dokumen final hasil tanda tangan basah biasanya dipegang
   *  penandatangan terakhir yang menandatangani dokumen fisik). */
  private isPenandatanganFisik(n: NaskahEntity, user: CurrentUser): boolean {
    const posId = String(user.positionId ?? user.position ?? '');
    return (n.penandatanganChain ?? []).some(
      (s) =>
        (s.persnum != null && Number(s.persnum) === Number(user.persnum)) ||
        (s.positionId != null && s.positionId === posId),
    );
  }

  /** Pemrakarsa ATAU penandatangan fisik — izin pengelolaan dokumen final
   *  manual (upload/status/nomor/metadata penandatangan). */
  private canManageManualFinalData(
    n: NaskahEntity,
    user: CurrentUser,
  ): boolean {
    return this.isPemrakarsa(n, user) || this.isPenandatanganFisik(n, user);
  }

  private async catatRiwayatManual(
    n: NaskahEntity,
    user: CurrentUser,
    aksi: string,
    status: string,
    catatan?: string,
  ): Promise<void> {
    await this.riwayatRepo.save(
      this.riwayatRepo.create({
        id: uuidv4(),
        naskahId: n.id,
        aksi,
        aktor: user.nama,
        jabatan: user.positionText ?? null,
        tahap: 'selesai',
        status,
        catatan: catatan ?? null,
        tanggal: new Date(),
      }),
    );
  }

  /**
   * Validasi nomor manual vs format penomoran jenis.
   * Throw BadRequestException jika tidak match.
   */
  private validateManualNomorFormat(
    nomor: string,
    format: string,
    jenis: string,
  ): void {
    const re = buildNomorRegex(format, jenis);
    if (!re.test(nomor)) {
      throw new BadRequestException(
        `Nomor "${nomor}" tidak sesuai format ${jenis}: ${format}. Contoh valid untuk ${jenis}: lihat Standar Format Penomoran.`,
      );
    }
  }

  /** Status timeline berdasarkan tahapan saat upload. perlu_perbaikan → revisi, lainnya → draf. */
  private mapStatusUpload(tahapan: string | null): string {
    return tahapan === 'perlu_perbaikan' ? 'revisi' : 'draf';
  }

  /** Catat satu baris history versi naskah (tipe='naskah'). Dipakai uploadDokumen & kirim. */
  /** Upsert tepat satu dokumen final manual per naskah. */
  private async upsertFinalManualRow(
    naskahId: string,
    minioKey: string,
    file: Express.Multer.File,
    user: CurrentUser,
    preview: {
      minioKey: string | null;
      nama: string | null;
      ukuran: number | null;
    },
  ): Promise<void> {
    const existing = await this.dokumenRepo.findOne({
      where: { naskahId, tipe: 'naskah_fisik', status: 'final' as any },
    });
    const patch = {
      nama: file.originalname,
      minioKey,
      mimetype: file.mimetype || 'application/octet-stream',
      ukuran: file.size ?? file.buffer.length,
      tahapan: 'selesai',
      uploaderNama: user.nama,
      uploaderJabatan: user.positionText ?? null,
      uploaderPersnum: user.persnum,
      previewMinioKey: preview.minioKey,
      previewNama: preview.nama,
      previewMimetype: 'application/pdf',
      previewUkuran: preview.ukuran,
    };
    if (existing) {
      await this.dokumenRepo.update(existing.id, patch);
      if (
        existing.previewMinioKey &&
        existing.previewMinioKey !== preview.minioKey
      ) {
        await this.storage
          .deleteFile(existing.previewMinioKey)
          .catch(() => undefined);
      }
      return;
    }
    await this.dokumenRepo.save(
      this.dokumenRepo.create({
        id: uuidv4(),
        naskahId,
        tipe: 'naskah_fisik',
        status: 'final',
        ...patch,
      }),
    );
  }

  /**
   * Versi awal final manual tersimpan sebagai tipe `naskah`, sehingga upsert
   * berikutnya berisiko menimpa riwayat dokumen utama. Pindahkan hanya row yang
   * benar-benar menunjuk ke signedLampiran ke tipe fisik sebelum upload baru.
   */
  private async repairLegacyManualFinalDocument(
    n: NaskahEntity,
  ): Promise<void> {
    if (n.signOption !== 'ttd_basah' || !n.signedLampiran) return;
    const legacy = await this.dokumenRepo.findOne({
      where: {
        naskahId: n.id,
        tipe: 'naskah',
        status: 'final' as any,
        minioKey: n.signedLampiran,
      },
    });
    if (legacy) {
      await this.dokumenRepo.update(legacy.id, { tipe: 'naskah_fisik' });
    }
  }

  /** Upsert tepat satu row node signed per naskah. final=false → 'proses_ttd'
   *  (signer 1..N-1, dokumen belum final); final=true → 'dittd' (signer terakhir
   *  = final, terhighlight paling atas di section dokumen). File ditimpa tiap signer. */
  private async upsertDittdRow(
    naskahId: string,
    minioKey: string,
    user: CurrentUser,
    final = true,
    nama = 'signed.docx',
    preview?: {
      minioKey: string;
      nama: string;
      mimetype: string;
      ukuran: number;
    },
  ): Promise<void> {
    // Cari node signed yang sudah ada (status 'dittd' atau 'proses_ttd') — satu row
    // yang ditimpa tiap signer, bukan ditambah. Lalu update status sesuai final.
    const existing = await this.dokumenRepo.findOne({
      where: {
        naskahId,
        tipe: 'naskah',
        status: In(['dittd', 'proses_ttd']) as any,
      },
    });
    const status = final ? 'dittd' : 'proses_ttd';
    const tahapan = final ? 'selesai' : 'tanda_tangan';
    const previewPatch = {
      previewMinioKey: preview?.minioKey ?? null,
      previewNama: preview?.nama ?? null,
      previewMimetype: preview?.mimetype ?? null,
      previewUkuran: preview?.ukuran ?? null,
    };
    if (existing) {
      await this.dokumenRepo.update(existing.id, {
        minioKey,
        nama,
        status,
        tahapan,
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
        ...previewPatch,
      });
    } else {
      const doc = this.dokumenRepo.create({
        id: uuidv4(),
        naskahId,
        tipe: 'naskah',
        status,
        nama,
        minioKey,
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ukuran: null,
        tahapan,
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
        ...previewPatch,
      });
      await this.dokumenRepo.save(doc);
    }
    if (
      existing?.previewMinioKey &&
      existing.previewMinioKey !== preview?.minioKey
    ) {
      await this.storage
        .deleteFile(existing.previewMinioKey)
        .catch(() => undefined);
    }
  }

  private async catatVersiNaskah(
    naskahId: string,
    tahapan: string | null,
    minioKey: string,
    nama: string,
    mimetype: string,
    ukuran: number | null,
    user: CurrentUser,
    preview?: {
      minioKey: string;
      nama: string;
      mimetype: string;
      ukuran: number | null;
    },
  ): Promise<void> {
    const doc = this.dokumenRepo.create({
      id: uuidv4(),
      naskahId,
      tipe: 'naskah',
      nama,
      minioKey,
      mimetype,
      ukuran,
      previewMinioKey: preview?.minioKey ?? null,
      previewNama: preview?.nama ?? null,
      previewMimetype: preview?.mimetype ?? null,
      previewUkuran: preview?.ukuran ?? null,
      tahapan,
      status: this.mapStatusUpload(tahapan),
      uploaderNama: user.nama,
      uploaderJabatan: user.positionText ?? null,
      uploaderPersnum: user.persnum,
    });
    await this.dokumenRepo.save(doc);
  }

  private async findDokumen(n: NaskahEntity) {
    const docs: any[] = [];

    // 'naskah' — riwayat versi naskah dari baris dokumen (urut terbaru di atas).
    const versiRows = await this.dokumenRepo.find({
      where: { naskahId: n.id, tipe: 'naskah' },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (versiRows.length > 0) {
      // Fase yang dapat mengalami beberapa kali unggah revisi cukup menampilkan
      // satu versi aktif/terbaru di timeline. Baris versi sebelumnya tetap disimpan
      // di DB sebagai history, tetapi tidak membuat label fase yang sama berulang.
      // Utamakan versi yang sedang ditunjuk naskah.lampiran, bukan hanya created_at.
      // Timestamp MySQL dapat sama untuk dua unggahan berdekatan sehingga urutan
      // created_at saja berisiko menampilkan uploader dari revisi sebelumnya.
      const collapsedPhases = new Set(['persetujuan', 'legal_drafting']);
      const visibleVersionByPhase = new Map<string, string>();
      for (const phase of collapsedPhases) {
        const phaseRows = versiRows.filter(
          (row) => (row.tahapan ?? '') === phase,
        );
        const visibleRow =
          phaseRows.find((row) => row.minioKey === n.lampiran) ?? phaseRows[0];
        if (visibleRow) visibleVersionByPhase.set(phase, visibleRow.id);
      }
      for (const v of versiRows) {
        const phase = v.tahapan ?? '';
        if (
          collapsedPhases.has(phase) &&
          visibleVersionByPhase.get(phase) !== v.id
        ) {
          continue;
        }
        const isSignedVersion = ['dittd', 'proses_ttd'].includes(
          String(v.status),
        );
        const previewNama = isSignedVersion
          ? this.buildNaskahFileName(n.perihal, n.jenis, n.id, n.nomor).replace(
              /\.docx$/i,
              '.pdf',
            )
          : (v.previewNama ?? undefined);
        docs.push({
          id: v.id,
          nama: v.nama,
          tipe: 'naskah',
          ukuran: v.ukuran ? `${v.ukuran}` : '-',
          tanggal: v.createdAt.toISOString(),
          status:
            (v.status as
              | 'terbaca'
              | 'final'
              | 'revisi'
              | 'belum_diunggah'
              | 'draf'
              | 'dittd'
              | 'proses_ttd') ?? 'final',
          uploaderNama: v.uploaderNama ?? undefined,
          uploaderJabatan: v.uploaderJabatan ?? undefined,
          fase: v.tahapan ?? undefined,
          hasPdfPreview: !!v.previewMinioKey,
          previewNama,
          isCurrent: v.minioKey === (n.signedLampiran ?? n.lampiran),
        });
      }
    } else if (n.lampiran) {
      // Fallback legacy: naskah pre-feature tanpa baris history.
      docs.push({
        id: n.id,
        nama: n.lampiran.split('/').pop() || 'naskah.docx',
        tipe: 'naskah',
        ukuran: '-',
        tanggal: n.createdAt.toISOString(),
        status: 'final',
      });
    }

    // 'naskah_fisik', 'pendukung', & sheet PDFs — dari naskah_lainnya_dokumen.
    const dokRows = await this.dokumenRepo.find({
      where: {
        naskahId: n.id,
        tipe: In([
          'naskah_fisik',
          'pendukung',
          'lembar_persetujuan_direksi_pdf',
          'blanko_verbal_pdf',
        ]),
      },
      order: { createdAt: 'ASC' },
    });
    for (const d of dokRows) {
      docs.push({
        id: d.id,
        nama: d.nama,
        tipe: d.tipe,
        ukuran: d.ukuran ? `${d.ukuran}` : '-',
        tanggal: d.createdAt.toISOString(),
        status: 'final',
      });
    }

    // 'blanko_verbal' — dari blankoRepo.
    const blanko = await this.blankoRepo.find({ where: { naskahId: n.id } });
    for (const b of blanko) {
      docs.push({
        id: b.id,
        nama: `blanko-${b.nomorVerbal ?? 'verbal'}.docx`,
        tipe: 'blanko_verbal',
        ukuran: '-',
        tanggal: b.tanggal ? new Date(b.tanggal).toISOString() : null,
        status: b.status === 'draf' ? 'revisi' : 'final',
      });
    }
    return docs;
  }

  private applySheetDocumentStatuses(
    documents: { tipe?: string; status?: string }[],
    approvals: NaskahLainnyaApprovalEntity[],
  ): void {
    const approvalStagesByDocumentType: Record<string, string[]> = {
      blanko_verbal_pdf: ['blanko_verbal', 'blanko_verbal_ditetapkan'],
      lembar_persetujuan_direksi_pdf: [
        'persetujuan_direksi',
        'persetujuan_direksi_ditetapkan',
      ],
    };

    for (const document of documents) {
      const stages = approvalStagesByDocumentType[document.tipe ?? ''];
      if (!stages) continue;
      const sheetApprovals = approvals.filter((approval) =>
        stages.includes(approval.tahap),
      );
      document.status =
        sheetApprovals.length > 0 &&
        sheetApprovals.every((approval) => approval.status === 'verified')
          ? 'final'
          : 'draf';
    }
  }

  // ---------- Dokumen Pendukung / Naskah Fisik ----------

  async uploadDokumenTambahan(
    id: string,
    tipe: 'naskah_fisik' | 'pendukung',
    file: Express.Multer.File,
  ) {
    const isPdf =
      file?.originalname?.toLowerCase().endsWith('.pdf') ||
      file?.mimetype === 'application/pdf';
    if (!file?.buffer || !isPdf) {
      throw new BadRequestException('Dokumen wajib berformat PDF.');
    }
    const n = await this.findNaskah(id);
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/${tipe}`;
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.originalname}`;
    const uploadedKeys: string[] = [];
    let doc: NaskahLainnyaDokumenEntity;
    try {
      const result = await this.storage.uploadBuffer(
        file.buffer,
        filename,
        file.mimetype,
        folder,
      );
      uploadedKeys.push(result.key);

      doc = this.dokumenRepo.create({
        id: uuidv4(),
        naskahId: n.id,
        tipe,
        nama: file.originalname,
        minioKey: result.key,
        mimetype: file.mimetype,
        ukuran: file.size,
        // PDF: preview = file itu sendiri (inline viewer langsung).
        previewMinioKey: result.key,
        previewNama: file.originalname,
        previewMimetype: 'application/pdf',
        previewUkuran: file.size,
      });
      await this.dokumenRepo.save(doc);
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) =>
          this.storage.deleteFile(key).catch(() => undefined),
        ),
      );
      throw error;
    }

    this.emitDetailUpdate(n.id);

    return {
      success: true,
      data: {
        id: doc.id,
        nama: doc.nama,
        tipe: doc.tipe,
        ukuran: `${doc.ukuran ?? 0}`,
      },
    };
  }

  async deleteDokumenTambahan(id: string, dokumenId: string) {
    const doc = await this.dokumenRepo.findOne({
      where: { id: dokumenId, naskahId: id },
    });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan');

    if (doc.tipe === 'naskah') {
      throw new BadRequestException(
        'Riwayat naskah tidak dapat dihapus per versi',
      );
    }

    // Hapus file dari MinIO
    try {
      await this.storage.deleteFile(doc.minioKey);
      if (doc.previewMinioKey) {
        await this.storage.deleteFile(doc.previewMinioKey);
      }
    } catch {
      /* abaikan */
    }

    await this.dokumenRepo.delete(dokumenId);
    this.emitDetailUpdate(id);
    return { success: true, data: { id: dokumenId } };
  }

  async downloadDokumenTambahan(
    id: string,
    dokumenId: string,
    preview = false,
  ) {
    const doc = await this.dokumenRepo.findOne({
      where: { id: dokumenId, naskahId: id },
    });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan');
    // Naskah yang sudah final/ditandatangani didistribusikan sebagai PDF.
    // DOCX tetap menjadi file unduhan hanya selama masih draf/revisi.
    const isFinalNaskah =
      doc.tipe === 'naskah' && ['final', 'dittd'].includes(String(doc.status));
    const usePreview = !!doc.previewMinioKey && (preview || isFinalNaskah);
    const key = usePreview ? doc.previewMinioKey! : doc.minioKey;
    const buffer = await this.storage.getFile(key);
    return {
      buffer,
      mimetype: usePreview
        ? doc.previewMimetype || 'application/pdf'
        : doc.mimetype || 'application/octet-stream',
      nama: usePreview ? doc.previewNama || 'preview.pdf' : doc.nama,
    };
  }

  // ---------- Lembar Persetujuan Direksi ----------

  async previewLembarPersetujuanDireksi(
    id: string,
    dto: SheetDataDto,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (
      (n.tahapan !== 'blanko_verbal' && n.tahapan !== 'persetujuan_direksi') ||
      !n.butuhLegal
    ) {
      throw new BadRequestException(
        'Lembar Persetujuan Direksi hanya tersedia pada step Blanko Verbal Persetujuan Direksi.',
      );
    }
    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        n.tahapan === 'persetujuan_direksi' ? 'persetujuan_direksi' : undefined,
        n.id,
      );
    // Saat PD, preview nunjukin paraf parsial (sama dgn file). rowId '' sentinel →
    // computeVerifiedIndices hanya kumpulkan baris status='verified' (id '' gak match).
    let verifiedIndices = new Set<number>();
    if (n.tahapan === 'persetujuan_direksi') {
      const rows = await this.approvalRepo.find({ where: { naskahId: id } });
      await this.repairLegacySheetMetadataApprovals(rows);
      verifiedIndices = this.computeVerifiedIndices(
        rows,
        '',
        'persetujuan_direksi',
        diketahuiOleh,
      );
    }
    const { pdfUrl } = await this.renderSheetPdf(
      n.id,
      dto,
      `lembar-persetujuan-direksi-${n.id}.pdf`,
      'lembar_persetujuan_direksi_pdf',
      all,
      n.jenis as string,
      user,
      verifiedIndices,
      false,
      ditetapkanOleh,
      diketahuiOleh,
    );
    return { success: true, data: { pdfUrl } };
  }

  async kirimLembarPersetujuanDireksi(
    id: string,
    dto: SheetDataDto,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal' && n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException(
        'Lembar Persetujuan Direksi hanya dapat dikirim dari step Blanko Verbal Persetujuan Direksi.',
      );
    }
    const isCombinedTemplateSelection = n.tahapan === 'blanko_verbal';
    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        undefined,
        n.id,
      );
    // Kirim men-seed baris paraf direksi dan menyimpan PDF LPD awal agar muncul
    // di section Dokumen. Saat paraf, file yang sama di-render ulang dengan visual
    // digsig para direksi yang sudah menyetujui.
    await this.dataSource.transaction(async (manager) => {
      // Idempotent: hapus baris PD lama (re-kirim / recovery) lalu seed ulang.
      await manager.delete(NaskahLainnyaApprovalEntity, {
        naskahId: n.id,
        tahap: 'persetujuan_direksi',
      });
      await manager.delete(NaskahLainnyaApprovalEntity, {
        naskahId: n.id,
        tahap: 'persetujuan_direksi_ditetapkan',
      });
      await this.seedSheetMetadataApprovals(
        manager,
        n.id,
        ditetapkanOleh,
        'persetujuan_direksi_ditetapkan',
        'pending',
      );
      await this.seedBodApprovals(
        manager,
        n.id,
        diketahuiOleh,
        'persetujuan_direksi',
      );
      if (isCombinedTemplateSelection) {
        await this.workflow.transisi(n, 'kirim-lembar-persetujuan-direksi', {
          aktor: user.nama,
          jabatan: user.positionText,
          catatan: dto.catatan,
          manager,
        });
      }
    });
    await this.renderSheetPdf(
      n.id,
      dto,
      `lembar-persetujuan-direksi-${n.id}.pdf`,
      'lembar_persetujuan_direksi_pdf',
      all,
      n.jenis as string,
      user,
      new Set(),
      true,
      ditetapkanOleh,
      diketahuiOleh,
    );
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async parafLembarPersetujuanDireksi(
    id: string,
    dto: SheetDataDto,
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException(
        'Paraf lembar persetujuan direksi hanya untuk naskah tahap persetujuan direksi.',
      );
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    await this.repairLegacySheetMetadataApprovals(rows);
    const row = this.findUserWaitingRow(
      rows,
      ['persetujuan_direksi_ditetapkan', 'persetujuan_direksi'],
      user,
      dto.approvalId,
    );
    if (!row)
      throw new ForbiddenException(
        'Anda tidak memiliki baris paraf waiting untuk naskah ini.',
      );

    // Kelompok Ditetapkan/Disahkan sekaligus menandatangani lembar dan naskah
    // final, sama seperti Blanko Verbal.
    if (row.tahap === 'persetujuan_direksi_ditetapkan') {
      const ditetapkanRows = rows
        .filter((item) => item.tahap === 'persetujuan_direksi_ditetapkan')
        .sort((a, b) => a.urutan - b.urutan);
      const isFinalSigner = ditetapkanRows.every(
        (item) => item.status === 'verified' || item.id === row.id,
      );
      await this.signCombinedFinalNaskah(
        n,
        ditetapkanRows,
        row.id,
        user,
        isFinalSigner,
        dto.signMethod,
        dto.passphrase,
      );
    }

    let newTahap = n.tahapan as Tahapan;
    await this.dataSource.transaction(async (manager) => {
      const historyActor = this.resolveSheetHistoryActor(row, user);
      newTahap = await this.workflow.applyApproval(n, rows, row.id, 'setuju', {
        catatan: dto.catatan,
        aktor: historyActor.nama,
        jabatan: historyActor.jabatan,
        manager,
        completionTransitionFrom: 'blanko_verbal',
      });
      // Guard untuk memastikan approval terakhir tidak meninggalkan naskah pada
      // Blanko Verbal apabila seluruh baris dari kedua kelompok sudah verified.
      // Ini juga melindungi proses bila implementasi workflow lama masih aktif
      // pada instance yang menerima request.
      if (
        newTahap === 'blanko_verbal' &&
        this.isBlankoVerbalApprovalComplete(rows)
      ) {
        newTahap = this.workflow.resolveNext(
          'blanko_verbal',
          'complete',
          n.butuhLegal,
          n.signingIndex ?? 1,
          this.workflow.effectiveSignerCount(n),
          n.signOption,
        );
        n.tahapan = newTahap;
      }
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: newTahap },
      );
    });

    // ponytail: re-render LPD tiap paraf (paraf parsial terakumulasi terlihat di file),
    // konsisten dgn parafBlankoVerbal. saveSheetDokumen upsert row yg sama (overwrite).
    // Orphan Minio object per re-render — issue lama (blanko verbal juga), gak di-scope.
    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        'persetujuan_direksi',
        n.id,
      );
    const verifiedIndices = this.computeVerifiedIndices(
      rows,
      row.id,
      'persetujuan_direksi',
      diketahuiOleh,
    );
    const verifiedDitetapkanIndices = this.computeVerifiedIndices(
      rows,
      row.id,
      'persetujuan_direksi_ditetapkan',
      ditetapkanOleh,
    );
    await this.renderSheetPdf(
      n.id,
      dto,
      `lembar-persetujuan-direksi-${n.id}.pdf`,
      'lembar_persetujuan_direksi_pdf',
      all,
      n.jenis as string,
      user,
      verifiedIndices,
      true,
      ditetapkanOleh,
      diketahuiOleh,
      verifiedDitetapkanIndices,
    );
    await this.publishWorkflowUpdate(n, newTahap !== 'persetujuan_direksi');
    return this.getDetail(id, user);
  }

  async tolakLembarPersetujuanDireksi(
    id: string,
    catatan: string,
    user: CurrentUser,
    approvalId?: string,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException(
        'Tolak lembar persetujuan direksi hanya untuk naskah tahap persetujuan direksi.',
      );
    }
    if (!catatan?.trim())
      throw new BadRequestException('Alasan wajib diisi saat menolak.');
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    await this.repairLegacySheetMetadataApprovals(rows);
    const row = this.findUserWaitingRow(
      rows,
      ['persetujuan_direksi_ditetapkan', 'persetujuan_direksi'],
      user,
      approvalId,
    );
    if (!row)
      throw new ForbiddenException(
        'Anda tidak memiliki baris paraf waiting untuk naskah ini.',
      );

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(
        n,
        rows,
        row.id,
        'tolak',
        {
          catatan,
          aktor: row.nama || user.nama,
          jabatan: row.jabatan || user.positionText,
          manager,
        },
      );
      // Penolakan LPD memulai siklus Legal Drafting baru. Hapus state approval
      // legal lama agar section Alur Legal Drafting kembali kosong; histori
      // persetujuan sebelumnya tetap tersedia di naskah_lainnya_riwayat.
      await manager.delete(NaskahLainnyaApprovalEntity, {
        naskahId: id,
        tahap: 'legal_drafting',
      });
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: newTahap },
      );
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  // ---------- Blanko Verbal ----------

  async previewBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException(
        'Preview blanko verbal hanya untuk naskah tahap blanko verbal.',
      );
    }
    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        'blanko_verbal',
        n.id,
      );
    const { pdfUrl } = await this.renderSheetPdf(
      n.id,
      dto,
      `blanko-verbal-${n.id}.pdf`,
      'blanko_verbal_pdf',
      all,
      n.jenis as string,
      user,
      new Set(),
      false,
      ditetapkanOleh,
      diketahuiOleh,
    );
    return { success: true, data: { pdfUrl } };
  }

  async kirimBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException(
        'Kirim blanko verbal hanya untuk naskah tahap blanko verbal.',
      );
    }
    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        undefined,
        n.id,
      );
    await this.renderSheetPdf(
      n.id,
      dto,
      `blanko-verbal-${n.id}.pdf`,
      'blanko_verbal_pdf',
      all,
      n.jenis as string,
      user,
      new Set(),
      true,
      ditetapkanOleh,
      diketahuiOleh,
    );
    const existingBvRows = await this.approvalRepo.find({
      where: { naskahId: n.id, tahap: 'blanko_verbal' },
    });
    await this.dataSource.transaction(async (manager) => {
      if (existingBvRows.length === 0) {
        await manager.delete(NaskahLainnyaApprovalEntity, {
          naskahId: n.id,
          tahap: 'blanko_verbal_ditetapkan',
        });
        await this.seedSheetMetadataApprovals(
          manager,
          n.id,
          ditetapkanOleh,
          'blanko_verbal_ditetapkan',
          'pending',
        );
        await this.seedBodApprovals(
          manager,
          n.id,
          diketahuiOleh,
          'blanko_verbal',
        );
      }
      await this.workflow.transisi(n, 'kirim-blanko', {
        aktor: user.nama,
        jabatan: user.positionText,
        manager,
      });
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: n.tahapan },
      );
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  async parafBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException(
        'Paraf blanko verbal hanya untuk naskah tahap blanko verbal.',
      );
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    await this.repairLegacySheetMetadataApprovals(rows);
    const row = this.findUserWaitingRow(
      rows,
      ['blanko_verbal_ditetapkan', 'blanko_verbal'],
      user,
      dto.approvalId,
    );
    if (!row)
      throw new ForbiddenException(
        'Anda tidak memiliki baris paraf waiting untuk naskah ini.',
      );

    // Pihak Ditetapkan/Disahkan menandatangani blanko dan naskah final dalam
    // satu keputusan. Signature dibuat sebelum commit approval agar request
    // tetap dapat diulang bila transaksi approval gagal.
    if (row.tahap === 'blanko_verbal_ditetapkan') {
      const ditetapkanRows = rows
        .filter((item) => item.tahap === 'blanko_verbal_ditetapkan')
        .sort((a, b) => a.urutan - b.urutan);
      const isFinalSigner = ditetapkanRows.every(
        (item) => item.status === 'verified' || item.id === row.id,
      );
      await this.signCombinedFinalNaskah(
        n,
        ditetapkanRows,
        row.id,
        user,
        isFinalSigner,
        dto.signMethod,
        dto.passphrase,
      );
    }

    let newTahap = n.tahapan as Tahapan;
    await this.dataSource.transaction(async (manager) => {
      const historyActor = this.resolveSheetHistoryActor(row, user);
      newTahap = await this.workflow.applyApproval(n, rows, row.id, 'setuju', {
        catatan: dto.catatan,
        aktor: historyActor.nama,
        jabatan: historyActor.jabatan,
        manager,
      });
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: newTahap },
      );
    });

    const { all, diketahuiOleh, ditetapkanOleh } =
      await this.getSheetDirectorGroups(
        n.dikirimOleh?.company,
        dto,
        'blanko_verbal',
        n.id,
      );
    const verifiedIndices = this.computeVerifiedIndices(
      rows,
      row.id,
      'blanko_verbal',
      diketahuiOleh,
    );
    const verifiedDitetapkanIndices = this.computeVerifiedIndices(
      rows,
      row.id,
      'blanko_verbal_ditetapkan',
      ditetapkanOleh,
    );
    await this.renderSheetPdf(
      n.id,
      dto,
      `blanko-verbal-${n.id}.pdf`,
      'blanko_verbal_pdf',
      all,
      n.jenis as string,
      user,
      verifiedIndices,
      true,
      ditetapkanOleh,
      diketahuiOleh,
      verifiedDitetapkanIndices,
    );
    await this.publishWorkflowUpdate(n, newTahap !== 'blanko_verbal');
    return this.getDetail(id, user);
  }

  private resolveSheetHistoryActor(
    row: NaskahLainnyaApprovalEntity,
    user: CurrentUser,
  ): { nama: string; jabatan: string | undefined } {
    const isDelegatedSigner =
      !!row.delegatePersnum && row.delegatePersnum === user.persnum;
    if (!isDelegatedSigner) {
      return {
        nama: row.nama || user.nama,
        jabatan: row.jabatan || user.positionText,
      };
    }

    const positionStatus = row.delegatePositionStatus
      ?.trim()
      .replace(/\.+$/, '');
    const position = row.jabatan?.trim() || user.positionText?.trim();
    return {
      // Timeline menampilkan orang yang benar-benar membubuhkan tanda tangan.
      nama: row.delegateName?.trim() || user.nama,
      // PH/PT/PS adalah status jabatan yang diwakili, sehingga ditempatkan di
      // depan jabatan formal, bukan digabungkan ke nama aktor.
      jabatan:
        positionStatus && position
          ? `${positionStatus}. ${position}`
          : position || positionStatus,
    };
  }

  async tolakBlankoVerbal(
    id: string,
    catatan: string,
    user: CurrentUser,
    approvalId?: string,
  ) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException(
        'Tolak blanko verbal hanya untuk naskah tahap blanko verbal.',
      );
    }
    if (!catatan?.trim())
      throw new BadRequestException('Alasan wajib diisi saat menolak.');
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    await this.repairLegacySheetMetadataApprovals(rows);
    const row = this.findUserWaitingRow(
      rows,
      ['blanko_verbal_ditetapkan', 'blanko_verbal'],
      user,
      approvalId,
    );
    if (!row)
      throw new ForbiddenException(
        'Anda tidak memiliki baris paraf waiting untuk naskah ini.',
      );

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(
        n,
        rows,
        row.id,
        'tolak',
        {
          catatan,
          aktor: row.nama || user.nama,
          jabatan: row.jabatan || user.positionText,
          manager,
        },
      );
      // Penolakan Blanko Verbal memulai siklus Legal Drafting baru. State aktif
      // lama di-reset supaya alur dapat disusun ulang tanpa menduplikasi node.
      await manager.delete(NaskahLainnyaApprovalEntity, {
        naskahId: id,
        tahap: 'legal_drafting',
      });
      await manager.update(
        NaskahEntity,
        { id: n.id, tanggal: n.tanggal as any },
        { tahapan: newTahap },
      );
    });
    await this.publishWorkflowUpdate(n, true);
    return this.getDetail(id, user);
  }

  private static readonly DIREKSI_TAHAPS = [
    'blanko_verbal',
    'blanko_verbal_ditetapkan',
    'persetujuan_direksi',
    'persetujuan_direksi_ditetapkan',
  ];

  private async assertLegalRole(user: CurrentUser): Promise<void> {
    const posId = String(user.positionId ?? user.position ?? '');
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    if (!posId || !activeLegalIds.includes(posId)) {
      throw new ForbiddenException('Anda bukan legal role');
    }
  }

  async assignDelegasiDireksi(
    id: string,
    approvalId: string,
    dto: AssignDelegasiDireksiDto,
    user: CurrentUser,
  ): Promise<ReturnType<NaskahLainnyaService['toApprovalRow']>> {
    await this.assertLegalRole(user);
    const row = await this.approvalRepo.findOne({
      where: { id: approvalId, naskahId: id },
    });
    if (!row) throw new NotFoundException('Baris approval tidak ditemukan');
    if (!NaskahLainnyaService.DIREKSI_TAHAPS.includes(row.tahap)) {
      throw new BadRequestException(
        'Delegasi hanya untuk baris persetujuan direksi.',
      );
    }
    if (row.status !== 'waiting') {
      throw new ConflictException('Baris sudah diparaf, delegasi terkunci.');
    }
    row.delegatePersnum = dto.delegatePersnum;
    row.delegateName = dto.delegateName.trim();
    row.delegatePositionStatus = dto.positionStatus;
    row.assignedByPersnum = user.persnum;
    row.assignedAt = new Date();
    const saved = await this.approvalRepo.save(row);
    this.emitDetailUpdate(id);
    return this.toApprovalRow(saved);
  }

  async removeDelegasiDireksi(
    id: string,
    approvalId: string,
    user: CurrentUser,
  ): Promise<void> {
    await this.assertLegalRole(user);
    const row = await this.approvalRepo.findOne({
      where: { id: approvalId, naskahId: id },
    });
    if (!row) throw new NotFoundException('Baris approval tidak ditemukan');
    if (row.status !== 'waiting') {
      throw new ConflictException('Baris sudah diparaf, delegasi terkunci.');
    }
    row.delegatePersnum = null;
    row.delegateName = null;
    row.delegatePositionStatus = null;
    row.assignedByPersnum = null;
    row.assignedAt = null;
    await this.approvalRepo.save(row);
    this.emitDetailUpdate(id);
  }

  // ---------- Sheet helpers ----------

  private async getBodDirectors(company: string | undefined) {
    if (!company)
      throw new BadRequestException('Data company pemrakarsa tidak ditemukan.');
    // findBodByCompany hanya butuh position_json dari 1 baris org terbaru.
    // findAll() memuat 262 baris × organization_json (puluhan MB) → lambat.
    // findLatestOrg() ter-cache 5 menit & hanya 1 baris.
    const latestOrg = await this.orgDataService.findLatestOrg();
    const directors = this.orgDataService.findBodByCompany(
      latestOrg ? [latestOrg] : [],
      company,
    );
    if (!directors.length)
      throw new BadRequestException(
        'Tidak ditemukan direktur untuk company ini.',
      );
    return directors;
  }

  private async getSheetDirectorGroups(
    company: string | undefined,
    sheet: SheetDataDto,
    tahap?: 'persetujuan_direksi' | 'blanko_verbal',
    naskahId?: string,
  ): Promise<{ all: any[]; ditetapkanOleh: any[]; diketahuiOleh: any[] }> {
    const all = await this.getBodDirectors(company);
    const dirutFallback = all.filter((d) =>
      /direktur\s*utama/i.test(d.jabatan || ''),
    );
    const hasExplicitDitetapkan = Array.isArray(sheet.ditetapkanOleh);
    const hasExplicitDiketahui = Array.isArray(sheet.diketahuiOleh);
    const selectedDitetapkan = this.normalizeSelectedDirectors(
      all,
      sheet.ditetapkanOleh,
      [],
    );

    let ditetapkanFallback: any[] = [];
    if (tahap && naskahId && !hasExplicitDitetapkan) {
      const rows = await this.approvalRepo.find({
        where: { naskahId, tahap: `${tahap}_ditetapkan` },
      });
      ditetapkanFallback = rows.map((r) => ({
        positionId: r.positionId,
        nama: r.nama,
        jabatan: r.jabatan,
      }));
    }

    let approvalFallback: any[] = [];
    if (tahap && naskahId && !hasExplicitDiketahui) {
      const rows = await this.approvalRepo.find({ where: { naskahId, tahap } });
      approvalFallback = rows.map((r) => ({
        positionId: r.positionId,
        nama: r.nama,
        jabatan: r.jabatan,
      }));
    }

    const selectedDiketahui = this.normalizeSelectedDirectors(
      all,
      sheet.diketahuiOleh,
      hasExplicitDiketahui
        ? []
        : approvalFallback.length
          ? approvalFallback
          : all,
    );
    if (!selectedDiketahui.length) {
      throw new BadRequestException(
        'Minimal satu direksi pada Diketahui Oleh wajib dipilih.',
      );
    }

    const ditetapkanOleh = (
      hasExplicitDitetapkan
        ? selectedDitetapkan
        : selectedDitetapkan.length
          ? selectedDitetapkan
          : ditetapkanFallback.length
            ? this.normalizeSelectedDirectors(all, ditetapkanFallback, [])
            : dirutFallback.length
              ? dirutFallback
              : all.slice(0, 1)
    ).map((d, i) => ({ ...d, index: i + 1 }));
    if (!ditetapkanOleh.length) {
      throw new BadRequestException(
        'Minimal satu pejabat pada Ditetapkan/Disahkan Oleh wajib dipilih.',
      );
    }

    return {
      all,
      ditetapkanOleh,
      diketahuiOleh: selectedDiketahui.map((d, i) => ({ ...d, index: i + 1 })),
    };
  }

  private normalizeSelectedDirectors(
    all: any[],
    selected: any[] | undefined,
    fallback: any[],
  ): any[] {
    const source = selected?.length ? selected : fallback;
    const isExplicitSelection = Array.isArray(selected);
    const seen = new Set<string>();
    const normalized: any[] = [];
    for (const item of source) {
      const positionId = item?.positionId ? String(item.positionId) : '';
      const nama = item?.nama ? String(item.nama).trim().toLowerCase() : '';
      const match =
        all.find((d) => positionId && d.positionId === positionId) ||
        all.find((d) => nama && String(d.nama).trim().toLowerCase() === nama);
      if (!match && isExplicitSelection) continue;
      const normalizedItem = {
        ...(match
          ? {
              ...match,
              nama: item?.nama ? String(item.nama).trim() : match.nama,
              jabatan: match.jabatan,
            }
          : item),
        // Nama ybs (pejabat asal) — approval row tetap atas nama direksi,
        // nama pengganti disimpan di kolom delegasi.
        namaPejabat: match?.nama ?? item?.nama,
        // Status delegasi direksi — default 'ybs' (pejabat bersangkungan).
        delegator: item?.delegator?.trim() || 'ybs',
        // Routing delegasi ke pengganti (persnum dari pilihan nama BOD-1).
        delegatePersnum: item?.delegatePersnum,
        delegateName: item?.delegateName,
        delegatePositionStatus: item?.delegatePositionStatus,
      };
      const key =
        normalizedItem.positionId ||
        `${String(normalizedItem.nama ?? '')
          .trim()
          .toLowerCase()}|${String(normalizedItem.jabatan ?? '')
          .trim()
          .toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      normalized.push(normalizedItem);
    }
    return normalized;
  }

  private findUserWaitingRow(
    rows: NaskahLainnyaApprovalEntity[],
    tahap: string | string[],
    user: CurrentUser,
    approvalId?: string,
  ): NaskahLainnyaApprovalEntity | undefined {
    const tahaps = Array.isArray(tahap) ? tahap : [tahap];
    return rows.find(
      (r) =>
        (!approvalId || r.id === approvalId) &&
        tahaps.includes(r.tahap) &&
        r.status === 'waiting' &&
        this.isApprovalAssignedToUser(r, user),
    );
  }

  /**
   * Approval modern terikat ke position_id. Nama hanya dipakai sebagai fallback
   * untuk data lama yang belum memiliki position_id. Dengan demikian jabatan
   * yang sedang dijalankan PT/PH/PS hanya dapat diproses oleh aktor delegasi.
   */
  private isApprovalAssignedToUser(
    row: NaskahLainnyaApprovalEntity,
    user: CurrentUser,
  ): boolean {
    // Delegate per-naskah: match by persnum sebelum fallback position.
    if (
      row.delegatePersnum &&
      user.persnum &&
      row.delegatePersnum === user.persnum
    ) {
      return true;
    }
    const userPositionId = String(user.positionId ?? user.position ?? '');
    const rowPositionId = String(row.positionId ?? '');
    if (rowPositionId)
      return !!userPositionId && rowPositionId === userPositionId;

    return Boolean(
      user.nama &&
        row.nama &&
        row.nama.trim().toLowerCase() === user.nama.trim().toLowerCase(),
    );
  }

  private async repairLegacySheetMetadataApprovals(
    rows: NaskahLainnyaApprovalEntity[],
  ): Promise<void> {
    const legacyRows = rows.filter(
      (r) =>
        (r.tahap === 'persetujuan_direksi_ditetapkan' ||
          r.tahap === 'blanko_verbal_ditetapkan') &&
        r.status === 'verified' &&
        !r.tanggal,
    );
    for (const row of legacyRows) {
      row.status = 'waiting';
      row.urutan = 1;
      await this.approvalRepo.update(
        { id: row.id },
        { status: 'waiting', urutan: 1 },
      );
    }
  }

  /**
   * Recovery untuk naskah lama yang seluruh paraf Blanko Verbal-nya sudah
   * verified, tetapi tahapan tersimpan masih `blanko_verbal`. Kondisi ini tidak
   * boleh menunggu aksi manual legal; saat detail dibuka workflow diselaraskan
   * satu kali ke target signing yang semestinya.
   */
  private async recoverCompletedBlankoVerbal(
    naskah: NaskahEntity,
    rows: NaskahLainnyaApprovalEntity[],
    user: CurrentUser,
  ): Promise<void> {
    if (
      naskah.tahapan !== 'blanko_verbal' ||
      !this.isBlankoVerbalApprovalComplete(rows)
    )
      return;

    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(naskah, 'complete', {
        aktor: user.nama,
        jabatan: user.positionText,
        manager,
      });
    });
  }

  /**
   * Recovery alur LPD yang sebelum perbaikan berhenti di `blanko_verbal`
   * setelah seluruh Diketahui + Ditetapkan sudah verified (transisi completion
   * lama jatuh ke Blanko Verbal legacy tanpa ttd naskah final).
   */
  private async recoverCompletedCombinedLpd(
    naskah: NaskahEntity,
    rows: NaskahLainnyaApprovalEntity[],
    user: CurrentUser,
  ): Promise<void> {
    if (naskah.tahapan !== 'blanko_verbal') return;
    const lpdRows = rows.filter(
      (row) =>
        row.tahap === 'persetujuan_direksi' ||
        row.tahap === 'persetujuan_direksi_ditetapkan',
    );
    if (!lpdRows.length || !lpdRows.every((row) => row.status === 'verified'))
      return;

    const ditetapkanRows = lpdRows
      .filter((row) => row.tahap === 'persetujuan_direksi_ditetapkan')
      .sort((a, b) => a.urutan - b.urutan);
    if (!naskah.signedLampiran && ditetapkanRows.length) {
      await this.signCombinedFinalNaskah(
        naskah,
        ditetapkanRows,
        ditetapkanRows[ditetapkanRows.length - 1].id,
        user,
        true,
      );
    }
    await this.dataSource.transaction((manager) =>
      this.workflow.transisi(naskah, 'complete', {
        aktor: user.nama,
        jabatan: user.positionText,
        manager,
      }),
    );
  }

  private isBlankoVerbalApprovalComplete(
    rows: NaskahLainnyaApprovalEntity[],
  ): boolean {
    const blankoRows = rows.filter(
      (row) =>
        row.tahap === 'blanko_verbal' ||
        row.tahap === 'blanko_verbal_ditetapkan',
    );
    return (
      blankoRows.length > 0 &&
      blankoRows.every((row) => row.status === 'verified')
    );
  }

  /**
   * Pejabat pemrakarsa (EVP) = simpul terakhir/tertinggi rantai persetujuan awal
   * (`tahap=persetujuan`), bukan user konseptor yang mengirim.
   */
  private resolveEvpFromPersetujuan(
    rows: NaskahLainnyaApprovalEntity[],
  ): NaskahLainnyaApprovalEntity | undefined {
    return [...rows]
      .filter((r) => r.tahap === 'persetujuan')
      .sort((a, b) => b.urutan - a.urutan)[0];
  }

  /**
   * Seed baris tugas evaluasi untuk pejabat pemrakarsa (EVP) — penerima awal
   * hasil Legal Drafting. Idempotent: hapus baris evaluasi lama dulu (mis. sisa
   * rejected dari siklus sebelumnya) lalu seed baru.
   */
  private async seedEvaluasiEvpRow(
    manager: EntityManager,
    naskah: NaskahEntity,
  ): Promise<NaskahLainnyaApprovalEntity | null> {
    const persetujuanRows = (await manager.find(NaskahLainnyaApprovalEntity, {
      where: { naskahId: naskah.id, tahap: 'persetujuan' },
    })) as NaskahLainnyaApprovalEntity[];
    const evp = this.resolveEvpFromPersetujuan(persetujuanRows);
    if (!evp) return null;
    await manager.delete(NaskahLainnyaApprovalEntity, {
      naskahId: naskah.id,
      tahap: 'evaluasi',
    });
    const row = this.approvalRepo.create({
      id: uuidv4(),
      naskahId: naskah.id,
      tahap: 'evaluasi',
      positionId: evp.positionId ?? null,
      nama: evp.nama,
      jabatan: evp.jabatan,
      urutan: 1,
      status: 'waiting',
    });
    await manager.save(row);
    return row;
  }

  /**
   * Recovery: naskah pada tahap evaluasi tanpa baris evaluasi (legacy sebelum
   * seeding otomatis). Baris tugas EVP dibuat saat detail dibuka.
   */
  private async recoverEvaluasiEvpRow(
    naskah: NaskahEntity,
    rows: NaskahLainnyaApprovalEntity[],
  ): Promise<void> {
    if (naskah.tahapan !== 'evaluasi') return;
    if (rows.some((r) => r.tahap === 'evaluasi')) return;
    const seeded = await this.dataSource.transaction((manager) =>
      this.seedEvaluasiEvpRow(manager, naskah),
    );
    if (seeded) rows.push(seeded);
  }

  /**
   * Baris approval sheet dari form: bila delegator ≠ 'ybs' dan ada persnum
   * pengganti, task paraf diroute ke pengganti lewat kolom delegasi
   * (isApprovalAssignedToUser match delegatePersnum duluan) — nama row tetap
   * ybs direksi, nama pengganti di delegateName.
   */
  private sheetApprovalFields(d: any) {
    const delegated =
      d.delegator &&
      d.delegator !== 'ybs' &&
      d.delegatePersnum != null &&
      Number(d.delegatePersnum) > 0;
    return delegated
      ? {
          positionId: d.positionId ?? null,
          nama: d.namaPejabat ?? d.nama,
          jabatan: d.jabatan,
          delegatePersnum: Number(d.delegatePersnum),
          delegateName: d.delegateName ?? d.nama,
          delegatePositionStatus: (d.delegatePositionStatus ??
            d.delegator) as string,
        }
      : {
          positionId: d.positionId ?? null,
          nama: d.nama,
          jabatan: d.jabatan,
        };
  }

  private async seedBodApprovals(
    manager: EntityManager,
    naskahId: string,
    directors: any[],
    tahap: 'persetujuan_direksi' | 'blanko_verbal',
  ): Promise<void> {
    await manager.delete(NaskahLainnyaApprovalEntity, { naskahId, tahap });
    for (const [index, d] of directors.entries()) {
      const row = this.approvalRepo.create({
        id: uuidv4(),
        naskahId,
        tahap,
        ...this.sheetApprovalFields(d),
        urutan: index + 1,
        status: 'waiting',
      });
      await manager.save(row);
    }
  }

  private async seedSheetMetadataApprovals(
    manager: EntityManager,
    naskahId: string,
    directors: any[],
    tahap: string,
    initialStatus: 'pending' | 'waiting' = 'waiting',
  ): Promise<void> {
    for (const [index, d] of directors.entries()) {
      const row = this.approvalRepo.create({
        id: uuidv4(),
        naskahId,
        tahap,
        ...this.sheetApprovalFields(d),
        urutan: index + 1,
        status: initialStatus,
      });
      await manager.save(row);
    }
  }

  /**
   * Membubuhkan signature pihak Ditetapkan/Disahkan ke naskah utama. Index
   * mengikuti urutan pada form blanko dan diakumulasi pada satu signed.docx.
   */
  private async signCombinedFinalNaskah(
    naskah: NaskahEntity,
    ditetapkanRows: NaskahLainnyaApprovalEntity[],
    currentRowId: string,
    user: CurrentUser,
    final: boolean,
    signMethod: 'qr_only' | 'digsig' = 'qr_only',
    passphrase?: string,
  ): Promise<void> {
    if (!naskah.lampiran) {
      throw new BadRequestException('Lampiran naskah asli tidak ditemukan.');
    }
    if (final && signMethod === 'digsig' && !passphrase?.trim()) {
      throw new BadRequestException(
        'Passphrase BSrE wajib diisi untuk Tanda Tangan Elektronik (digsig).',
      );
    }
    const nomor = final
      ? await this.ensureNomorFinal(naskah, user)
      : naskah.nomor && !/{{\s*nomor\s*}}/i.test(naskah.nomor)
        ? naskah.nomor
        : '';
    const signedSigners: SignedSigner[] = ditetapkanRows
      .filter((row) => row.status === 'verified' || row.id === currentRowId)
      .map((row, index) => {
        const delegateName = row.delegateName?.trim();
        const delegateStatus = row.delegatePositionStatus?.trim();
        const position = row.jabatan?.trim() || '';
        const delegatedPosition =
          delegateName && delegateStatus
            ? new RegExp(`^${delegateStatus}\\.?\\s+`, 'i').test(position)
              ? position
              : `${delegateStatus}. ${position}`
            : position;
        return {
          index: row.urutan || index + 1,
          // Visible sign menampilkan aktor yang benar-benar menandatangani.
          nama: delegateName || row.nama,
          // PT/PH/PS adalah status jabatan, bukan prefix nama pejabat.
          jabatan: delegatedPosition,
        };
      });
    const originalBuffer = await this.storage.getFile(naskah.lampiran);
    const signedBuffer = await this.docxQrInline.injectQrSigners(
      originalBuffer,
      signedSigners,
      { nomor },
    );
    const signedDocxName = this.buildNaskahFileName(
      naskah.perihal,
      naskah.jenis,
      naskah.id,
      nomor,
    );
    const signedPdfName = signedDocxName.replace(/\.docx$/i, '.pdf');
    const signedPdf = await this.gotenberg.convertDocxToPdf(
      signedBuffer,
      signedDocxName,
    );
    const folder = `naskah-lainnya/${naskah.jenis}/${naskah.id}/signed`;
    const previousKey = naskah.signedLampiran;
    const upload = await this.storage.uploadBuffer(
      signedBuffer,
      'signed.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder,
    );
    const previewUpload = await this.storage.uploadBuffer(
      signedPdf,
      'signed.pdf',
      'application/pdf',
      folder,
    );
    let finalPdfKey = previewUpload.key;
    let finalPdfSize = signedPdf.length;
    let tteSourceKey: string | null = null;
    if (final && signMethod === 'digsig') {
      const bsreResponse = await this.digsigService.hitDigsigEndpoint(
        {
          key: previewUpload.key,
          filename: 'signed.pdf',
          nomorDokumen: nomor || naskah.nomor || '-',
          tanggalDokumen:
            naskah.tanggal instanceof Date
              ? naskah.tanggal.toISOString().split('T')[0]
              : String(
                  naskah.tanggal ?? new Date().toISOString().split('T')[0],
                ),
          klasifikasi: naskah.klasifikasi || 'Biasa',
          jenisNaskah: naskah.jenis,
          perihal: naskah.perihal || '-',
          nik: String(user.persnum ?? ''),
          passphrase: passphrase!,
          path_dokumen: `naskah-lainnya/${naskah.jenis}/${naskah.id}/digsig`,
          no_wa: '',
        },
        {
          userPersnum: Number(user.persnum),
          userName: user.nama,
          idNaskah: naskah.id,
          jenisNaskah: naskah.jenis,
        },
      );
      const bsreNameDoc =
        bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0];
      if (bsreNameDoc) {
        tteSourceKey = `naskah-lainnya/${naskah.jenis}/${naskah.id}/digsig/${bsreNameDoc}`;
        const ttePdfBuffer = await this.storage.getFile(tteSourceKey);
        const tteUpload = await this.storage.uploadBuffer(
          ttePdfBuffer,
          'signed.pdf',
          'application/pdf',
          folder,
        );
        finalPdfKey = tteUpload.key;
        finalPdfSize = ttePdfBuffer.length;
      }
    }
    if (
      previousKey &&
      previousKey !== naskah.lampiran &&
      previousKey !== upload.key
    ) {
      try {
        await this.storage.deleteFile(previousKey);
      } catch {
        /* file sebelumnya mungkin sudah tidak ada */
      }
    }
    if (finalPdfKey !== previewUpload.key) {
      await this.storage.deleteFile(previewUpload.key).catch(() => undefined);
    }
    if (tteSourceKey) {
      await this.storage.deleteFile(tteSourceKey).catch(() => undefined);
    }
    await this.naskahRepo.update(
      { id: naskah.id, tanggal: naskah.tanggal as any },
      { signedLampiran: upload.key },
    );
    naskah.signedLampiran = upload.key;
    await this.upsertDittdRow(
      naskah.id,
      upload.key,
      user,
      final,
      signedDocxName,
      {
        minioKey: finalPdfKey,
        nama: signedPdfName,
        mimetype: 'application/pdf',
        ukuran: finalPdfSize,
      },
    );
  }

  /**
   * Himpun index direksi (1-based) yang sudah verified pada tahap paraf, termasuk
   * baris yang baru saja diparaf (rowId). Direksi dicocokkan ke index berdasarkan
   * urutan `directors` (posisi) via positionId/nama — sama dengan cara reRender lama.
   */
  private computeVerifiedIndices(
    rows: NaskahLainnyaApprovalEntity[],
    rowId: string,
    tahap:
      | 'persetujuan_direksi'
      | 'persetujuan_direksi_ditetapkan'
      | 'blanko_verbal'
      | 'blanko_verbal_ditetapkan',
    directors: any[],
  ): Set<number> {
    const verifiedRows = rows.filter(
      (r) => r.tahap === tahap && (r.status === 'verified' || r.id === rowId),
    );
    const indices = new Set<number>();
    for (const r of verifiedRows) {
      const idx = directors.findIndex(
        (d) =>
          (d.positionId && r.positionId === d.positionId) || r.nama === d.nama,
      );
      if (idx >= 0) indices.add(idx + 1);
    }
    return indices;
  }

  /**
   * Render sheet (LPD atau blanko verbal) ke PDF via service khusus, lalu upload
   * + simpan baris dokumen. `verifiedIndices` menentukan direksi mana yang dapat
   * visible digsig (∅ untuk preview/kirim; baris verified untuk paraf).
   * `tipe` menentukan service & tipe dokumen: 'lembar_persetujuan_direksi_pdf'
   * → LPD; 'blanko_verbal_pdf' → blanko.
   */
  private async renderSheetPdf(
    naskahId: string,
    sheet: SheetDataDto,
    filename: string,
    tipe: 'lembar_persetujuan_direksi_pdf' | 'blanko_verbal_pdf',
    directors: any[],
    _documentType: string,
    user: CurrentUser,
    verifiedIndices: Set<number>,
    persist = true,
    ditetapkanOleh: any[] = [],
    diketahuiOleh: any[] = [],
    verifiedDitetapkanIndices: Set<number> = new Set(),
  ): Promise<{ pdfUrl: string; minioKey: string }> {
    const isSameDirector = (a: any, b: any) =>
      (a?.positionId &&
        b?.positionId &&
        String(a.positionId) === String(b.positionId)) ||
      (a?.nama &&
        b?.nama &&
        String(a.nama).trim().toLowerCase() ===
          String(b.nama).trim().toLowerCase());
    const isKnownDirectorVerified = (d: any) => {
      const idx = diketahuiOleh.findIndex((source: any) =>
        isSameDirector(source, d),
      );
      return idx >= 0 && verifiedIndices.has(idx + 1);
    };
    const directorsWithSignature = directors.map((d: any, i: number) => ({
      index: i + 1,
      positionId: d.positionId,
      nama: d.nama,
      jabatan: d.jabatan,
      signatureVisible: isKnownDirectorVerified(d),
    }));
    const data: SheetPdfData = {
      tanggal: sheet.tanggal,
      nomor: sheet.nomor,
      diusulkanOleh: sheet.diusulkanOleh,
      jabatanDiusulkan: sheet.jabatanDiusulkan,
      perihal: sheet.perihal,
      referensiDari: sheet.referensiDari,
      referensiNomor: sheet.referensiNomor,
      referensiTanggal: sheet.referensiTanggal,
      klasifikasi: sheet.klasifikasi,
      lampiran: sheet.lampiran,
      legalDrafter: sheet.legalDrafter,
      legalDrafterJabatan: sheet.legalDrafterJabatan,
      legalChecker: sheet.legalChecker,
      legalCheckerJabatan: sheet.legalCheckerJabatan,
      bodyHtml: sheet.bodyHtml,
      catatan: sheet.catatan,
      directors: directorsWithSignature,
      ditetapkanOleh: ditetapkanOleh.map((d: any, i: number) => ({
        index: i + 1,
        positionId: d.positionId,
        nama: d.nama,
        jabatan: d.jabatan,
        delegator: d.delegator || 'ybs',
        signatureVisible: verifiedDitetapkanIndices.has(i + 1),
      })),
      diketahuiOleh: diketahuiOleh.map((d: any, i: number) => {
        return {
          index: i + 1,
          positionId: d.positionId,
          nama: d.nama,
          jabatan: d.jabatan,
          delegator: d.delegator || 'ybs',
          signatureVisible: verifiedIndices.has(i + 1),
        };
      }),
      verifiedIndices,
    };
    const buffer =
      tipe === 'lembar_persetujuan_direksi_pdf'
        ? await this.lpdService.render(data)
        : await this.blankoService.render(data);
    const upload = await this.storage.uploadBuffer(
      buffer,
      filename,
      'application/pdf',
      'naskah-lainnya-pdf',
    );
    const pdfUrl = await this.storage.getFileUrl(upload.key, 3600);
    // persist=false → preview sekali jalan (URL sementara) tanpa menyimpan baris dokumen.
    if (persist)
      await this.saveSheetDokumen(naskahId, tipe, upload.key, filename, user);
    return { pdfUrl, minioKey: upload.key };
  }

  private async saveSheetDokumen(
    naskahId: string,
    tipe: string,
    minioKey: string,
    nama: string,
    user: CurrentUser,
  ): Promise<NaskahLainnyaDokumenEntity> {
    const existing = await this.dokumenRepo.findOne({
      where: { naskahId, tipe },
    });
    if (existing) {
      await this.dokumenRepo.update(existing.id, {
        minioKey,
        nama,
        mimetype: 'application/pdf',
        ukuran: null,
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
      });
      return {
        ...existing,
        minioKey,
        nama,
        mimetype: 'application/pdf',
        ukuran: null,
      } as NaskahLainnyaDokumenEntity;
    }
    const doc = this.dokumenRepo.create({
      id: uuidv4(),
      naskahId,
      tipe,
      nama,
      minioKey,
      mimetype: 'application/pdf',
      ukuran: null,
      uploaderNama: user.nama,
      uploaderJabatan: user.positionText ?? null,
      uploaderPersnum: user.persnum,
    });
    return this.dokumenRepo.save(doc);
  }
}
