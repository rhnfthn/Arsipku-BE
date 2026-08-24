import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../../storage/services/storage.service';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from '../entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from '../entities/naskah-lainnya-dokumen.entity';
import { WorkflowService, Tahapan } from './workflow.service';
import { DocxReaderService } from './docx-reader.service';
import { DocxQrInlineService, SignedSigner } from './docx-qr-inline.service';
import { GeneratePdfLpdService } from '../../generate_pdf/services/generate_pdf_lpd.service';
import { GeneratePdfBlankoVerbalService } from '../../generate_pdf/services/generate_pdf_blanko_verbal.service';
import { SheetPdfData } from '../../generate_pdf/services/sheet-pdf.shared';
import { QRCodeService } from '../../digsig/services/qrcode.service';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';
import { NomorService } from '../../nomor/services/nomor.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { BuatNaskahDto, UpdateNaskahDto, EvaluasiDto, BlankoDto, SheetDataDto } from '../dto/index.dto';
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
    private readonly lpdService: GeneratePdfLpdService,
    private readonly blankoService: GeneratePdfBlankoVerbalService,
    private readonly qrCode: QRCodeService,
    private readonly docxFiller: DocxFillerService,
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly legalRoleService: LegalRoleService,
    private readonly nomorService: NomorService,
    private readonly orgDataService: OrgDataService,
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
    // untuk naskah ini. Berjenjang: hanya urutan terendah yang masih waiting yang
    // berhak setuju/tolak/kembalikan; urutan lebih tinggi tunggu urutan sebelumnya.
    const waitingRows = approval.filter((a) => a.status === 'waiting');
    const minUrutan = waitingRows.length
      ? Math.min(...waitingRows.map((a) => a.urutan))
      : null;
    const userPosId = user.positionId ?? user.position;
    const isCurrentApprover = waitingRows
      .filter((a) => a.urutan === minUrutan)
      .some((a) => (userPosId && a.positionId === userPosId) || (user.nama && a.nama === user.nama));

    // Cek apakah user adalah pemrakarsa (match via identity unik: position_id atau persnum).
    // Jangan match by createdByPosition (jabatan text) — bocor antar user dengan jabatan sama.
    const posId = user.positionId ?? user.position;
    const isPemrakarsa =
      (n.dikirimOleh?.position_id != null && n.dikirimOleh.position_id === posId) ||
      (n.dikirimOleh?.persnum != null && Number(n.dikirimOleh.persnum) === user.persnum);

    // POV approval: legal role hanya lihat approval legal_drafting; pemrakarsa hanya
    // persetujuan. Flat `approval` tetap utuh (dipakai FE untuk logic aksi);
    // hanya `approvalByTahap` (display grup approval) yang difilter per POV.
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    const isLegal = !!posId && activeLegalIds.includes(String(posId));

    // Build available actions, lalu filter berdasarkan role user:
    // - persetujuan: hanya approver waiting yang bisa setuju/tolak/kembalikan
    // - konsep/perlu_perbaikan: hanya pemrakarsa yang bisa kirim
    // - tanda_tangan_*: hanya penandatangan yang bisa tanda-tangan
    const hasWaitingLegalRows = approval.some(
      (a) => a.tahap === 'legal_drafting' && a.status === 'waiting',
    );
    const hasDireksiRows = approval.some(
      (a) => a.tahap === 'persetujuan_direksi' || a.tahap === 'blanko_verbal',
    );
    let availableActions = await this.workflow.buildAvailableActions(
      (n.tahapan ?? 'konsep') as Tahapan, n.butuhLegal, user, hasWaitingLegalRows, hasDireksiRows,
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

    // Filter aksi evaluasi: hanya pemrakarsa yang bisa evaluasi / kembalikan ke legal
    if (n.tahapan === 'evaluasi' && !isPemrakarsa) {
      availableActions = availableActions.filter(
        (a) => a !== 'evaluasi' && a !== 'kembalikan-evaluasi',
      );
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
        approval: approval.map((a) => this.toApprovalRow(a)),
        // Rantai approval dikelompokkan per tahap (fase) agar approval pemrakarsa
        // (persetujuan) dan legal unit (legal_drafting) tidak tercampur. Difilter
        // per POV: legal hanya lihat legal_drafting, pemrakarsa hanya persetujuan.
        approvalByTahap: this.buildApprovalByTahapForPov(approval, isLegal, isPemrakarsa),
        riwayat: riwayat.map((r) => this.toRiwayatRow(r)),
        // Riwayat dikelompokkan per tahap (fase) agar approval pemrakarsa, legal unit,
        // evaluasi, dll tidak tercampur dalam satu list flat.
        riwayatByTahap: this.groupRiwayatByTahap(riwayat),
        stepper: this.workflow.buildStepper(
          (n.tahapan ?? 'konsep') as Tahapan,
          n.butuhLegal,
          this.workflow.effectiveSignerCount(n),
          n.signingIndex,
        ),
        signingIndex: n.signingIndex,
        signerCount: this.workflow.effectiveSignerCount(n),
        signedFileUrl: n.signedLampiran ? `/naskah-lainnya/${n.id}/file` : null,
        catatanLegal: n.catatanLegal ?? null,
        availableActions,
      },
    };
  }

  // ---------- Riwayat (kontrak: GET /:id/riwayat) ----------

  async getRiwayat(id: string) {
    const rows = await this.riwayatRepo.find({ where: { naskahId: id }, order: { tanggal: 'ASC' } });
    return {
      success: true,
      data: rows.map((r) => this.toRiwayatRow(r)),
      // Riwayat dikelompokkan per tahap (fase) agar approval pemrakarsa, legal unit,
      // evaluasi, dll tidak tercampur. `data` (flat) tetap disertakan untuk backward-compat.
      riwayatByTahap: this.groupRiwayatByTahap(rows),
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

  // Kelompokkan riwayat per tahap (fase): { persetujuan: [...], legal_drafting: [...], ... }.
  // Baris tanpa tahap masuk key 'lainnya'.
  private groupRiwayatByTahap(rows: NaskahLainnyaRiwayatEntity[]) {
    const byTahap: Record<string, ReturnType<NaskahLainnyaService['toRiwayatRow']>[]> = {};
    for (const r of rows) {
      const key = r.tahap ?? 'lainnya';
      if (!byTahap[key]) byTahap[key] = [];
      byTahap[key].push(this.toRiwayatRow(r));
    }
    return byTahap;
  }

  // ── Approval (rantai) helpers ──

  private toApprovalRow(a: NaskahLainnyaApprovalEntity) {
    return {
      id: a.id,
      tahap: a.tahap,
      nama: a.nama,
      jabatan: a.jabatan,
      urutan: a.urutan,
      status: a.status,
      catatan: a.catatan ?? undefined,
      tanggal: a.tanggal ? new Date(a.tanggal).toISOString() : null,
    };
  }

  // Kelompokkan rantai approval per tahap (fase): { persetujuan: [...], legal_drafting: [...], ... }.
  // Urutan per fase dipertahankan (sudah ASC by urutan dari query).
  private groupApprovalByTahap(rows: NaskahLainnyaApprovalEntity[]) {
    const byTahap: Record<string, ReturnType<NaskahLainnyaService['toApprovalRow']>[]> = {};
    for (const a of rows) {
      const key = a.tahap ?? 'lainnya';
      if (!byTahap[key]) byTahap[key] = [];
      byTahap[key].push(this.toApprovalRow(a));
    }
    return byTahap;
  }

  // approvalByTahap difilter per POV: legal role hanya lihat approval legal_drafting,
  // pemrakarsa hanya persetujuan. Viewer lain (approver persetujuan, penandatangan, dll)
  // lihat semua tahap. Hanya display yang difilter — flat `approval` tetap utuh.
  private buildApprovalByTahapForPov(
    rows: NaskahLainnyaApprovalEntity[],
    isLegal: boolean,
    isPemrakarsa: boolean,
  ) {
    const byTahap = this.groupApprovalByTahap(rows);
    if (isLegal) return { legal_drafting: byTahap['legal_drafting'] ?? [] };
    if (isPemrakarsa) return { persetujuan: byTahap['persetujuan'] ?? [] };
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
    // tanggal bagian PK (id, tanggal). Simpan tanggal ASLI (DB) untuk WHERE — bila
    // n.tanggal dimutasi ke tanggal baru lalu dipakai di WHERE, row tidak ditemukan
    // (0 row ter-update) & patch termasuk penandatanganChain tidak tersimpan. Tanggal
    // baru di-update via patch (kolom PK), child table hanya FK ke naskah_id → aman.
    const originalTanggal = n.tanggal as any;
    const patch: Partial<NaskahEntity> = {};
    if (dto.perihal !== undefined) { n.perihal = dto.perihal; patch.perihal = dto.perihal; }
    // Nomor: abaikan literal placeholder {{nomor}} (sentinel "belum di-generate" dari
    // pre-fill docx template) — treat sebagai kosong → null, agar kirim auto-generate.
    // Tanpa ini, placeholder tersimpan sebagai nomor & memblok kirim (validateManualNomorFormat).
    if (dto.nomor !== undefined) {
      const cleanNomor = /{{\s*nomor\s*}}/i.test(dto.nomor) ? null : dto.nomor;
      n.nomor = cleanNomor as any; patch.nomor = cleanNomor as any;
    }
    if (dto.tanggal !== undefined) {
      const t = new Date(dto.tanggal);
      const valid = !isNaN(t.getTime());
      n.tanggal = valid ? t : new Date();
      patch.tanggal = n.tanggal; // update kolom PK tanggal ke nilai baru
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
      await this.naskahRepo.update({ id: n.id, tanggal: originalTanggal }, patch);
    }
    return this.getDetail(id, { persnum: 0, nama: '' });
  }

  async kirim(id: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if ((n.tahapan ?? 'konsep') !== 'konsep' && n.tahapan !== 'perlu_perbaikan') {
      throw new BadRequestException('Hanya naskah konsep / perlu perbaikan yang bisa dikirim');
    }
    // Validasi penandatangan: Digital (qr_only) butuh minimal 1 penandatangan.
    const N = this.workflow.effectiveSignerCount(n);
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
      // ── Validasi nomor manual early (TANPA counter naik, TANPA fill docx) ──
      // Generasi auto pindah ke tahap penandatanganan (lihat ensureNomorFinal).
      // Nomor manual divalidasi di kirim supaya pemrakarsa dapat feedback sebelum
      // approval cycle. Counter TIDAK naik di kirim — nomor final baru di-signing.
      const nomorManual =
        n.nomor && !/{{\s*nomor\s*}}/i.test(n.nomor) ? n.nomor : null;
      if (nomorManual) {
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
        this.validateManualNomorFormat(nomorManual, format, n.jenis);
        const clash = await manager
          .getRepository(NaskahEntity)
          .createQueryBuilder('n')
          .where('n.nomor = :nomor', { nomor: nomorManual })
          .andWhere('n.id != :id', { id: n.id })
          .getCount();
        if (clash > 0) {
          throw new BadRequestException(`Nomor "${nomorManual}" sudah digunakan naskah lain.`);
        }
        // keep n.nomor manual apa adanya. No fill, no counter.
      }

      // ── Guard: docx wajib ber-placeholder {{nomor}} (read-only, TIDAK di-fill) ──
      // Fill {{nomor}} pindah ke tanda_tangan. Validasi di kirim supaya template
      // buruk ditolak sebelum approval cycle terbuang. Revisi (perlu_perbaikan)
      // di-toleransi (docx mungkin sudah berisi nomor dari siklus kode lama).
      if (n.lampiran) {
        let text: string;
        try {
          text = this.docxReader.extractText(await this.storage.getFile(n.lampiran));
        } catch (e) {
          throw new BadRequestException(
            'Gagal membaca file docx lampiran. Periksa file tidak corrupt.',
          );
        }
        if (!/{{\s*nomor\s*}}/i.test(text) && (n.tahapan ?? 'konsep') === 'konsep') {
          throw new BadRequestException(
            'Docx harus dari template sistem (berisi placeholder {{nomor}}). Upload template yang benar.',
          );
        }
        // placeholder present OR revisi → docx dibiarkan apa adanya, fill di signing.
      }

      // ── Refresh snapshot konteks pemrakarsa (untuk generasi nomor di signing) ──
      // ponytail: di signing, current user = signer/evaluator (bukan pemrakarsa), jadi
      // scope nomor (company/area/abbreviation) tidak bisa ambil dari user aktif. Snapshot
      // di-refresh di kirim (user = pemrakarsa; guard di atas sudah validasi field ada)
      // dan disimpan di dikirimOleh — ensureNomorFinal baca dari sana di tanda_tangan.
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
        .update({ id: n.id, tanggal: n.tanggal as any }, { dikirimOleh: n.dikirimOleh });

      // ── Lanjut workflow kirim ──
      await this.workflow.transisi(n, 'kirim', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });

    return this.getDetail(id, user);
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
    const filter = (validFilter.includes(status as string) ? status : 'menunggu') as
      'semua' | 'menunggu' | 'disetujui' | 'ditolak';

    const rows: NaskahEntity[] = [];
    const seen = new Set<string>();
    const push = (r: NaskahEntity) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } };

    // 1. Menunggu (default & termasuk 'semua') — persetujuan/perlu_perbaikan
    //    (approver waiting, berjenjang) + persetujuan_direksi/blanko_verbal (paraf
    //    direksi parallel, urutan=1 jadi lolos gate berjenjang MIN di helper) +
    //    tanda_tangan/blanko_verbal (penandatangan). blanko_verbal di part 1 & part 2
    //    di-dedupe oleh `seen` (push) — BOD paraf-er lewat sini, penandatangan lewat part 2.
    if (filter === 'menunggu' || filter === 'semua') {
      const approvalNaskahIds = await this.getNaskahIdsForApproverStatus(user, 'waiting');
      if (approvalNaskahIds.length > 0) {
        const r1 = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
          .andWhere('n.tahapan IN (:...t)', { t: ['persetujuan', 'perlu_perbaikan', 'persetujuan_direksi', 'blanko_verbal'] })
          .andWhere('n.id IN (:...ids)', { ids: approvalNaskahIds })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        r1.forEach(push);
      }
      const posId = String(user.positionId ?? user.position ?? '');
      if (posId) {
        const ttdRows = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
          .andWhere('n.tahapan = :tTandaTangan', { tTandaTangan: 'tanda_tangan' })
          .andWhere('(JSON_CONTAINS(n.penandatangan_chain, JSON_OBJECT(\'positionId\', :posId)) OR n.penandatangan_position_id = :posIdStr)', { posId, posIdStr: posId })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        // Hanya naskah di mana user adalah penandatangan AKTIF (signingIndex menunjuk
        // ke posisi user di chain). Naskah yang SUDAH ditandatangani user (signingIndex
        // lewat posisi user) tidak boleh muncul di "Menunggu".
        ttdRows.filter((n) => this.isCurrentSigner(n, posId)).forEach(push);
      }
    }

    // 2. Disetujui / Ditolak (termasuk 'semua' → keduanya): riwayat approval user
    //    (status setuju/tolak), tahapan apa pun.
    if (filter === 'disetujui' || filter === 'ditolak' || filter === 'semua') {
      const approvalStatuses = filter === 'semua'
        ? ['setuju', 'tolak']
        : [filter === 'disetujui' ? 'setuju' : 'tolak'];
      const ids: string[] = [];
      for (const s of approvalStatuses) ids.push(...(await this.getNaskahIdsForApproverStatus(user, s)));
      if (ids.length > 0) {
        const r2 = await this.naskahRepo
          .createQueryBuilder('n')
          .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
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
          .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
          .andWhere('n.tahapan = :tSelesai', { tSelesai: 'selesai' })
          .andWhere('(JSON_CONTAINS(n.penandatangan_chain, JSON_OBJECT(\'positionId\', :posId)) OR n.penandatangan_position_id = :posIdStr)', { posId, posIdStr: posId })
          .orderBy('n.createdAt', 'DESC')
          .getMany();
        ttdDone.forEach(push);
      }
    }

    // 'semua' mencampur beberapa himpunan → urut ulang desc. Filter tunggal sudah DESC.
    if (filter === 'semua') {
      rows.sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt ?? 0).getTime();
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt ?? 0).getTime();
        return tb - ta;
      });
    }

    return { success: true, data: rows.map((r) => this.toListItem(r)) };
  }

  // ---------- Legal Drafting (antrian khusus legal role) ----------

  // Status persetujuan legal drafting (filter di halaman Legal Drafting):
  //  - semua: semua naskah legal_drafting (butuh legal) + blanko_verbal, tanpa
  //    sub-filter status (campur belum-dikirim/menunggu/revisi/sudah-dikerjakan).
  //  - belum-dikirim: legal_drafting tanpa baris approval (belum pernah kirim approval legal).
  //  - menunggu: sudah kirim approval, ada baris waiting (di tangan approver).
  //  - revisi: ada baris rejected, tidak ada waiting (ditolak approver → balik ke
  //    drafter legal untuk direvisi & kirim ulang).
  //  - aksi-saya: naskah yang sudah user ini lakukan aksi legal (mulai-legal /
  //    kirim-approval-legal / kembalikan-legal / kirim-approval-blanko) — terlepas
  //    tahapan sekarang (bisa sudah lanjut evaluasi/tanda tangan/selesai).
  async getLegalDrafting(user: CurrentUser, status: string = 'belum-dikirim') {
    const activeLegalIds = await this.legalRoleService.getActivePositionIds();
    const posId = String(user.positionId ?? user.position ?? '');
    if (!posId || !activeLegalIds.includes(posId)) {
      throw new ForbiddenException('Anda bukan legal role');
    }
    const validStatus = ['semua', 'belum-dikirim', 'menunggu', 'revisi', 'aksi-saya'];
    const st = validStatus.includes(status) ? status : 'belum-dikirim';

    const qb = this.naskahRepo
      .createQueryBuilder('n')
      .where('n.jenis IN (:...jenis)', { jenis: ['PER', 'KEP', 'INS', 'PKS', 'UND', 'BA'] })
      .orderBy('n.createdAt', 'DESC');

    if (st === 'aksi-saya') {
      // Riwayat aksi legal oleh user ini (match by aktor = nama — satu-satunya
      // identifier di riwayat, sama pola dgn approval nama match). Mencakup naskah
      // yang sudah lanjut ke evaluasi/tanda tangan/selesai (statusLegal sudah_dikerjakan).
      qb.andWhere(
        'EXISTS (SELECT 1 FROM naskah_lainnya_riwayat r WHERE r.naskah_id = n.id AND r.aktor = :aktor AND r.aksi IN (:...aksiSaya))',
        { aktor: user.nama, aksiSaya: ['mulai-legal', 'kirim-approval-legal', 'kembalikan-legal', 'kirim-approval-blanko'] },
      );
    } else {
      // Base: semua naskah yang masih dalam alur legal — legal_drafting (butuh
      // legal), persetujuan_direksi, dan blanko_verbal. Sub-filter statusLegal
      // (belum_dikirim/menunggu_persetujuan/revisi) diterapkan client-side di FE
      // berdasarkan statusLegal per-row, BUKAN server-side, karena clause
      // EXISTS/NOT EXISTS baris legal_drafting tidak relevan untuk tahap
      // persetujuan_direksi/blanko_verbal (mereka sudah punya baris legal_drafting
      // verified dari tahap sebelumnya).
      qb.andWhere(
        '((n.tahapan = :ld AND n.butuh_legal = :bl) OR (n.tahapan = :pd) OR (n.tahapan = :bv))',
        { ld: 'legal_drafting', bl: true, pd: 'persetujuan_direksi', bv: 'blanko_verbal' },
      );
    }

    const rows = await qb.getMany();
    // statusLegal per-row (badge kolom Status — dibutuhkan terutama untuk filter
    // 'semua' yang mencampur sub-status). Batch-query baris legal_drafting approval
    // + aksi riwayat TERAKHIR per naskah (sinyal 'revisi' untuk kembalikan-evaluasi).
    const ids = rows.map((r) => r.id);
    // Batch-query baris approval untuk legal_drafting, persetujuan_direksi, dan
    // blanko_verbal — supaya sub-status per tahap akurat (badge kolom Status).
    const apprRows = ids.length
      ? (await this.approvalRepo.find({
          where: {
            naskahId: In(ids),
            tahap: In(['legal_drafting', 'persetujuan_direksi', 'blanko_verbal'] as any),
          },
          select: ['naskahId', 'tahap', 'status'] as any,
        })) ?? []
      : [];
    const statusByNaskah = new Map<string, string[]>();
    const pdStatusByNaskah = new Map<string, string[]>();
    const bvStatusByNaskah = new Map<string, string[]>();
    for (const a of apprRows) {
      const tahap = String((a as any).tahap ?? '');
      const map = tahap === 'persetujuan_direksi' ? pdStatusByNaskah
        : tahap === 'blanko_verbal' ? bvStatusByNaskah : statusByNaskah;
      const arr = map.get(a.naskahId) ?? [];
      arr.push(a.status as string);
      map.set(a.naskahId, arr);
    }
    // Aksi riwayat terbaru per naskah (order DESC → kemunculan pertama per id = terbaru).
    const latestAksiByNaskah = new Map<string, string>();
    if (ids.length) {
      const rws = (await this.riwayatRepo.find({
        where: { naskahId: In(ids) as any },
        order: { createdAt: 'DESC' as any },
        select: ['naskahId', 'aksi'] as any,
      })) ?? [];
      for (const rw of rws) {
        if (!latestAksiByNaskah.has(rw.naskahId)) latestAksiByNaskah.set(rw.naskahId, rw.aksi);
      }
    }
    return {
      success: true,
      data: rows.map((r) => ({
        ...this.toListItem(r),
        statusLegal: this.computeStatusLegal(
          String(r.tahapan ?? 'konsep'),
          statusByNaskah.get(r.id) ?? [],
          latestAksiByNaskah.get(r.id),
          pdStatusByNaskah.get(r.id) ?? [],
          bvStatusByNaskah.get(r.id) ?? [],
        ),
      })),
    };
  }

  // Sub-status legal per naskah (badge kolom Status di halaman Legal Drafting).
  //  - persetujuan_direksi: legal sudah kirim lembar, menunggu paraf direksi
  //    → menunggu_persetujuan (bila ada waiting), kalau kosong fallback persetujuan_direksi.
  //  - blanko_verbal: belum kirim blanko (tanpa baris BOD) → belum_dikirim;
  //    ada waiting → menunggu_persetujuan; semua verified → sudah_dikerjakan (siap lanjut).
  //  - tahapan lain (evaluasi/tanda tangan/selesai) → sudah_dikerjakan.
  //  - legal_drafting: waiting → menunggu_persetujuan; rejected (no waiting) → revisi;
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
      return pdStatuses.includes('waiting') ? 'menunggu_persetujuan' : 'belum_dikirim';
    }
    if (tahapan === 'blanko_verbal') {
      if (bvStatuses.includes('waiting')) return 'menunggu_persetujuan';
      if (bvStatuses.length > 0 && bvStatuses.every((s) => s === 'verified')) return 'sudah_dikerjakan';
      return 'belum_dikirim';
    }
    if (tahapan !== 'legal_drafting') return 'sudah_dikerjakan';
    if (statuses.includes('waiting')) return 'menunggu_persetujuan';
    if (statuses.includes('rejected')) return 'revisi';
    if (statuses.length > 0) return 'sudah_dikerjakan';
    // tanpa baris legal_drafting: dikembalikan dari evaluasi oleh pemrakarsa → revisi.
    if (latestAksi === 'kembalikan-evaluasi') return 'revisi';
    return 'belum_dikirim';
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
    const qb = this.approvalRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.naskah_id', 'naskahId')
      .where(`(${conditions.join(' OR ')})`)
      .andWhere('a.status = :status');
    // Berjenjang: untuk antrian 'menunggu', hanya approver pada urutan terendah
    // yang masih waiting yang melihat naskah — urutan lebih tinggi tunggu giliran.
    if (status === 'waiting') {
      qb.andWhere(
        'a.urutan = (SELECT MIN(a2.urutan) FROM naskah_lainnya_approval a2 WHERE a2.naskah_id = a.naskah_id AND a2.status = \'waiting\')',
      );
    }
    const rows = await qb.setParameters(params).getRawMany<{ naskahId: string }>();
    return rows.map((r) => r.naskahId);
  }

  // ---------- Upload & Template ----------

  async uploadDokumen(id: string, file: Express.Multer.File, user: CurrentUser) {
    const n = await this.findNaskah(id);
    // tanggal bagian PK — simpan tanggal ASLI (DB) untuk WHERE. Mutasi in-memory
    // n.tanggal (dari params.tanggal) TIDAK boleh ikut ke WHERE, kalau tidak row
    // tidak ditemukan & lampiran/docx tidak tersimpan.
    const originalTanggal = n.tanggal as any;
    const params = await this.docxReader.readParameters(file.buffer);
    const patch: Partial<NaskahEntity> = {};
    if (params.perihal) { n.perihal = params.perihal; patch.perihal = params.perihal; }
    // tanggal adalah bagian PK — skip update di sini (hindari PK change)
    if (params.tanggal) {
      const t = new Date(params.tanggal);
      if (!isNaN(t.getTime())) n.tanggal = t; // update in-memory only
    }
    // Nama file kanonik — rumus identik dengan FE (utils/naskah-file-name.ts)
    // agar display/download di semua halaman konsisten dengan object storage.
    const namaFile = this.buildNaskahFileName(n.perihal, n.jenis, n.id);
    // Struktur direktori: naskah-lainnya/{jenis}/{id}/naskah/{timestamp}-{nama-kanonik}.docx
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/naskah`;
    const filename = `${Date.now()}-${namaFile}`;
    const result = await this.storage.uploadBuffer(file.buffer, filename, file.mimetype, folder);
    patch.lampiran = result.key; // simpan MinIO key agar bisa di-fetch ulang saat buka draft
    await this.naskahRepo.update({ id: n.id, tanggal: originalTanggal }, patch);
    await this.catatVersiNaskah(
      n.id, n.tahapan, result.key, namaFile, file.mimetype, file.size, user,
    );
    return { success: true, data: { parameter: params } };
  }

  /** Nama file naskah kanonik — identik dengan FE utils/naskah-file-name.ts. */
  private buildNaskahFileName(perihal: string | null, jenis: string | null, naskahId: string): string {
    const slug = (s: string | null) => {
      const v = String(s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
      return v || 'naskah';
    };
    const base = slug(perihal || jenis || 'naskah');
    const suffix = String(naskahId ?? '').slice(0, 8) || 'draft';
    return `${base}-${suffix}.docx`;
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
    // Hapus semua MinIO key versi naskah (lampiran, signedLampiran, baris history) + child tables.
    const versiRows = await this.dokumenRepo.find({ where: { naskahId: id, tipe: 'naskah' } });
    const keys = new Set<string>();
    if (n.lampiran) keys.add(n.lampiran);
    if (n.signedLampiran) keys.add(n.signedLampiran);
    for (const v of versiRows) if (v.minioKey) keys.add(v.minioKey);
    for (const k of keys) {
      try { await this.storage.deleteFile(k); } catch { /* abaikan — file mungkin sudah tidak ada */ }
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

    const prevTahap = n.tahapan as Tahapan;
    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(n, rows, approvalId, aksi, {
        catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      // Update via manager.update() — entity di-load di luar transaction.
      // !butuhLegal: persetujuan selesai → tanda_tangan langsung (skip evaluasi), jadi
      // aksiApproval bisa menghasilkan tanda_tangan/selesai — set signingIndex &
      // prep fisik (ttd_basah) seperti transisi/evaluasi.
      const patch: Partial<NaskahEntity> = { tahapan: newTahap };
      if (newTahap === 'tanda_tangan' && prevTahap !== 'tanda_tangan') patch.signingIndex = 1;
      if (newTahap === 'selesai') patch.signingIndex = null;
      if (patch.signingIndex !== undefined) n.signingIndex = patch.signingIndex as number | null;
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, patch);
    });
    if (n.tahapan === 'tanda_tangan' && n.signOption === 'ttd_basah') {
      await this.prepareFisikArtifact(n, user);
    }
    return this.getDetail(id, user);
  }

  async evaluasi(id: string, dto: EvaluasiDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const N = this.workflow.effectiveSignerCount(n);
    const next = this.workflow.resolveNext('evaluasi', dto.sesuai ? 'setuju' : 'tolak', n.butuhLegal, 1, N);
    const patch: Partial<NaskahEntity> = { tahapan: next };
    if (next === 'tanda_tangan') patch.signingIndex = 1;
    n.tahapan = next;
    if (patch.signingIndex !== undefined) n.signingIndex = 1;
    await this.naskahRepo.update({ id: n.id, tanggal: n.tanggal as any }, patch);
    if (next === 'tanda_tangan' && n.signOption === 'ttd_basah') {
      await this.prepareFisikArtifact(n, user);
    }
    return this.getDetail(id, user);
  }

  // Pemrakarsa mengembalikan naskah dari evaluasi ke legal_drafting agar drafter legal
  // merevisi. Alasan (catatan) wajib → dicatat ke riwayat (aksi='kembalikan-evaluasi')
  // & ditampilkan ke drafter legal di halaman legal drafting. Baris approval legal lama
  // (semua verified) dihapus — drafter kirim ulang approval (buatApprovalLegalDrafting
  // idempotent seed baru). Hanya untuk naskah butuh legal.
  async kembalikanEvaluasi(id: string, catatan: string | undefined, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'evaluasi') {
      throw new BadRequestException('Naskah tidak dalam fase evaluasi.');
    }
    if (!n.butuhLegal) {
      throw new BadRequestException('Kembalikan ke legal hanya untuk naskah yang butuh legal drafting.');
    }
    if (!catatan?.trim()) {
      throw new BadRequestException('Alasan wajib diisi.');
    }
    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisi(n, 'kembalikan-evaluasi', {
        aktor: user.nama, jabatan: user.positionText, catatan, manager,
      });
      await manager.delete(NaskahLainnyaApprovalEntity, { naskahId: n.id, tahap: 'legal_drafting' });
    });
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
      await this.prepareFisikArtifact(n, user);
    }
    return this.getDetail(id, user);
  }

  async kirimApprovalLegal(
    id: string,
    approval: { positionId?: string | null; nama: string; jabatan: string }[],
    user: CurrentUser,
    catatan?: string,
    catatanLegal?: string,
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
        aktor: user.nama, jabatan: user.positionText, catatan,
      });
      // Catatan legal (TinyMCE) persist ke kolom naskah (item #4).
      if (catatanLegal !== undefined) {
        await manager.update(
          NaskahEntity,
          { id: n.id, tanggal: n.tanggal as any },
          { catatanLegal: catatanLegal || null },
        );
      }
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

    // ── Generate nomor final di signing (pindah dari kirim) ──
    // Idempotent: signer ke-2 dst. menemukan n.nomor sudah ter-set → no-op.
    // ponytail: konteks generasi dari dikirimOleh (pemrakarsa), bukan current user.
    const nomor = await this.ensureNomorFinal(n);

    // Generate QR untuk signer 1..idx (re-render dari lampiran asli tiap step — idempotent).
    const originalBuffer = await this.storage.getFile(n.lampiran);
    const signedSigners: SignedSigner[] = [];
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
      signedSigners.push({ index: i + 1, qrBuffer, nama: s.nama });
    }
    // Merge { nomor } ke pass-1 fill → {{nomor}} ter-fill sekalian dengan {{tanda_tangan_*}}
    // (hindari 2 pass docxtemplater). Aman bila {{nomor}} absen (in-flight kode lama).
    const signedBuffer = await this.docxQrInline.injectQrSigners(originalBuffer, signedSigners, { nomor });

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
    await this.upsertDittdRow(n.id, result.key, user);

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

    // Safety net: pastikan nomor final ter-generate & ter-persist (idempotent).
    // Normalnya prepareFisikArtifact sudah generate di awal fase tanda_tangan;
    // call ini no-op bila nomor sudah ada, dan menangani edge bila somehow belum.
    await this.ensureNomorFinal(n);

    // Simpan artifact upload (naskah hasil ttd basah) — menumpuk signer sebelumnya.
    const folder = `naskah-lainnya/${n.jenis}/${n.id}/signed`;
    const filename = `signed-fisik-${idx}-${file.originalname}`;
    const result = await this.storage.uploadBuffer(file.buffer, filename, file.mimetype, folder);
    await this.naskahRepo.update(
      { id: n.id, tanggal: n.tanggal as any },
      { signedLampiran: result.key },
    );
    await this.upsertDittdRow(n.id, result.key, user);

    await this.dataSource.transaction(async (manager) => {
      await this.workflow.transisiTandaTangan(n, {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
    });
    return this.getDetail(id, user);
  }

  /** Fisik: replace placeholder {{tanda_tangan_i}} → "nama — jabatan" + {{nomor}} → nomor final, sekali di awal fase signing. */
  private async prepareFisikArtifact(n: NaskahEntity, user: CurrentUser): Promise<void> {
    if (!n.lampiran) return;
    const chain = n.penandatanganChain ?? [];
    if (chain.length === 0) return;
    // ── Generate nomor final di signing (pindah dari kirim) ──
    // Idempotent. Konteks generasi dari dikirimOleh (pemrakarsa), bukan current user
    // (di sini user = evaluator/legal yang trigger masuk tanda_tangan).
    const nomor = await this.ensureNomorFinal(n);
    const data: Record<string, string> = { nomor };
    for (let i = 0; i < chain.length; i++) {
      data[`tanda_tangan_${i + 1}`] = `${chain[i].nama} — ${chain[i].jabatan}`;
      // Slot nama {{nama_penandatangan_N}} fitur qr_only (nama di bawah QR). Fisik
      // tidak ada QR — nama tetap di slot QR 'nama — jabatan' di atas. Kosongkan
      // slot nama agar tidak redundan / tidak menyisakan placeholder mentah.
      data[`nama_penandatangan_${i + 1}`] = '';
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
    await this.upsertDittdRow(n.id, result.key, user);
  }

  /**
   * Pastikan n.nomor final sebelum render docx di tahap penandatanganan.
   * - Nomor manual sudah set (real, bukan placeholder) → pakai apa adanya (divalidasi di kirim).
   * - null/placeholder → auto-generate via nomorService (counter naik) dalam tx + persist.
   * Idempotent: aman dipanggil ulang (signer ke-2 dst. menemukan n.nomor sudah ter-set).
   *
   * ponytail: konteks generasi (company/area/abbreviation/dst) diambil dari snapshot
   * dikirimOleh (pemrakarsa), bukan current user — di signing, user aktif adalah
   * signer/evaluator (bukan pemrakarsa), jadi scope nomor harus ikut pemrakarsa.
   */
  private async ensureNomorFinal(n: NaskahEntity): Promise<string> {
    const existing = n.nomor && !/{{\s*nomor\s*}}/i.test(n.nomor) ? n.nomor : null;
    if (existing) return existing;

    const ctx = n.dikirimOleh;
    if (!ctx?.company || !ctx.area || !ctx.abbreviation) {
      throw new BadRequestException(
        'Konteks pemrakarsa (company/area/abbreviation) tidak lengkap. Hubungi admin — naskah perlu di-kirim ulang.',
      );
    }
    const tanggalNaskah = n.tanggal instanceof Date ? n.tanggal : new Date(n.tanggal as any);
    if (!tanggalNaskah || isNaN(tanggalNaskah.getTime())) {
      throw new BadRequestException('Tanggal naskah wajib diisi sebelum penandatangan.');
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
  /** Upsert tepat satu row status='dittd' per naskah (node Final tertanda tangan). */
  private async upsertDittdRow(naskahId: string, minioKey: string, user: CurrentUser): Promise<void> {
    const existing = await this.dokumenRepo.findOne({
      where: { naskahId, tipe: 'naskah', status: 'dittd' as any },
    });
    const nama = minioKey.split('/').pop() ?? 'signed.docx';
    if (existing) {
      await this.dokumenRepo.update(existing.id, {
        minioKey, nama,
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
      });
    } else {
      const doc = this.dokumenRepo.create({
        id: uuidv4(), naskahId, tipe: 'naskah', status: 'dittd',
        nama, minioKey, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ukuran: null, tahapan: 'selesai',
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
      });
      await this.dokumenRepo.save(doc);
    }
  }

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

    // 'naskah' — riwayat versi naskah dari baris dokumen (urut terbaru di atas).
    const versiRows = await this.dokumenRepo.find({
      where: { naskahId: n.id, tipe: 'naskah' },
      order: { createdAt: 'DESC' },
    });
    if (versiRows.length > 0) {
      // Revisi legal: bila ada beberapa versi legal_drafting (tolak → drafter revisi &
      // unggah ulang), hanya tampilkan versi TERAKHIR (final). Versi legal_drafting
      // sebelumnya disembunyikan dari timeline — baris DB tetap dipertahankan.
      let legalDraftingShown = false;
      for (const v of versiRows) {
        if ((v.tahapan ?? '') === 'legal_drafting') {
          if (legalDraftingShown) continue;
          legalDraftingShown = true;
        }
        docs.push({
          id: v.id,
          nama: v.nama,
          tipe: 'naskah',
          ukuran: v.ukuran ? `${v.ukuran}` : '-',
          tanggal: v.createdAt.toISOString(),
          status: (v.status as 'terbaca' | 'final' | 'revisi' | 'belum_diunggah' | 'draf' | 'dittd') ?? 'final',
          uploaderNama: v.uploaderNama ?? undefined,
          uploaderJabatan: v.uploaderJabatan ?? undefined,
          fase: v.tahapan ?? undefined,
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
      where: { naskahId: n.id, tipe: In(['naskah_fisik', 'pendukung', 'lembar_persetujuan_direksi_pdf', 'blanko_verbal_pdf']) },
      order: { createdAt: 'ASC' },
    });
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

    if (doc.tipe === 'naskah') {
      throw new BadRequestException('Riwayat naskah tidak dapat dihapus per versi');
    }

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

  // ---------- Lembar Persetujuan Direksi ----------

  async previewLembarPersetujuanDireksi(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if ((n.tahapan !== 'evaluasi' && n.tahapan !== 'persetujuan_direksi') || !n.butuhLegal) {
      throw new BadRequestException('Preview lembar persetujuan direksi hanya untuk naskah evaluasi/persetujuan direksi yang butuh legal.');
    }
    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    // Saat PD, preview nunjukin paraf parsial (sama dgn file). rowId '' sentinel →
    // computeVerifiedIndices hanya kumpulkan baris status='verified' (id '' gak match).
    let verifiedIndices = new Set<number>();
    if (n.tahapan === 'persetujuan_direksi') {
      const rows = await this.approvalRepo.find({ where: { naskahId: id } });
      verifiedIndices = this.computeVerifiedIndices(rows, '', 'persetujuan_direksi', directors);
    }
    const { pdfUrl } = await this.renderSheetPdf(
      n.id, dto, `lembar-persetujuan-direksi-${n.id}.pdf`, 'lembar_persetujuan_direksi_pdf',
      directors, n.jenis as string, user, verifiedIndices, false,
    );
    return { success: true, data: { pdfUrl } };
  }

  async kirimLembarPersetujuanDireksi(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    const fromEvaluasi = n.tahapan === 'evaluasi';
    if (!fromEvaluasi && n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException('Kirim lembar persetujuan direksi hanya untuk naskah evaluasi atau persetujuan direksi.');
    }
    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    // Kirim hanya men-seed baris paraf direksi; file LPD baru di-render & disimpan
    // saat paraf terakhir (semua direksi verified → blanko_verbal), bukan saat kirim.
    await this.dataSource.transaction(async (manager) => {
      // Idempotent: hapus baris PD lama (re-kirim / recovery) lalu seed ulang.
      await manager.delete(NaskahLainnyaApprovalEntity, { naskahId: n.id, tahap: 'persetujuan_direksi' });
      await this.seedBodApprovals(manager, n.id, directors, 'persetujuan_direksi');
      // Dari evaluasi → transisi ke persetujuan_direksi. Dari PD (recovery) → tetap
      // di PD (naskah sudah di PD, hanya belum punya baris BOD).
      if (fromEvaluasi) {
        await this.workflow.transisi(n, 'setuju', {
          aktor: user.nama, jabatan: user.positionText, manager,
        });
        await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: n.tahapan });
      }
    });
    return this.getDetail(id, user);
  }

  async parafLembarPersetujuanDireksi(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException('Paraf lembar persetujuan direksi hanya untuk naskah tahap persetujuan direksi.');
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const row = this.findUserWaitingRow(rows, 'persetujuan_direksi', user);
    if (!row) throw new ForbiddenException('Anda tidak memiliki baris paraf waiting untuk naskah ini.');

    let newTahap = n.tahapan as Tahapan;
    await this.dataSource.transaction(async (manager) => {
      newTahap = await this.workflow.applyApproval(n, rows, row.id, 'setuju', {
        catatan: dto.catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: newTahap });
    });

    // ponytail: re-render LPD tiap paraf (paraf parsial terakumulasi terlihat di file),
    // konsisten dgn parafBlankoVerbal. saveSheetDokumen upsert row yg sama (overwrite).
    // Orphan Minio object per re-render — issue lama (blanko verbal juga), gak di-scope.
    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    const verifiedIndices = this.computeVerifiedIndices(rows, row.id, 'persetujuan_direksi', directors);
    await this.renderSheetPdf(
      n.id, dto, `lembar-persetujuan-direksi-${n.id}.pdf`, 'lembar_persetujuan_direksi_pdf',
      directors, n.jenis as string, user, verifiedIndices,
    );
    return this.getDetail(id, user);
  }

  async tolakLembarPersetujuanDireksi(id: string, catatan: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'persetujuan_direksi') {
      throw new BadRequestException('Tolak lembar persetujuan direksi hanya untuk naskah tahap persetujuan direksi.');
    }
    if (!catatan?.trim()) throw new BadRequestException('Alasan wajib diisi saat menolak.');
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const row = this.findUserWaitingRow(rows, 'persetujuan_direksi', user);
    if (!row) throw new ForbiddenException('Anda tidak memiliki baris paraf waiting untuk naskah ini.');

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(n, rows, row.id, 'tolak', {
        catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: newTahap });
    });
    return this.getDetail(id, user);
  }

  // ---------- Blanko Verbal ----------

  async previewBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException('Preview blanko verbal hanya untuk naskah tahap blanko verbal.');
    }
    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    const { pdfUrl } = await this.renderSheetPdf(
      n.id, dto, `blanko-verbal-${n.id}.pdf`, 'blanko_verbal_pdf',
      directors, n.jenis as string, user, new Set(),
    );
    return { success: true, data: { pdfUrl } };
  }

  async kirimBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException('Kirim blanko verbal hanya untuk naskah tahap blanko verbal.');
    }
    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    await this.renderSheetPdf(
      n.id, dto, `blanko-verbal-${n.id}.pdf`, 'blanko_verbal_pdf',
      directors, n.jenis as string, user, new Set(),
    );
    const existingBvRows = await this.approvalRepo.find({ where: { naskahId: n.id, tahap: 'blanko_verbal' } });
    await this.dataSource.transaction(async (manager) => {
      if (existingBvRows.length === 0) {
        await this.seedBodApprovals(manager, n.id, directors, 'blanko_verbal');
      }
      await this.workflow.transisi(n, 'kirim-blanko', {
        aktor: user.nama, jabatan: user.positionText, manager,
      });
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: n.tahapan });
    });
    return this.getDetail(id, user);
  }

  async parafBlankoVerbal(id: string, dto: SheetDataDto, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException('Paraf blanko verbal hanya untuk naskah tahap blanko verbal.');
    }
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const row = this.findUserWaitingRow(rows, 'blanko_verbal', user);
    if (!row) throw new ForbiddenException('Anda tidak memiliki baris paraf waiting untuk naskah ini.');

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(n, rows, row.id, 'setuju', {
        catatan: dto.catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: newTahap });
    });

    const directors = await this.getBodDirectors(n.dikirimOleh?.company);
    const verifiedIndices = this.computeVerifiedIndices(rows, row.id, 'blanko_verbal', directors);
    await this.renderSheetPdf(
      n.id, dto, `blanko-verbal-${n.id}.pdf`, 'blanko_verbal_pdf',
      directors, n.jenis as string, user, verifiedIndices,
    );
    return this.getDetail(id, user);
  }

  async tolakBlankoVerbal(id: string, catatan: string, user: CurrentUser) {
    const n = await this.findNaskah(id);
    if (n.tahapan !== 'blanko_verbal') {
      throw new BadRequestException('Tolak blanko verbal hanya untuk naskah tahap blanko verbal.');
    }
    if (!catatan?.trim()) throw new BadRequestException('Alasan wajib diisi saat menolak.');
    const rows = await this.approvalRepo.find({ where: { naskahId: id } });
    const row = this.findUserWaitingRow(rows, 'blanko_verbal', user);
    if (!row) throw new ForbiddenException('Anda tidak memiliki baris paraf waiting untuk naskah ini.');

    await this.dataSource.transaction(async (manager) => {
      const newTahap = await this.workflow.applyApproval(n, rows, row.id, 'tolak', {
        catatan, aktor: user.nama, jabatan: user.positionText, manager,
      });
      await manager.update(NaskahEntity, { id: n.id, tanggal: n.tanggal as any }, { tahapan: newTahap });
    });
    return this.getDetail(id, user);
  }

  // ---------- Sheet helpers ----------

  private async getBodDirectors(company: string | undefined) {
    if (!company) throw new BadRequestException('Data company pemrakarsa tidak ditemukan.');
    // findBodByCompany hanya butuh position_json dari 1 baris org terbaru.
    // findAll() memuat 262 baris × organization_json (puluhan MB) → lambat.
    // findLatestOrg() ter-cache 5 menit & hanya 1 baris.
    const latestOrg = await this.orgDataService.findLatestOrg();
    const directors = this.orgDataService.findBodByCompany(latestOrg ? [latestOrg] : [], company);
    if (!directors.length) throw new BadRequestException('Tidak ditemukan direktur untuk company ini.');
    return directors;
  }

  private findUserWaitingRow(
    rows: NaskahLainnyaApprovalEntity[],
    tahap: string,
    user: CurrentUser,
  ): NaskahLainnyaApprovalEntity | undefined {
    const posId = user.positionId ?? user.position;
    return rows.find(
      (r) => r.tahap === tahap && r.status === 'waiting' &&
        ((posId && r.positionId === posId) || (user.nama && r.nama === user.nama)),
    );
  }

  private async seedBodApprovals(
    manager: EntityManager,
    naskahId: string,
    directors: any[],
    tahap: 'persetujuan_direksi' | 'blanko_verbal',
  ): Promise<void> {
    await manager.delete(NaskahLainnyaApprovalEntity, { naskahId, tahap });
    for (const d of directors) {
      const row = this.approvalRepo.create({
        id: uuidv4(),
        naskahId,
        tahap,
        positionId: d.positionId ?? null,
        nama: d.nama,
        jabatan: d.jabatan,
        urutan: 1,
        status: 'waiting',
      });
      await manager.save(row);
    }
  }

  /**
   * Himpun index direksi (1-based) yang sudah verified pada tahap paraf, termasuk
   * baris yang baru saja diparaf (rowId). Direksi dicocokkan ke index berdasarkan
   * urutan `directors` (posisi) via positionId/nama — sama dengan cara reRender lama.
   */
  private computeVerifiedIndices(
    rows: NaskahLainnyaApprovalEntity[],
    rowId: string,
    tahap: 'persetujuan_direksi' | 'blanko_verbal',
    directors: any[],
  ): Set<number> {
    const verifiedRows = rows.filter((r) => r.tahap === tahap && (r.status === 'verified' || r.id === rowId));
    const indices = new Set<number>();
    for (const r of verifiedRows) {
      const idx = directors.findIndex(
        (d) => (d.positionId && r.positionId === d.positionId) || r.nama === d.nama,
      );
      if (idx >= 0) indices.add(idx + 1);
    }
    return indices;
  }

  /**
   * Render sheet (LPD atau blanko verbal) ke PDF via service khusus, lalu upload
   * + simpan baris dokumen. `verifiedIndices` menentukan direksi mana yang dapat
   * QR paraf (∅ untuk preview/kirim; baris verified untuk paraf).
   * `tipe` menentukan service & tipe dokumen: 'lembar_persetujuan_direksi_pdf'
   * → LPD; 'blanko_verbal_pdf' → blanko.
   */
  private async renderSheetPdf(
    naskahId: string,
    sheet: SheetDataDto,
    filename: string,
    tipe: 'lembar_persetujuan_direksi_pdf' | 'blanko_verbal_pdf',
    directors: any[],
    documentType: string,
    user: CurrentUser,
    verifiedIndices: Set<number>,
    persist = true,
  ): Promise<{ pdfUrl: string; minioKey: string }> {
    const prefix = tipe === 'lembar_persetujuan_direksi_pdf' ? 'paraf_direksi' : 'paraf_blanko_verbal';
    const qrBase64s = await this.buildDirectorQrBase64s(naskahId, directors, documentType, prefix);
    const directorsWithQr = directors.map((d: any, i: number) => ({
      index: i + 1,
      nama: d.nama,
      jabatan: d.jabatan,
      qrBase64: qrBase64s[i]?.qrBase64 ?? '',
    }));
    const data: SheetPdfData = {
      tanggal: sheet.tanggal, nomor: sheet.nomor,
      diusulkanOleh: sheet.diusulkanOleh, jabatanDiusulkan: sheet.jabatanDiusulkan,
      perihal: sheet.perihal,
      referensiDari: sheet.referensiDari, referensiNomor: sheet.referensiNomor, referensiTanggal: sheet.referensiTanggal,
      klasifikasi: sheet.klasifikasi, lampiran: sheet.lampiran,
      legalDrafter: sheet.legalDrafter, legalDrafterJabatan: sheet.legalDrafterJabatan,
      legalChecker: sheet.legalChecker, legalCheckerJabatan: sheet.legalCheckerJabatan,
      bodyHtml: sheet.bodyHtml, catatan: sheet.catatan,
      directors: directorsWithQr, verifiedIndices,
    };
    const buffer = tipe === 'lembar_persetujuan_direksi_pdf'
      ? await this.lpdService.render(data)
      : await this.blankoService.render(data);
    const upload = await this.storage.uploadBuffer(buffer, filename, 'application/pdf', 'naskah-lainnya-pdf');
    const pdfUrl = await this.storage.getFileUrl(upload.key, 3600);
    // persist=false → preview sekali jalan (URL sementara) tanpa menyimpan baris dokumen.
    if (persist) await this.saveSheetDokumen(naskahId, tipe, upload.key, filename, user);
    return { pdfUrl, minioKey: upload.key };
  }

  private async buildDirectorQrBase64s(
    naskahId: string,
    directors: any[],
    documentType: string,
    qrPrefix: string,
  ): Promise<{ index: number; nama: string; jabatan: string; qrBase64: string }[]> {
    const results: { index: number; nama: string; jabatan: string; qrBase64: string }[] = [];
    for (let i = 0; i < directors.length; i++) {
      const d = directors[i];
      const qrBuffer = await this.qrCode.generateQRCodePngBuffer({
        signature_id: `${naskahId}-${qrPrefix}-${i + 1}`,
        document_number: naskahId,
        signed_at: new Date().toISOString(),
        signer_name: d.nama,
        signer_jabatan: d.jabatan,
        document_type: documentType,
        verification_url: `${process.env.FRONTEND_URL ?? ''}/naskah-lainnya/${naskahId}/verifikasi`,
      });
      results.push({
        index: i + 1,
        nama: d.nama,
        jabatan: d.jabatan,
        qrBase64: qrBuffer.toString('base64'),
      });
    }
    return results;
  }

  private async saveSheetDokumen(
    naskahId: string,
    tipe: string,
    minioKey: string,
    nama: string,
    user: CurrentUser,
  ): Promise<NaskahLainnyaDokumenEntity> {
    const existing = await this.dokumenRepo.findOne({ where: { naskahId, tipe } });
    if (existing) {
      await this.dokumenRepo.update(existing.id, {
        minioKey, nama, mimetype: 'application/pdf', ukuran: null,
        uploaderNama: user.nama,
        uploaderJabatan: user.positionText ?? null,
        uploaderPersnum: user.persnum,
      });
      return { ...existing, minioKey, nama, mimetype: 'application/pdf', ukuran: null } as NaskahLainnyaDokumenEntity;
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
