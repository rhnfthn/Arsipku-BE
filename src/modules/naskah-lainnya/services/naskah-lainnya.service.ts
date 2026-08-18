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
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';
import { BuatNaskahDto, UpdateNaskahDto, EvaluasiDto, BlankoDto } from '../dto/index.dto';

export interface CurrentUser {
  persnum: number;
  nama: string;
  positionText?: string;
  /** Position ID dari JWT (JwtPayload.position) — dipakai match approval table */
  position?: string;
  positionId?: string;
  positionAbbreviation?: string;
  areaText?: string;
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
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly legalRoleService: LegalRoleService,
  ) {}

  // ---------- List ----------

  async getList(query: { tab?: string; search?: string; jenis?: string; tahapan?: string; page?: number }, user: CurrentUser) {
    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
      .orderBy('n.createdAt', 'DESC');

    if (query.tab === 'mine') {
      // "Naskah Saya" — match via position_id dari dikirim_oleh JSON, fallback ke created_by_position
      const posId = user.positionId ?? user.position;
      qb.andWhere(
        '(JSON_EXTRACT(n.dikirim_oleh, :jsonPath) = :posId OR n.created_by_position = :posText)',
        { jsonPath: '$.position_id', posId, posText: user.positionText ?? '' },
      );
    } else {
      // "Semua" — hanya naskah yang user buat (pemrakarsa).
      // Verifikator/approver tidak melihat naskah di daftar — mereka akses via menu Persetujuan.
      const posId = user.positionId ?? user.position;
      qb.andWhere(
        '(JSON_EXTRACT(n.dikirim_oleh, :jsonPath) = :posId OR n.created_by_position = :posText)',
        { jsonPath: '$.position_id', posId, posText: user.positionText ?? '' },
      );
    }
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

    // Cek apakah user adalah pemrakarsa (match via position_id dari dikirim_oleh)
    const posId = user.positionId ?? user.position;
    const isPemrakarsa = n.dikirimOleh?.position_id === posId || n.createdByPosition === user.positionText;

    // Build available actions, lalu filter berdasarkan role user:
    // - persetujuan: hanya approver waiting yang bisa setuju/tolak/kembalikan
    // - konsep/perlu_perbaikan: hanya pemrakarsa yang bisa kirim
    // - tanda_tangan_*: hanya penandatangan yang bisa tanda-tangan
    let availableActions = await this.workflow.buildAvailableActions((n.tahapan ?? 'konsep') as Tahapan, n.butuhLegal, user);

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

    // Filter aksi tanda-tangan: hanya penandatangan yang bisa tanda tangan
    if (n.tahapan === 'tanda_tangan_pemrakarsa' || n.tahapan === 'tanda_tangan_legal' || n.tahapan === 'tanda_tangan_pejabat') {
      const penandatanganList = n.penandatanganChain?.length
        ? n.penandatanganChain
        : [{ positionId: n.penandatanganPositionId, persnum: n.penandatanganPersnum }];
      const isPenandatangan = penandatanganList.some((p) => {
        const pPosId = p.positionId ? String(p.positionId) : '';
        return pPosId && pPosId === posId;
      });
      if (!isPenandatangan) {
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
        stepper: this.workflow.buildStepper((n.tahapan ?? 'konsep') as Tahapan, n.butuhLegal),
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
      nomor: dto.nomor ?? null,
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
    // Nomor didapat dari docx-reader (extract dari template upload) atau diisi manual via updateDraft.
    // Tidak generate otomatis — naskah-lainnya pakai nomor yang sudah ada di template.
    if (!n.nomor) {
      throw new BadRequestException('Nomor naskah belum diisi. Isi nomor dari template atau manual sebelum kirim.');
    }
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kirim', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    return this.getDetail(id, user);
  }

  // ---------- Persetujuan (antrian) ----------

  async getPersetujuan(user: CurrentUser) {
    // 1. Naskah di tahap persetujuan/perlu_perbaikan di mana user adalah approver waiting
    const approvalNaskahIds = await this.getNaskahIdsForApproverWaiting(user);
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

    // 2. Jika user adalah legal role, tambahkan naskah di tahap legal_drafting dengan butuhLegal=true
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    const posId = String(user.positionId ?? user.position ?? '');
    if (posId && activeLegalIds.includes(posId)) {
      const legalRows = await this.naskahRepo
        .createQueryBuilder('n')
        .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
        .andWhere('n.tahapan = :t', { t: 'legal_drafting' })
        .andWhere('n.butuh_legal = :bl', { bl: true })
        .orderBy('n.createdAt', 'DESC')
        .getMany();
      // Merge, dedupe by id
      const existingIds = new Set(rows.map((r) => r.id));
      for (const r of legalRows) {
        if (!existingIds.has(r.id)) rows.push(r);
      }
    }

    // 3. Naskah di tahap tanda_tangan_* di mana user adalah penandatangan
    if (posId) {
      const ttdRows = await this.naskahRepo
        .createQueryBuilder('n')
        .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
        .andWhere('n.tahapan IN (:...tTahap)', { tTahap: ['tanda_tangan_pemrakarsa', 'tanda_tangan_legal', 'tanda_tangan_pejabat', 'blanko_verbal'] })
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

  /**
   * Ambil daftar naskahId di mana user ini adalah approver dengan status 'waiting'
   * (naskah yang menunggu approval/penandatangan dari user ini).
   */
  private async getNaskahIdsForApproverWaiting(user: CurrentUser): Promise<string[]> {
    const conditions: string[] = [];
    const params: Record<string, any> = { status: 'waiting' };
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
    if (params.nomor) { n.nomor = params.nomor; patch.nomor = params.nomor; }
    if (params.perihal) { n.perihal = params.perihal; patch.perihal = params.perihal; }
    // tanggal adalah bagian PK — skip update di sini (hindari PK change)
    if (params.tanggal) {
      const t = new Date(params.tanggal);
      if (!isNaN(t.getTime())) n.tanggal = t; // update in-memory only
    }
    if (Object.keys(patch).length > 0) {
      await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, patch);
    }
    return { success: true, data: { parameter: params } };
  }

  async getTemplateUrl(jenis: string) {
    const key = `templates/naskah-lainnya/${jenis}.docx`;
    const url = await this.storage.getFileUrl(key, 3600);
    return { success: true, data: url };
  }

  async downloadFile(id: string): Promise<{ buffer: Buffer; mimetype: string }> {
    const n = await this.findNaskah(id);
    if (!n.lampiran) throw new NotFoundException('File naskah belum diunggah');
    try {
      const buffer = await this.storage.getFile(n.lampiran);
      return { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
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
    const next = this.workflow.nextAfterEvaluasi(dto.sesuai);
    n.tahapan = next;
    await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, { tahapan: next });
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
    return this.getDetail(id, user);
  }

  async kirimApprovalLegal(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kirim-approval-legal', {
        aktor: user.nama, jabatan: user.positionText, manager,
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
    // Passphrase/digsig handling dilakukan di luar workflow ini (BSrE integration terpisah).
    // Di sini hanya transisi state — tandai naskah sebagai ditandatangani.
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'tanda-tangan', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    return this.getDetail(id, user);
  }

  private async findNaskah(id: string): Promise<NaskahEntity> {
    const n = await this.naskahRepo.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Naskah tidak ditemukan');
    return n;
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
