import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';

export type Tahapan =
  | 'konsep' | 'persetujuan' | 'legal_drafting' | 'evaluasi'
  | 'blanko_verbal' | 'tanda_tangan'
  // legacy (3 TTD fix lama) — tetap di union untuk backward-compat compiler; tidak dipakai alur baru.
  | 'tanda_tangan_pemrakarsa' | 'tanda_tangan_legal' | 'tanda_tangan_pejabat'
  | 'selesai' | 'perlu_perbaikan' | 'ditolak' | 'dibatalkan';

export type JenisAksi =
  | 'kirim' | 'setuju' | 'tolak' | 'kembalikan' | 'mulai-legal'
  | 'kirim-approval-legal' | 'kembalikan-legal' | 'evaluasi'
  | 'kirim-approval-blanko' | 'tanda-tangan';

import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

export interface AktorCtx { manager: EntityManager; aktor: string; jabatan?: string; }

const LEGAL_KEYWORDS = ['legal', 'hukum', 'kabag hukum'];

/** Fallback keyword check — dipakai jika LegalRoleService belum inject atau positionId tidak ditemukan. */
function isLegalRoleByKeyword(positionText?: string | null): boolean {
  const t = (positionText ?? '').toLowerCase();
  return LEGAL_KEYWORDS.some((k) => t.includes(k));
}

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(NaskahLainnyaApprovalEntity)
    private readonly approvalRepo: Repository<NaskahLainnyaApprovalEntity>,
    @InjectRepository(NaskahLainnyaRiwayatEntity)
    private readonly riwayatRepo: Repository<NaskahLainnyaRiwayatEntity>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
    private readonly legalRoleService: LegalRoleService,
  ) {}

  // ---------- Stepper & aksi (murni, mudah diuji) ----------

  buildStepper(tahapan: Tahapan, butuhLegal: boolean, N = 0, signingIndex: number | null = null) {
    // Base labels (tanpa sub-step signing dinamis).
    const base: { label: string; key: string }[] = [
      { label: 'Konsep Naskah', key: 'konsep' },
      { label: 'Persetujuan', key: 'persetujuan' },
      { label: 'Legal Drafting', key: 'legal_drafting' },
      { label: 'Evaluasi', key: 'evaluasi' },
      { label: 'Blanko Verbal', key: 'blanko_verbal' },
    ];
    const signingSteps = Array.from({ length: N }, (_, i) => ({
      label: `Tanda Tangan Penandatangan ${i + 1}`,
      key: `tanda_tangan_${i + 1}`,
    }));
    const tail = [{ label: 'Selesai', key: 'selesai' }];
    const all = [...base, ...signingSteps, ...tail];

    // Peta key → urutan aktif (skip Legal Drafting & Blanko Verbal sesuai kondisi).
    const activeKey = tahapan === 'selesai' ? 'selesai' : (tahapan === 'tanda_tangan' ? `tanda_tangan_${signingIndex ?? 1}` : tahapan);
    // Recovery states (perlu_perbaikan/ditolak/dibatalkan) tidak ada di daftar step;
    // clamp ke 0 (konsep active) supaya tidak semua step render 'todo'.
    const activeIdx = Math.max(0, all.findIndex((s) => s.key === activeKey));

    return all.map((s, i) => {
      const isLegalSkip = s.key === 'legal_drafting' && !butuhLegal;
      const isBlankoSkip = s.key === 'blanko_verbal' && !butuhLegal;
      if (isLegalSkip || isBlankoSkip) return { step: i + 1, label: s.label, status: 'skip' as const };
      let status: 'todo' | 'active' | 'done' | 'skip';
      if (tahapan === 'selesai') status = i === all.length - 1 ? 'active' : 'done';
      else if (i === activeIdx) status = 'active';
      else if (i < activeIdx) status = 'done';
      else status = 'todo';
      return { step: i + 1, label: s.label, status };
    });
  }

  async buildAvailableActions(
    tahapan: Tahapan,
    butuhLegal: boolean,
    user: { positionText?: string; positionId?: string; position?: string },
    hasWaitingLegalRows = false,
  ): Promise<JenisAksi[]> {
    // Cek legal role dari tabel legal_role (konfigurasi), fallback ke keyword
    const posId = String(user.positionId ?? user.position ?? '');
    let legal = false;
    if (posId) {
      const activeIds = await this.legalRoleService.getActivePositionIds();
      legal = activeIds.includes(posId);
    }
    if (!legal) legal = isLegalRoleByKeyword(user.positionText);
    switch (tahapan) {
      case 'konsep': return ['kirim'];
      case 'persetujuan': return ['setuju', 'tolak', 'kembalikan'];
      case 'legal_drafting': {
        if (!legal || !butuhLegal) return [];
        // Sudah dikirim ke approver legal (baris waiting ada) → drafter tidak bisa
        // kirim ulang/kembalikan sampai approver merespons (setuju semua → evaluasi,
        // tolak → baris rejected, drafter bebas kirim ulang).
        if (hasWaitingLegalRows) return [];
        return ['kirim-approval-legal', 'kembalikan-legal'];
      }
      case 'evaluasi': return ['evaluasi'];
      case 'tanda_tangan': return ['tanda-tangan'];
      case 'tanda_tangan_pemrakarsa': return ['tanda-tangan'];
      case 'blanko_verbal': return legal ? ['kirim-approval-blanko'] : [];
      case 'tanda_tangan_legal': return legal ? ['tanda-tangan'] : [];
      case 'tanda_tangan_pejabat': return ['tanda-tangan'];
      case 'perlu_perbaikan': return ['kirim'];
      default: return [];
    }
  }

  // ---------- Transisi state (murni) ----------

  nextAfterKirim(butuhLegal: boolean): Tahapan { return 'persetujuan'; }

  nextAfterApprovalSetuju(current: Tahapan, butuhLegal: boolean, allVerified: boolean): Tahapan {
    if (!allVerified) return current;
    if (current === 'persetujuan') return butuhLegal ? 'legal_drafting' : 'evaluasi';
    // Persetujuan legal drafting selesai → evaluasi.
    if (current === 'legal_drafting') return 'evaluasi';
    return current;
  }

  /** Target fase signing: selesai langsung jika tidak ada penandatangan (N=0). */
  signingTarget(N: number): Tahapan {
    return N === 0 ? 'selesai' : 'tanda_tangan';
  }

  nextAfterEvaluasi(sesuai: boolean, butuhLegal: boolean, N: number): Tahapan {
    if (!sesuai) return 'perlu_perbaikan';
    return butuhLegal ? 'blanko_verbal' : this.signingTarget(N);
  }

  nextAfterTtd(current: Tahapan, signingIndex: number, N: number): Tahapan {
    if (current === 'tanda_tangan') {
      return signingIndex >= N ? 'selesai' : 'tanda_tangan';
    }
    // legacy (tidak dipakai alur baru)
    if (current === 'tanda_tangan_pemrakarsa') return 'blanko_verbal';
    if (current === 'tanda_tangan_legal') return 'tanda_tangan_pejabat';
    if (current === 'tanda_tangan_pejabat') return 'selesai';
    return current;
  }

  // ---------- Approval chain (guard WHERE status='waiting') ----------

  async applyApproval(
    naskah: NaskahEntity,
    rows: NaskahLainnyaApprovalEntity[],
    approvalId: string,
    aksi: 'setuju' | 'tolak' | 'kembalikan',
    ctx: { catatan?: string } & AktorCtx,
  ): Promise<Tahapan> {
    const row = rows.find((r) => r.id === approvalId);
    if (!row) throw new BadRequestException('Baris approval tidak ditemukan');
    if (row.status !== 'waiting') throw new BadRequestException('Baris approval sudah diproses');
    if (row.tahap === 'approval_penandatangan' && aksi === 'kembalikan') {
      // kembalikan pada tahap penandatangan → balik ke blanko_verbal
      row.status = 'waiting';
      await ctx.manager.save(row);
      await this.tulisRiwayat(ctx, naskah.id, aksi, 'blanko_verbal', 'dikembalikan — belum semua setuju', ctx.catatan);
      return 'blanko_verbal';
    }

    row.status = aksi === 'setuju' ? 'verified' : 'rejected';
    row.catatan = ctx.catatan ?? row.catatan;
    row.tanggal = new Date();
    await ctx.manager.save(row);

    const allVerified = rows.every((r) => r.status === 'verified');
    if (aksi === 'setuju' && allVerified) {
      const next = this.nextAfterApprovalSetuju(naskah.tahapan as Tahapan, naskah.butuhLegal, true);
      await this.tulisRiwayat(ctx, naskah.id, 'setuju', String(naskah.tahapan), `disetujui → ${next}`, ctx.catatan);
      naskah.tahapan = next;
      return next;
    }

    // Persetujuan legal drafting: tolak/kembalikan oleh satu approver → short-circuit.
    // Semua baris legal_drafting yang masih waiting ditandai rejected, dan naskah
    // TETAP di legal_drafting (bukan perlu_perbaikan) agar drafter legal bisa revisi
    // draft lalu kirim approval ulang (kirimApprovalLegal hapus & seed baris baru).
    if (naskah.tahapan === 'legal_drafting' && (aksi === 'tolak' || aksi === 'kembalikan')) {
      for (const r of rows) {
        if (r.tahap === 'legal_drafting' && r.status === 'waiting') {
          r.status = 'rejected';
          await ctx.manager.save(r);
        }
      }
      await this.tulisRiwayat(ctx, naskah.id, aksi, 'legal_drafting', 'legal_drafting', ctx.catatan);
      return 'legal_drafting';
    }

    const nextStatus = aksi === 'tolak' || aksi === 'kembalikan' ? 'perlu_perbaikan' : naskah.tahapan as Tahapan;
    await this.tulisRiwayat(ctx, naskah.id, aksi, String(naskah.tahapan), nextStatus, ctx.catatan);
    if (aksi !== 'setuju') naskah.tahapan = nextStatus;
    return naskah.tahapan as Tahapan;
  }

  // ---------- Transisi utama (dipakai NaskahLainnyaService) ----------

  async transisi(
    naskah: NaskahEntity,
    aksi: JenisAksi,
    ctx: { aktor: string; jabatan?: string; catatan?: string; manager: EntityManager },
  ): Promise<void> {
    const t = naskah.tahapan as Tahapan;
    const N = naskah.penandatanganChain?.length ?? 0;
    const signingIndex = naskah.signingIndex ?? 1;
    const next = this.resolveNext(t, aksi, naskah.butuhLegal, signingIndex, N);

    const patch: Partial<NaskahEntity> = { tahapan: next };
    // Saat memasuki fase tanda_tangan → set signingIndex=1.
    if (next === 'tanda_tangan' && t !== 'tanda_tangan') patch.signingIndex = 1;
    // Saat selesai via transisi langsung (mis. kirim-approval-blanko N=0) → null signingIndex.
    if (next === 'selesai') patch.signingIndex = null;
    naskah.tahapan = next;
    if (patch.signingIndex !== undefined) naskah.signingIndex = patch.signingIndex as number | null;

    // Gunakan update() bukan save() — entity di-load di luar transaction
    // (findNaskah pakai naskahRepo), jadi manager.save() menganggap INSERT → duplicate PK.
    await ctx.manager.update(NaskahEntity, { id: naskah.id, tanggal: naskah.tanggal as any }, patch);
    if (aksi === 'kirim') {
      await this.buatApprovalPersetujuan(ctx.manager, naskah);
    }
    await this.tulisRiwayat(ctx, naskah.id, aksi, t, next, ctx.catatan);
  }

  /** Advance fase signing setelah side-effect (QR inject / upload fisik) selesai. */
  async transisiTandaTangan(
    naskah: NaskahEntity,
    ctx: { aktor: string; jabatan?: string; catatan?: string; manager: EntityManager },
  ): Promise<void> {
    const N = naskah.penandatanganChain?.length ?? 0;
    const idx = naskah.signingIndex ?? 1;
    const next: Tahapan = idx >= N ? 'selesai' : 'tanda_tangan';
    const patch: Partial<NaskahEntity> = {
      tahapan: next,
      signingIndex: next === 'selesai' ? null : (idx + 1),
    };
    naskah.tahapan = next;
    naskah.signingIndex = patch.signingIndex as number | null;
    await ctx.manager.update(NaskahEntity, { id: naskah.id, tanggal: naskah.tanggal as any }, patch);
    await this.tulisRiwayat(ctx, naskah.id, 'tanda-tangan', 'tanda_tangan', next, ctx.catatan);
  }

  resolveNext(t: Tahapan, aksi: JenisAksi, butuhLegal: boolean, signingIndex = 1, N = 0): Tahapan {
    switch (aksi) {
      case 'kirim': return this.nextAfterKirim(butuhLegal);
      case 'kirim-approval-legal': return t === 'legal_drafting' ? 'evaluasi' : t;
      case 'kembalikan-legal': return 'perlu_perbaikan';
      case 'evaluasi': return t;
      case 'kirim-approval-blanko': return t === 'blanko_verbal' ? this.signingTarget(N) : t;
      case 'tanda-tangan': return this.nextAfterTtd(t, signingIndex, N);
      case 'tolak': return 'perlu_perbaikan';
      default: return t;
    }
  }

  private async tulisRiwayat(
    ctx: AktorCtx,
    naskahId: string,
    aksi: string,
    tahap: string,
    status: string,
    catatan?: string,
  ) {
    const row = this.riwayatRepo.create({
      id: this.uid(),
      naskahId,
      aksi,
      aktor: ctx.aktor,
      jabatan: ctx.jabatan ?? null,
      tahap,
      status,
      catatan: catatan ?? null,
      tanggal: new Date(),
    });
    await ctx.manager.save(row);
  }

  private async buatApprovalPersetujuan(
    manager: EntityManager,
    naskah: NaskahEntity,
  ) {
    // Rantai custom dari pemrakarsa (urutan array = urutan persetujuan).
    // Fallback ke default bila tidak diisi.
    const chain = naskah.approvalChain?.length
      ? naskah.approvalChain
      : [
          { nama: 'Dewi Anggraini', jabatan: 'Kepala Unit Legal' },
          { nama: 'Ir. Ahmad Rizal', jabatan: 'Direktur Utama' },
        ];

    const rows = chain.map((a, i) => ({
      tahap: 'persetujuan',
      positionId: a.positionId ?? null,
      nama: a.nama,
      jabatan: a.jabatan,
      urutan: i + 1,
    }));

    for (const r of rows) {
      await manager.save(this.approvalRepo.create({ id: this.uid(), naskahId: naskah.id, ...r, status: 'waiting' }));
    }
  }

  /**
   * Seed baris persetujuan legal drafting dari daftar approver yang dipilih drafter
   * (dari unit legal). Idempotent: hapus baris legal_drafting yang ada dulu, lalu
   * seed baru. Tahapan tetap legal_drafting — baru lanjut ke evaluasi saat semua
   * approver setuju (lihat applyApproval / nextAfterApprovalSetuju).
   */
  async buatApprovalLegalDrafting(
    manager: EntityManager,
    naskah: NaskahEntity,
    approval: { positionId?: string | null; nama: string; jabatan: string }[],
    ctx: { aktor: string; jabatan?: string; catatan?: string },
  ) {
    await manager.delete(NaskahLainnyaApprovalEntity, {
      naskahId: naskah.id,
      tahap: 'legal_drafting',
    });
    const rows = approval.map((a, i) => ({
      tahap: 'legal_drafting',
      positionId: a.positionId ? String(a.positionId) : null,
      nama: a.nama,
      jabatan: a.jabatan,
      urutan: i + 1,
    }));
    for (const r of rows) {
      await manager.save(this.approvalRepo.create({ id: this.uid(), naskahId: naskah.id, ...r, status: 'waiting' }));
    }
    await this.tulisRiwayat(
      { manager, aktor: ctx.aktor, jabatan: ctx.jabatan },
      naskah.id, 'kirim-approval-legal', 'legal_drafting', 'legal_drafting', ctx.catatan,
    );
  }

  private uid(): string {
    return randomUUID();
  }
}
