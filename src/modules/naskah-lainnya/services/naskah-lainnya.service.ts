import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../../storage/services/storage.service';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from '../entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from '../entities/naskah-lainnya-dokumen.entity';
import { WorkflowService, Tahapan } from './workflow.service';
import { DocxReaderService } from './docx-reader.service';
import { DocxQrInlineService } from './docx-qr-inline.service';
import { QRCodeService } from '../../digsig/services/qrcode.service';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';
import { NomorService } from '../../nomor/services/nomor.service';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { BuatNaskahDto, UpdateNaskahDto, EvaluasiDto, BlankoDto } from '../dto/index.dto';
import { buildNomorRegex } from './nomor-format.helper';

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
    private readonly qrCode: QRCodeService,
    private readonly docxFiller: DocxFillerService,
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly legalRoleService: LegalRoleService,
    private readonly nomorService: NomorService,
  ) {}

  // ---------- List ----------

  async getList(query: { tab?: string; search?: string; jenis?: string; tahapan?: string; page?: number }, user: CurrentUser) {
    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
      .orderBy('n.createdAt', 'DESC');

    // Match pemrakarsa via identity unik: position_id ATAU persnum dari dikirim_oleh.
    // JANGAN fallback ke created_by_position (menyimpan jabatan TEXT, bukan id unik) —
    // matching by jabatan text bocorkan naskah antar user yang share jabatan.
    const posId = user.positionId ?? user.position;
    qb.andWhere(
      '(JSON_EXTRACT(n.dikirim_oleh, :jsonPathPos) = :posId OR JSON_EXTRACT(n.dikirim_oleh, :jsonPathPers) = :persnum)',
      { jsonPathPos: '$.position_id', posId, jsonPathPers: '$.persnum', persnum: user.persnum },
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
      qb.andWhere('(n.tahapan IS NULL OR n.tahapan != :konsep)', { konsep: 'konsep' });
      // Legal-role user mengakses naskah legal_drafting/blanko_verbal via menu
      // Legal Drafting — jangan duplikat di Daftar umum. Non-legal pemrakarsa
      // tetap melihat naskahnya di Daftar (mereka tak punya menu Legal Drafting).
      const activeLegalIds = await this.legalRoleService.getActivePositionIds();
      const legalPosId = String(user.positionId ?? user.position ?? '');
      if (activeLegalIds.includes(legalPosId)) {
        qb.andWhere('n.tahapan NOT IN (:...ex)', { ex: ['legal_drafting', 'blanko_verbal'] });
      }
    }

    const rows = await qb.getMany();
    return {
      success: true,
      data: rows.map((r) => this.toListItem(r)),
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
      conditions.push('a.nama = :nama');
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

  private toListItem(r: NaskahEntity) {
    // Pemrakarsa: ambil nama & jabatan dari dikirimOleh (JSON snapshot),
    // fallback ke createdByPosition (jabatan saja) jika dikirimOleh null.
    const dikirim = r.dikirimOleh;
    const pemrakarsaNama = dikirim?.nama ?? r.createdByPosition ?? '-';
    const pemrakarsaJabatan = dikirim?.position_text ?? r.createdByPosition ?? '-';
    const pemrakarsaPersnum = dikirim?.persnum ? Number(dikirim.persnum) : undefined;

    // Penandatangan: kembalikan sebagai array (dukung multiple).
    // Jika penandatanganChain ada, pakai isinya; jika tidak, fallback ke single
    // dari atasNama + penandatanganJabatan (backward compat).
    const penandatangan = r.penandatanganChain?.length
      ? r.penandatanganChain.map((p) => ({
          nama: p.nama, jabatan: p.jabatan,
          positionId: p.positionId, persnum: p.persnum,
        }))
      : [{ nama: r.atasNama ?? '-', jabatan: r.penandatanganJabatan ?? '', positionId: r.penandatanganPositionId ?? undefined, persnum: r.penandatanganPersnum ?? undefined }];

    return {
      id: r.id,
      nomor: r.nomor,
      jenis: r.jenis,
      perihal: r.perihal ?? '',
      pemrakarsa: { nama: pemrakarsaNama, jabatan: pemrakarsaJabatan, persnum: pemrakarsaPersnum },
      tahapan: (r.tahapan ?? 'konsep') as Tahapan,
      butuhLegal: r.butuhLegal,
      penandatangan,
      tanggal: new Date(r.tanggal).toISOString().slice(0, 10),
      terakhirDiubah: r.createdAt.toISOString(),
    };
  }

  // ---------- Detail ----------

  async getDetail(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const [approval, riwayat, dokumen] = await Promise.all([
      this.approvalRepo.find({ where: { naskahId: id }, order: { urutan: 'ASC' } }),
      this.riwayatRepo.find({ where: { naskahId: id }, order: { tanggal: 'ASC' } }),
      this.findDokumen(n),
    ]);

    // Cek apakah user adalah approver yang sedang menunggu (status='waiting')
    // untuk naskah ini. Hanya approver yang bisa setuju/tolak/kembalikan.
    const isCurrentApprover = approval.some((a) => {
      if (a.status !== 'waiting') return false;
      const posId = user.positionId ?? user.position;
      if (posId && a.positionId === posId) return true;
      if (user.nama && a.nama === user.nama) return true;
      return false;
    });

    // Cek apakah user adalah pemrakarsa (match via identity unik: position_id atau persnum).
    // Jangan match by createdByPosition (jabatan text) — bocor antar user dengan jabatan sama.
    const posId = user.positionId ?? user.position;
    const isPemrakarsa =
      (n.dikirimOleh?.position_id != null && n.dikirimOleh.position_id === posId) ||
      (n.dikirimOleh?.persnum != null && Number(n.dikirimOleh.persnum) === user.persnum);

    // Build available actions, lalu filter berdasarkan role user:
    // - persetujuan: hanya approver waiting yang bisa setuju/tolak/kembalikan
    // - konsep/perlu_perbaikan: hanya pemrakarsa yang bisa kirim
    // - tanda_tangan_*: hanya penandatangan yang bisa tanda-tangan
    const hasWaitingLegalRows = approval.some(
      (a) => a.tahap === 'legal_drafting' && a.status === 'waiting',
    );
    let availableActions = await this.workflow.buildAvailableActions(
      (n.tahapan ?? 'konsep') as Tahapan, n.butuhLegal, user, hasWaitingLegalRows,
    );

    // Filter aksi persetujuan: hanya approver waiting yang berhak
    if ((n.tahapan === 'persetujuan') && !isCurrentApprover) {
      availableActions = availableActions.filter(
        (a) => a !== 'setuju' && a !== 'tolak' && a !== 'kembalikan',
      );
    }

    // Filter aksi kirim: hanya pemrakarsa yang bisa kirim (konsep/perlu_perbaikan)
    if ((n.tahapan === 'konsep' || n.tahapan === 'perlu_perbaikan') && !isPemrakarsa) {
      availableActions = availableActions.filter((a) => a !== 'kirim');
    }

    // Filter aksi evaluasi: hanya pemrakarsa yang bisa evaluasi
    if (n.tahapan === 'evaluasi' && !isPemrakarsa) {
      availableActions = availableActions.filter((a) => a !== 'evaluasi');
    }

    // Filter aksi tanda-tangan: hanya penandatangan aktif (current signer) yang bisa tanda tangan
    if (n.tahapan === 'tanda_tangan') {
      const chain = n.penandatanganChain?.length
        ? n.penandatanganChain
        : [{ positionId: n.penandatanganPositionId != null ? String(n.penandatanganPositionId) : '', persnum: n.penandatanganPersnum ?? undefined }];
      const idx = n.signingIndex ?? 1;
      const current = chain[idx - 1];
      const isCurrent = !!current && (
        (current.persnum != null && Number(current.persnum) === Number(user.persnum)) ||
        (current.positionId != null && current.positionId === posId)
      );
      if (!isCurrent) {
        availableActions = availableActions.filter((a) => a !== 'tanda-tangan');
      }
    }

    return {
      success: true,
      data: {
        ...this.toListItem(n),
        klasifikasi: n.klasifikasi ?? 'Biasa',
        sifat: n.sifat,
        signOption: n.signOption ?? 'digsig',
        approvalChain: n.approvalChain,
        fileUrl: n.lampiran ? `/naskah-lainnya/${n.id}/file` : null,
        dokumen,
        approval: approval.map((a) => ({
          id: a.id, tahap: a.tahap, nama: a.nama, jabatan: a.jabatan,
          urutan: a.urutan, status: a.status, catatan: a.catatan ?? undefined,
          tanggal: a.tanggal ? new Date(a.tanggal).toISOString() : null,
        })),
        riwayat: riwayat.map((r) => ({
          id: r.id, aksi: r.aksi, aktor: r.aktor, jabatan: r.jabatan ?? '',
          tahap: r.tahap ?? '', status: r.status ?? '', catatan: r.catatan ?? undefined,
          tanggal: new Date(r.tanggal).toISOString(),
        })),
        stepper: this.workflow.buildStepper(
          (n.tahapan ?? 'konsep') as Tahapan,
          n.butuhLegal,
          n.penandatanganChain?.length ?? 0,
          n.signingIndex,
        ),
        signingIndex: n.signingIndex,
        signerCount: n.penandatanganChain?.length ?? 0,
        signedFileUrl: n.signedLampiran ? `/naskah-lainnya/${n.id}/file` : null,
        availableActions,
      },
    };
  }

  // ---------- Riwayat (kontrak: GET /:id/riwayat) ----------

  async getRiwayat(id: string) {
    const rows = await this.riwayatRepo.find({ where: { naskahId: id }, order: { tanggal: 'ASC' } });
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id, aksi: r.aksi, aktor: r.aktor, jabatan: r.jabatan ?? '',
        tahap: r.tahap ?? '', status: r.status ?? '', catatan: r.catatan ?? undefined,
        tanggal: new Date(r.tanggal).toISOString(),
      })),
    };
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
      ? penandatanganList.map((p) => ({
          positionId: p.positionId ? String(p.positionId) : undefined,
          persnum: p.persnum ?? undefined,
          nama: p.nama,
          jabatan: p.jabatan,
        }))
      : null;
    // Legacy single fields: ambil dari penandatangan pertama (backward compat).
    const first = penandatanganList[0];
    const naskah = this.naskahRepo.create({
      id: uuidv4(),
      jenis: dto.jenis as any,
      klasifikasi: dto.klasifikasi ?? 'Biasa',
      sifat: (dto.sifat ?? 'biasa') as any,
      nomor: null, // nomor di-generate saat kirim (finalisasi), bukan saat draft
      tanggal,
      perihal: dto.perihal ?? null,
      signOption: (dto.signOption ?? 'digsig') as any,
      butuhLegal: dto.butuhLegal,
      tahapan: 'konsep',
      atasNama: first?.nama,
      penandatanganJabatan: first?.jabatan ?? null,
      penandatanganPositionId: first?.positionId ? String(first.positionId) : null,
      penandatanganPersnum: first?.persnum ?? null,
      penandatanganChain,
      approvalChain: dto.approval?.length ? dto.approval : null,
      createdByPosition: user.positionText ?? user.nama,
      dikirimOleh: { persnum: user.persnum, nama: user.nama, position_text: user.positionText ?? '', position_id: user.position ?? user.positionId ?? '' },
    } as unknown as NaskahEntity);
    const saved = await this.naskahRepo.save(naskah);
    return { success: true, data: { id: saved.id } };
  }

  async updateDraft(id: string, dto: UpdateNaskahDto) {
    const n = await this.findNaskah(id);
    if (dto.nomor !== undefined && (n.tahapan ?? 'konsep') !== 'konsep' && n.tahapan !== 'perlu_perbaikan') {
      throw new BadRequestException('Nomor sudah dikunci setelah kirim dan tidak dapat diubah.');
    }
    const patch: Partial<NaskahEntity> = {};
    if (dto.perihal !== undefined) { n.perihal = dto.perihal; patch.perihal = dto.perihal; }
    if (dto.nomor !== undefined) { n.nomor = dto.nomor; patch.nomor = dto.nomor; }
    if (dto.tanggal !== undefined) {
      const t = new Date(dto.tanggal);
      const valid = !isNaN(t.getTime());
      n.tanggal = valid ? t : new Date();
    }
    if (dto.butuhLegal !== undefined) { n.butuhLegal = dto.butuhLegal; patch.butuhLegal = dto.butuhLegal; }
    if (dto.klasifikasi !== undefined) { n.klasifikasi = dto.klasifikasi; patch.klasifikasi = dto.klasifikasi; }
    if (dto.approval !== undefined) { n.approvalChain = dto.approval?.length ? dto.approval : null; patch.approvalChain = n.approvalChain; }
    // Simpan penandatangan (single atau array → normalisasi ke chain)
    if (dto.penandatangan) {
      const penandatanganList = Array.isArray(dto.penandatangan) ? dto.penandatangan : [dto.penandatangan];
      const chain = penandatanganList.map((p) => ({
        positionId: p.positionId ? String(p.positionId) : undefined,
        persnum: p.persnum,
        nama: p.nama,
        jabatan: p.jabatan,
      }));
      n.penandatanganChain = chain;
      patch.penandatanganChain = chain;
      // Legacy single fields dari penandatangan pertama
      const first = penandatanganList[0];
      n.atasNama = first?.nama ?? null; patch.atasNama = n.atasNama;
      n.penandatanganJabatan = first?.jabatan ?? null; patch.penandatanganJabatan = n.penandatanganJabatan;
      n.penandatanganPositionId = first?.positionId ? String(first.positionId) : null; patch.penandatanganPositionId = n.penandatanganPositionId;
      n.penandatanganPersnum = first?.persnum ?? null; patch.penandatanganPersnum = n.penandatanganPersnum;
    }
    if (dto.sifat !== undefined) { n.sifat = dto.sifat as any; patch.sifat = dto.sifat as any; }
    if (dto.signOption !== undefined) { n.signOption = dto.signOption as any; patch.signOption = dto.signOption as any; }
    if (Object.keys(patch).length > 0) {
      await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, patch);
    }
    return this.getDetail(id, { persnum: 0, nama: '' });
  }

  async kirim(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if ((n.tahapan ?? 'konsep') !== 'konsep' && n.tahapan !== 'perlu_perbaikan') {
      throw new BadRequestException('Hanya naskah konsep / perlu perbaikan yang bisa dikirim');
    }
    // Validasi penandatangan: Digital (qr_only) butuh minimal 1 penandatangan.
    const N = n.penandatanganChain?.length ?? 0;
    if (n.signOption === 'qr_only' && N === 0) {
      throw new BadRequestException('Opsi TTD Digital (QR) butuh minimal 1 penandatangan.');
    }

    // ── Penomoran saat finalisasi ──────────────────────────────────────
    const tanggalNaskah = n.tanggal instanceof Date ? n.tanggal : new Date(n.tanggal as any);
    if (!tanggalNaskah || isNaN(tanggalNaskah.getTime())) {
      throw new BadRequestException('Tanggal naskah wajib diisi sebelum kirim (untuk penomoran).');
    }
    if (!user.abbreviation || !user.area || !user.company) {
      throw new BadRequestException(
        'Data jabatan/lokasi pemrakarsa belum lengkap (abbreviation/area/company), hubungi admin.',
      );
    }
    const klasifikasiNaskah = n.klasifikasi ?? null;

    await this.dataSource.transaction(async (manager) => {
      const jenisRepo = manager.getRepository(JenisEntity);
      const jenisData = await jenisRepo.findOne({ where: { jenis: n.jenis as any } });
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

      let nomorFinal: string;
      if (n.nomor) {
        // ── Manual: validasi format + uniqueness, counter TIDAK naik ──
        this.validateManualNomorFormat(n.nomor, format, n.jenis);
        const clash = await manager
          .getRepository(NaskahEntity)
          .createQueryBuilder('n')
          .where('n.nomor = :nomor', { nomor: n.nomor })
          .andWhere('n.id != :id', { id: n.id })
          .getCount();
        if (clash > 0) {
          throw new BadRequestException(`Nomor "${n.nomor}" sudah digunakan naskah lain.`);
        }
        nomorFinal = n.nomor;
      } else {
        // ── Auto: generate via adapter, counter naik ──
        const gen = await this.nomorService.generateNomorForNaskah(
          {
            jenis: n.jenis,
            klasifikasi: klasifikasiNaskah ?? undefined,
            tanggal: tanggalNaskah,
            company: user.company!,
            area: user.area!,
            subArea: user.subArea,
            organization: user.organization,
            position: user.position ?? user.positionId ?? '',
            jabatanAbbrev: user.abbreviation!,
          },
          manager,
        );
        nomorFinal = gen.nomor;
      }

      // ── Fill placeholder {{nomor}} di docx (jika ada lampiran) ───────
      // ponytail: MinIO I/O (getFile/fill/uploadBuffer) sengaja di dalam transaksi
      // yang menahan counter lock, agar gagal fill → rollback penuh (counter tidak
      // naik, naskah tetap konsep, tanpa gap nomor / orphan file). Tradeoff: lock
      // ditahan ~1 S3 round-trip. Upgrade: split ke 2 tx (generate+commit, lalu I/O,
      // lalu persist) jika throughput kirim naskah-lainnya tinggi — imbasnya gap
      // nomor saat I/O gagal pasca-commit.
      if (n.lampiran) {
        let originalBuf: Buffer;
        let text: string;
        try {
          originalBuf = await this.storage.getFile(n.lampiran);
          text = this.docxReader.extractText(originalBuf);
        } catch (e) {
          throw new BadRequestException(
            'Gagal membaca file docx lampiran. Periksa file tidak corrupt.',
          );
        }
        if (!/{{\s*nomor\s*}}/i.test(text)) {
          throw new BadRequestException(
            'Docx harus dari template sistem (berisi placeholder {{nomor}}). Upload template yang benar.',
          );
        }
        let filled: Buffer;
        try {
          filled = this.docxFiller.fill(originalBuf, { nomor: nomorFinal });
        } catch (e) {
          throw new BadRequestException(
            'Gagal mengisi placeholder {{nomor}} ke template. Periksa format template docx.',
          );
        }
        const folder = `naskah-lainnya/${n.jenis}/${n.id}/naskah`;
        const filename = `${Date.now()}-${n.lampiran.split('/').pop() ?? 'naskah.docx'}`;
        const result = await this.storage.uploadBuffer(
          filled,
          filename,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          folder,
        );
        n.lampiran = result.key;
      }

      // ── Set nomor final, simpan ──
      n.nomor = nomorFinal;
      await manager
        .getRepository(NaskahEntity)
        .update({ id: n.id, tanggal: n.tanggal as any }, { nomor: nomorFinal, lampiran: n.lampiran });

      // ── Lanjut workflow kirim ──
      await this.workflow.transisi(n, 'kirim', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });

    return this.getDetail(id, user);
  }

  // ---------- Persetujuan (antrian) ----------

  async getPersetujuan(user: CurrentUser, status?: string) {
    const filter: 'menunggu' | 'disetujui' | 'ditolak' =
      status === 'disetujui' || status === 'ditolak' ? status : 'menunggu';

    // Disetujui / Ditolak: riwayat approval user (status setuju/tolak), tahapan apa pun.
    if (filter !== 'menunggu') {
      const approvalStatus = filter === 'disetujui' ? 'setuju' : 'tolak';
      const ids = await this.getNaskahIdsForApproverStatus(user, approvalStatus);
      let rows: NaskahEntity[] = [];
      if (ids.length > 0) {
        rows = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
          .andWhere('n.id IN (:...ids)', { ids })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
      }
      return { success: true, data: rows.map((r) => this.toListItem(r)) };
    }

    // Menunggu (default) — persetujuan/perlu_perbaikan (approver waiting)
    // + tanda_tangan/blanko_verbal (penandatangan).
    // 1. Naskah di tahap persetujuan/perlu_perbaikan di mana user adalah approver waiting
    const approvalNaskahIds = await this.getNaskahIdsForApproverStatus(user, 'waiting');
    let rows: NaskahEntity[] = [];

    if (approvalNaskahIds.length > 0) {
      rows = await this.naskahRepo
        .createQueryBuilder('n')
        .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
        .andWhere('n.tahapan IN (:...t)', { t: ['persetujuan', 'perlu_perbaikan'] })
        .andWhere('n.id IN (:...ids)', { ids: approvalNaskahIds })
        .orderBy('n.createdAt', 'DESC')
        .getMany();
    }

    // 2. Naskah di tahap tanda_tangan_* di mana user adalah penandatangan
    const posId = String(user.positionId ?? user.position ?? '');
    if (posId) {
      const ttdRows = await this.naskahRepo
        .createQueryBuilder('n')
        .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
        .andWhere('n.tahapan IN (:...tTahap)', { tTahap: ['tanda_tangan', 'blanko_verbal'] })
        .andWhere('(JSON_CONTAINS(n.penandatangan_chain, JSON_OBJECT(\'positionId\', :posId)) OR n.penandatangan_position_id = :posIdStr)', { posId, posIdStr: posId })
        .orderBy('n.createdAt', 'DESC')
        .getMany();
      const existingIds2 = new Set(rows.map((r) => r.id));
      for (const r of ttdRows) {
        if (!existingIds2.has(r.id)) rows.push(r);
      }
    }

    return { success: true, data: rows.map((r) => this.toListItem(r)) };
  }

  // ---------- Legal Drafting (antrian khusus legal role) ----------

  // Status persetujuan legal drafting (filter di halaman Legal Drafting):
  //  - belum-dikirim: legal_drafting tanpa baris approval (belum pernah kirim approval legal).
  //  - menunggu: sudah kirim approval, ada baris waiting (di tangan approver).
  //  - ditolak: ada baris rejected, tidak ada waiting (ditolak approver, balik ke drafter).
  //  - aksi-saya: naskah yang sudah user ini lakukan aksi legal (mulai-legal /
  //    kirim-approval-legal / kembalikan-legal / kirim-approval-blanko) — terlepas
  //    tahapan sekarang (bisa sudah lanjut evaluasi/tanda tangan/selesai).
  async getLegalDrafting(user: CurrentUser, status: string = 'belum-dikirim') {
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    const posId = String(user.positionId ?? user.position ?? '');
    if (!posId || !activeLegalIds.includes(posId)) {
      throw new ForbiddenException('Anda bukan legal role');
    }
    const validStatus = ['belum-dikirim', 'menunggu', 'ditolak', 'aksi-saya'];
    const st = validStatus.includes(status) ? status : 'belum-dikirim';

    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
      .orderBy('n.createdAt', 'DESC');

    if (st === 'aksi-saya') {
      // Riwayat aksi legal oleh user ini (match by aktor = nama — satu-satunya
      // identifier di riwayat, sama pola dgn approval nama match).
      qb.andWhere(
        'EXISTS (SELECT 1 FROM naskah_lainnya_riwayat r WHERE r.naskah_id = n.id AND r.aktor = :aktor AND r.aksi IN (:...aksiSaya))',
        { aktor: user.nama, aksiSaya: ['mulai-legal', 'kirim-approval-legal', 'kembalikan-legal', 'kirim-approval-blanko'] },
      );
    } else {
      // Base: legal_drafting (butuh legal) ATAU blanko_verbal.
      qb.andWhere(
        '((n.tahapan = :ld AND n.butuh_legal = :bl) OR (n.tahapan = :bv))',
        { ld: 'legal_drafting', bl: true, bv: 'blanko_verbal' },
      );
      // Subquery baris legal_drafting approval (dipakai EXISTS/NOT EXISTS).
      const ldRow = "SELECT 1 FROM naskah_lainnya_approval a WHERE a.naskah_id = n.id AND a.tahap = 'legal_drafting'";
      let statusClause: string;
      if (st === 'menunggu') {
        statusClause = `EXISTS (${ldRow} AND a.status = 'waiting')`;
      } else if (st === 'ditolak') {
        statusClause = `EXISTS (${ldRow} AND a.status = 'rejected') AND NOT EXISTS (${ldRow} AND a.status = 'waiting')`;
      } else {
        // belum-dikirim: tidak ada baris legal_drafting approval sama sekali
        // (termasuk naskah blanko_verbal yang tidak punya baris legal_drafting).
        statusClause = `NOT EXISTS (${ldRow})`;
      }
      qb.andWhere(statusClause);
    }

    const rows = await qb.getMany();
    return { success: true, data: rows.map((r) => this.toListItem(r)) };
  }

  /**
   * Ambil daftar naskahId di mana user ini adalah approver dengan status tertentu
   * ('waiting' = menunggu aksi user, 'setuju' = disetujui, 'tolak' = ditolak).
   */
  private async getNaskahIdsForApproverStatus(user: CurrentUser, status: string): Promise<string[]> {
    const conditions: string[] = [];
    const params: Record<string, any> = { status };
    const posId = user.positionId ?? user.position;
    if (posId) {
      conditions.push('a.position_id = :positionId');
      params.positionId = posId;
    }
    if (user.nama) {
      conditions.push('a.nama = :nama');
      params.nama = user.nama;
    }
    if (conditions.length === 0) return [];
    const rows = await this.approvalRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.naskah_id', 'naskahId')
      .where(`(${conditions.join(' OR ')})`)
      .andWhere('a.status = :status')
      .setParameters(params)
      .getRawMany<{ naskahId: string }>();
    return rows.map((r) => r.naskahId);
  }

  // ---------- Upload & Template ----------

  async uploadDokumen(id: string, file: Express.Multer.File, user: CurrentUser) {
    const n = await this.findNaskah(id);
    // Struktur direktori: naskah-lainnya/{jenis}/{id}/naskah/{timestamp}-{nama-asli}.docx
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/naskah`;
    const filename = `${Date.now()}-${file.originalname}`;
    const result = await this.storage.uploadBuffer(file.buffer, filename, file.mimetype, folder);
    const key = result.key;
    const params = await this.docxReader.readParameters(file.buffer);
    const patch: Partial<NaskahEntity> = {};
    patch.lampiran = key; // simpan MinIO key agar bisa di-fetch ulang saat buka draft
    if (params.perihal) { n.perihal = params.perihal; patch.perihal = params.perihal; }
    // tanggal adalah bagian PK — skip update di sini (hindari PK change)
    if (params.tanggal) {
      const t = new Date(params.tanggal);
      if (!isNaN(t.getTime())) n.tanggal = t; // update in-memory only
    }
    if (Object.keys(patch).length > 0) {
      await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, patch);
    }
    await this.catatVersiNaskah(
      n.id, n.tahapan, key, file.originalname, file.mimetype, file.size, user,
    );
    return { success: true, data: { parameter: params } };
  }

  async getTemplateUrl(jenis: string) {
    const key = `templates/naskah-lainnya/${jenis}.docx`;
    const url = await this.storage.getFileUrl(key, 3600);
    return { success: true, data: url };
  }

  /** Deteksi jumlah slot penandatangan dari placeholder {{tanda_tangan_N}} di template. */
  async getTemplateSigners(jenis: string) {
    const key = `templates/naskah-lainnya/${jenis}.docx`;
    let buffer: Buffer;
    try {
      buffer = await this.storage.getFile(key);
    } catch {
      throw new NotFoundException(`Template ${jenis} tidak ditemukan di storage.`);
    }
    const { count, slots } = this.docxReader.readSignerSlots(buffer);
    return { success: true, data: { count, slots } };
  }

  async downloadFile(id: string): Promise<{ buffer: Buffer; mimetype: string }> {
    const n = await this.findNaskah(id);
    // Saat fase signing/selesai, prefer artifact signed (QR / upload fisik); fallback lampiran asli.
    const key = n.signedLampiran ?? n.lampiran;
    if (!key) throw new NotFoundException('File naskah belum diunggah');
    try {
      const buffer = await this.storage.getFile(key);
      const isDocx = key.toLowerCase().endsWith('.docx');
      return {
        buffer,
        mimetype: isDocx
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream',
      };
    } catch {
      throw new NotFoundException('File naskah tidak ditemukan di storage. Silakan unggah ulang.');
    }
  }

  async deleteDraft(id: string) {
    const n = await this.findNaskah(id);
    // Hanya bisa hapus draft yang masih konsep/perlu_perbaikan
    if (n.tahapan && n.tahapan !== 'konsep' && n.tahapan !== 'perlu_perbaikan') {
      throw new BadRequestException('Hanya naskah draft (konsep/perlu_perbaikan) yang bisa dihapus');
    }
    // Hapus file dari MinIO jika ada
    if (n.lampiran) {
      try { await this.storage.deleteFile(n.lampiran); } catch { /* abaikan — file mungkin sudah tidak ada */ }
    }
    // Hapus child tables
    await this.approvalRepo.delete({ naskahId: id });
    await this.riwayatRepo.delete({ naskahId: id });
    await this.blankoRepo.delete({ naskahId: id });
    // Hapus naskah
    await this.naskahRepo.delete({ id, tanggal: n.tanggal as any });
    return { success: true, data: { id } };
  }

  // ---------- Delegasi aksi approval & workflow ----------

  async setuju(id: string, approvalId: string, catatan: string | undefined, user: CurrentUser) {
    return this.aksiApproval(id, approvalId, 'setuju', catatan, user);
  }
  async tolak(id: string, approvalId: string, catatan: string, user: CurrentUser) {
    if (!catatan) throw new BadRequestException('Alasan wajib diisi saat menolak');
    return this.aksiApproval(id, approvalId, 'tolak', catatan, user);
  }
  async kembalikan(id: string, approvalId: string, catatan: string, user: CurrentUser) {
    if (!catatan) throw new BadRequestException('Alasan wajib diisi saat mengembalikan');
    return this.aksiApproval(id, approvalId, 'kembalikan', catatan, user);
  }

  private async aksiApproval(id: string, approvalId: string, aksi: 'setuju' | 'tolak' | 'kembalikan', catatan: string | undefined, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });

    // Guard: hanya approver dengan status 'waiting' yang bisa melakukan aksi.
    // Pemrakarsa/penandatangan tidak boleh approve naskah sendiri.
    const targetRow = rows.find((r) => r.id === approvalId);
    if (!targetRow) {
      throw new BadRequestException('Baris approval tidak ditemukan');
    }
    if (targetRow.status !== 'waiting') {
      throw new BadRequestException('Baris approval sudah diproses');
    }
    const posId = user.positionId ?? user.position;
    // Superadmin bypass — bisa approve siapapun
    const isSuperadmin = (user as any).role === 'superadmin';
    const isApprover = isSuperadmin ||
      (posId && targetRow.positionId === posId) ||
      (user.nama && targetRow.nama === user.nama);
    if (!isApprover) {
      throw new ForbiddenException('Anda tidak berhak melakukan aksi persetujuan ini');
    }

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(n, rows, approvalId, aksi, {
        catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      // Update via manager.update() — entity di-load di luar transaction
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: newTahap });
    });
    return this.getDetail(id, user);
  }

  async evaluasi(id: string, dto: EvaluasiDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const N = n.penandatanganChain?.length ?? 0;
    const next = this.workflow.nextAfterEvaluasi(dto.sesuai, n.butuhLegal, N);
    const patch: Partial<NaskahEntity> = { tahapan: next };
    if (next === 'tanda_tangan') patch.signingIndex = 1;
    n.tahapan = next;
    if (patch.signingIndex !== undefined) n.signingIndex = 1;
    await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, patch);
    if (next === 'tanda_tangan' && n.signOption === 'ttd_basah') {
      await this.prepareFisikArtifact(n);
    }
    return this.getDetail(id, user);
  }

  async simpanBlanko(id: string, dto: BlankoDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const blanko = this.blankoRepo.create({
      id: uuidv4(), naskahId: id,
      nomorVerbal: dto.nomorVerbal ?? null, tanggal: dto.tanggal ? new Date(dto.tanggal) : null,
      perihal: dto.perihal ?? null, dasarNaskah: dto.dasarNaskah ?? null,
      catatan: dto.catatan ?? null, status: 'draf',
    });
    await this.blankoRepo.save(blanko);
    return this.getDetail(id, user);
  }

  async kirimApprovalBlanko(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kirim-approval-blanko', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    if (n.tahapan === 'tanda_tangan' && n.signOption === 'ttd_basah') {
      await this.prepareFisikArtifact(n);
    }
    return this.getDetail(id, user);
  }

  async kirimApprovalLegal(
    id: string,
    approval: { positionId?: string | null; nama: string; jabatan: string }[],
    user: CurrentUser,
  ) {
    const n = await this.findNaskah(id);
    // Hanya legal role yang bisa kirim approval legal drafting.
    const posId = String(user.positionId ?? user.position ?? '');
    const activeIds = await this.legalRoleService.getActivePositionIds();
    const isLegal = activeIds.includes(posId);
    if (!isLegal) {
      throw new ForbiddenException('Hanya unit legal yang dapat mengirim approval legal drafting.');
    }
    if (!approval?.length) {
      throw new BadRequestException('Pilih minimal satu pemberi persetujuan legal.');
    }
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.buatApprovalLegalDrafting(manager, n, approval, {
        aktor: user.nama, jabatan: user.positionText,
      });
    });
    return this.getDetail(id, user);
  }

  async kembalikanLegal(id: string, catatan: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kembalikan-legal', {
        aktor: user.nama, jabatan: user.positionText, catatan, manager,
      });
    });
    return this.getDetail(id, user);
  }

  async tandaTangan(id: string, _passphrase: string | undefined, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'tanda_tangan') {
      throw new BadRequestException('Naskah tidak dalam fase tanda tangan penandatangan.');
    }
    if (n.signOption !== 'qr_only') {
      throw new BadRequestException(
        'Endpoint tanda-tangan hanya untuk opsi Digital (qr_only). Fisik gunakan unggah-ttd-fisik.',
      );
    }
    const chain = n.penandatanganChain ?? [];
    const N = chain.length;
    if (N === 0) throw new BadRequestException('Tidak ada penandatangan pada naskah ini.');
    const idx = n.signingIndex ?? 1;
    const current = chain[idx - 1];
    if (!current) throw new BadRequestException('Penandatangan aktif tidak ditemukan.');

    // Guard: hanya penandatangan aktif (match persnum atau positionId).
    const posId = String(user.positionId ?? user.position ?? '');
    const isCurrent =
      (current.persnum != null && Number(current.persnum) === Number(user.persnum)) ||
      (current.positionId != null && current.positionId === posId);
    if (!isCurrent) {
      throw new ForbiddenException('Bukan giliran Anda menandatangani naskah ini.');
    }
    if (!n.lampiran) throw new BadRequestException('Lampiran naskah asli tidak ditemukan.');

    // Generate QR untuk signer 1..idx (re-render dari lampiran asli tiap step — idempotent).
    const originalBuffer = await this.storage.getFile(n.lampiran);
    const signedSigners: { index: number; qrBuffer: Buffer }[] = [];
    for (let i = 0; i < idx; i++) {
      const s = chain[i];
      const qrBuffer = await this.qrCode.generateQRCodePngBuffer({
        signature_id: `${n.id}-${i + 1}`,
        document_number: n.nomor ?? n.id,
        signed_at: new Date().toISOString(),
        signer_name: s.nama,
        signer_jabatan: s.jabatan,
        document_type: n.jenis,
        verification_url: `${process.env.FRONTEND_URL ?? ''}/naskah-lainnya/${n.id}/verifikasi`,
      });
      signedSigners.push({ index: i + 1, qrBuffer });
    }
    const signedBuffer = await this.docxQrInline.injectQrSigners(originalBuffer, signedSigners);

    // Simpan artifact signed terpisah dari lampiran asli.
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/signed`;
    const filename = `signed-${idx}.docx`;
    const result = await this.storage.uploadBuffer(
      signedBuffer,
      filename,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder,
    );
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { signedLampiran: result.key },
    );

    // Advance signing index / transisi ke selesai.
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisiTandaTangan(n, {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    return this.getDetail(id, user);
  }

  async unggahTtdFisik(id: string, file: Express.Multer.File, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'tanda_tangan') {
      throw new BadRequestException('Naskah tidak dalam fase tanda tangan penandatangan.');
    }
    if (n.signOption !== 'ttd_basah') {
      throw new BadRequestException(
        'Unggah TTD fisik hanya untuk opsi Fisik (ttd_basah). Digital gunakan tanda-tangan.',
      );
    }
    const chain = n.penandatanganChain ?? [];
    const N = chain.length;
    if (N === 0) throw new BadRequestException('Tidak ada penandatangan pada naskah ini.');
    const idx = n.signingIndex ?? 1;
    const current = chain[idx - 1];
    if (!current) throw new BadRequestException('Penandatangan aktif tidak ditemukan.');
    const posId = String(user.positionId ?? user.position ?? '');
    const isCurrent =
      (current.persnum != null && Number(current.persnum) === Number(user.persnum)) ||
      (current.positionId != null && current.positionId === posId);
    if (!isCurrent) {
      throw new ForbiddenException('Bukan giliran Anda menandatangani naskah ini.');
    }

    // Simpan artifact upload (naskah hasil ttd basah) — menumpuk signer sebelumnya.
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/signed`;
    const filename = `signed-fisik-${idx}-${file.originalname}`;
    const result = await this.storage.uploadBuffer(file.buffer, filename, file.mimetype, folder);
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { signedLampiran: result.key },
    );

    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisiTandaTangan(n, {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    return this.getDetail(id, user);
  }

  /** Fisik: replace placeholder {{tanda_tangan_i}} → "nama — jabatan" sekali di awal fase signing. */
  private async prepareFisikArtifact(n: NaskahEntity): Promise<void> {
    if (!n.lampiran) return;
    const chain = n.penandatanganChain ?? [];
    if (chain.length === 0) return;
    const data: Record<string, string> = {};
    for (let i = 0; i < chain.length; i++) {
      data[`tanda_tangan_${i + 1}`] = `${chain[i].nama} — ${chain[i].jabatan}`;
    }
    const originalBuffer = await this.storage.getFile(n.lampiran);
    const cleanBuffer = this.docxFiller.fill(originalBuffer, data);
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/signed`;
    const result = await this.storage.uploadBuffer(
      cleanBuffer,
      'signed-fisik-base.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      folder,
    );
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { signedLampiran: result.key },
    );
  }

  private async findNaskah(id: string): Promise<NaskahEntity> {
    const n = await this.naskahRepo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Naskah tidak ditemukan');
    return n;
  }

  /**
   * Validasi nomor manual vs format penomoran jenis.
   * Throw BadRequestException jika tidak match.
   */
  private validateManualNomorFormat(nomor: string, format: string, jenis: string): void {
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
  private async catatVersiNaskah(
    naskahId: string, tahapan: string | null, minioKey: string,
    nama: string, mimetype: string, ukuran: number | null, user: CurrentUser,
  ): Promise<void> {
    const doc = this.dokumenRepo.create({
      id: uuidv4(), naskahId, tipe: 'naskah',
      nama, minioKey, mimetype, ukuran,
      tahapan, status: this.mapStatusUpload(tahapan),
      uploaderNama: user.nama,
      uploaderJabatan: user.positionText ?? null,
      uploaderPersnum: user.persnum,
    });
    await this.dokumenRepo.save(doc);
  }

  private async findDokumen(n: NaskahEntity) {
    const docs: any[] = [];

    // 'naskah' — file naskah asli dari lampiran (MinIO key).
    if (n.lampiran) {
      // Ambil nama file asli dari MinIO key (bagian terakhir setelah '/')
      const fileName = n.lampiran.split('/').pop() || 'naskah.docx';
      docs.push({
        id: n.id, nama: fileName, tipe: 'naskah',
        ukuran: '-', tanggal: n.createdAt.toISOString(), status: 'final',
      });
    }

    // 'naskah_fisik' & 'pendukung' — dari naskah_lainnya_dokumen.
    const dokRows = await this.dokumenRepo.find({ where: { naskahId: n.id }, order: { createdAt: 'ASC' } });
    for (const d of dokRows) {
      docs.push({
        id: d.id, nama: d.nama, tipe: d.tipe,
        ukuran: d.ukuran ? `${d.ukuran}` : '-',
        tanggal: d.createdAt.toISOString(), status: 'final',
      });
    }

    // 'blanko_verbal' — dari blankoRepo.
    const blanko = await this.blankoRepo.find({ where: { naskahId: n.id } });
    for (const b of blanko) {
      docs.push({
        id: b.id, nama: `blanko-${b.nomorVerbal ?? 'verbal'}.docx`, tipe: 'blanko_verbal',
        ukuran: '-', tanggal: b.tanggal ? new Date(b.tanggal).toISOString() : null,
        status: b.status === 'draf' ? 'revisi' : 'final',
      });
    }
    return docs;
  }

  // ---------- Dokumen Pendukung / Naskah Fisik ----------

  async uploadDokumenTambahan(
    id: string,
    tipe: 'naskah_fisik' | 'pendukung',
    file: Express.Multer.File,
  ) {
    const n = await this.findNaskah(id);
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/${tipe}`;
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.originalname}`;
    const result = await this.storage.uploadBuffer(file.buffer, filename, file.mimetype, folder);

    const doc = this.dokumenRepo.create({
      id: uuidv4(),
      naskahId: n.id,
      tipe,
      nama: file.originalname,
      minioKey: result.key,
      mimetype: file.mimetype,
      ukuran: file.size,
    });
    await this.dokumenRepo.save(doc);

    return {
      success: true,
      data: {
        id: doc.id, nama: doc.nama, tipe: doc.tipe,
        ukuran: `${doc.ukuran ?? 0}`,
      },
    };
  }

  async deleteDokumenTambahan(id: string, dokumenId: string) {
    const doc = await this.dokumenRepo.findOne({ where: { id: dokumenId, naskahId: id } });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan');

    // Hapus file dari MinIO
    try { await this.storage.deleteFile(doc.minioKey); } catch { /* abaikan */ }

    await this.dokumenRepo.delete(dokumenId);
    return { success: true, data: { id: dokumenId } };
  }

  async downloadDokumenTambahan(id: string, dokumenId: string) {
    const doc = await this.dokumenRepo.findOne({ where: { id: dokumenId, naskahId: id } });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan');
    const buffer = await this.storage.getFile(doc.minioKey);
    return { buffer, mimetype: doc.mimetype ?? 'application/octet-stream', nama: doc.nama };
  }
}
