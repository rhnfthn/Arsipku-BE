import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';

export type Tahapan =
  | 'konsep' | 'persetujuan' | 'legal_drafting' | 'evaluasi'
  | 'tanda_tangan_pemrakarsa' | 'blanko_verbal' | 'tanda_tangan_legal'
  | 'tanda_tangan_pejabat' | 'selesai' | 'perlu_perbaikan' | 'ditolak' | 'dibatalkan';

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

  buildStepper(tahapan: Tahapan, butuhLegal: boolean) {
    const labels = [
      'Konsep Naskah', 'Persetujuan', 'Legal Drafting', 'Evaluasi',
      'Tanda Tangan Pemrakarsa', 'Blanko Verbal', 'Tanda Tangan Legal',
      'Tanda Tangan Pejabat', 'Selesai',
    ];
    const order: Record<Tahapan, number> = {
      konsep: 1, persetujuan: 2, legal_drafting: 3, evaluasi: 4,
      tanda_tangan_pemrakarsa: 5, blanko_verbal: 6, tanda_tangan_legal: 7,
      tanda_tangan_pejabat: 8, selesai: 9, perlu_perbaikan: 1,
      ditolak: 0, dibatalkan: 0,
    };
    const activeIdx = tahapan === 'selesai' ? 9 : order[tahapan];
    return labels.map((label, i) => ({
      step: i + 1,
      label,
      status: i === 2 && !butuhLegal ? 'skip'
        : tahapan === 'selesai' && i + 1 < 9 ? 'done'
        : i + 1 === activeIdx ? 'active'
        : i + 1 < activeIdx ? 'done' : 'todo',
    }));
  }

  async buildAvailableActions(tahapan: Tahapan, butuhLegal: boolean, user: { positionText?: string; positionId?: string; position?: string }): Promise<JenisAksi[]> {
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
      case 'legal_drafting': return legal && butuhLegal ? ['kirim-approval-legal', 'kembalikan-legal'] : [];
      case 'evaluasi': return ['evaluasi'];
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
    return current;
  }

  nextAfterEvaluasi(sesuai: boolean): Tahapan {
    return sesuai ? 'tanda_tangan_pemrakarsa' : 'perlu_perbaikan';
  }

  nextAfterTtd(current: Tahapan): Tahapan {
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
    const next = this.resolveNext(t, aksi, naskah.butuhLegal);
    naskah.tahapan = next;

    // Gunakan update() bukan save() — entity di-load di luar transaction
    // (findNaskah pakai naskahRepo), jadi manager.save() menganggap INSERT → duplicate PK.
    await ctx.manager.update(NaskahEntity, { id: naskah.id, tanggal: naskah.tanggal as any }, { tahapan: next });
    if (aksi === 'kirim') {
      await this.buatApprovalPersetujuan(ctx.manager, naskah);
    }
    await this.tulisRiwayat(ctx, naskah.id, aksi, t, next, ctx.catatan);
  }

  resolveNext(t: Tahapan, aksi: JenisAksi, butuhLegal: boolean): Tahapan {
    switch (aksi) {
      case 'kirim': return this.nextAfterKirim(butuhLegal);
      case 'kirim-approval-legal': return t === 'legal_drafting' ? 'evaluasi' : t;
      case 'kembalikan-legal': return 'perlu_perbaikan';
      case 'evaluasi': return t;
      case 'kirim-approval-blanko': return t === 'blanko_verbal' ? 'tanda_tangan_legal' : t;
      case 'tanda-tangan': return this.nextAfterTtd(t);
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

  private uid(): string {
    return randomUUID();
  }
}
