import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';

export type Tahapan =
  | 'konsep'
  | 'persetujuan'
  | 'legal_drafting'
  | 'evaluasi'
  | 'persetujuan_direksi'
  | 'blanko_verbal'
  | 'tanda_tangan'
  // legacy (3 TTD fix lama) — tetap di union untuk backward-compat compiler; tidak dipakai alur baru.
  | 'tanda_tangan_pemrakarsa'
  | 'tanda_tangan_legal'
  | 'tanda_tangan_pejabat'
  | 'selesai'
  | 'perlu_perbaikan'
  | 'ditolak'
  | 'dibatalkan';

export type JenisAksi =
  | 'kirim'
  | 'setuju'
  | 'tolak'
  | 'kembalikan'
  | 'mulai-legal'
  | 'kirim-approval-legal'
  | 'kembalikan-legal'
  | 'evaluasi'
  | 'kembalikan-evaluasi'
  | 'kirim-approval-blanko'
  | 'kirim-blanko'
  | 'tanda-tangan'
  | 'kirim-lembar-persetujuan-direksi'
  | 'complete'
  | 'paraf';

import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

export interface AktorCtx {
  manager: EntityManager;
  aktor: string;
  jabatan?: string;
}

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

  buildStepper(
    tahapan: Tahapan,
    butuhLegal: boolean,
    N = 0,
    signingIndex: number | null = null,
    signOption: NaskahEntity['signOption'] = null,
  ) {
    // Base labels (tanpa sub-step signing dinamis).
    const base: { label: string; key: string }[] = [
      { label: 'Konsep Naskah', key: 'konsep' },
      { label: 'Persetujuan', key: 'persetujuan' },
      { label: 'Legal Drafting', key: 'legal_drafting' },
      { label: 'Evaluasi', key: 'evaluasi' },
      { label: 'Persetujuan Direksi', key: 'persetujuan_direksi' },
      { label: 'Blanko Verbal', key: 'blanko_verbal' },
    ];
    // TTD manual/fisik hanya memakai approval pemrakarsa/verifikator.
    // Tidak ada proses legal maupun tanda tangan per pejabat di aplikasi.
    const signingStepCount = signOption === 'ttd_basah' ? 0 : N;
    const signingSteps = Array.from({ length: signingStepCount }, (_, i) => ({
      label: `Tanda Tangan Penandatangan ${i + 1}`,
      key: `tanda_tangan_${i + 1}`,
    }));
    const tail = [{ label: 'Selesai', key: 'selesai' }];
    const all = [...base, ...signingSteps, ...tail];

    // Peta key → urutan aktif (skip Legal Drafting & Blanko Verbal sesuai kondisi).
    const activeKey =
      tahapan === 'selesai'
        ? 'selesai'
        : tahapan === 'tanda_tangan'
          ? `tanda_tangan_${signingIndex ?? 1}`
          : tahapan;
    // Recovery states (perlu_perbaikan/ditolak/dibatalkan) tidak ada di daftar step;
    // clamp ke 0 (konsep active) supaya tidak semua step render 'todo'.
    const activeIdx = Math.max(
      0,
      all.findIndex((s) => s.key === activeKey),
    );

    // Step yang dilewati DIHAPUS dari stepper — bukan dicoret.
    // Urutan step tersisa direnumber 1..M. aktifIdx dihitung dari `all` (sebelum
    // filter) agar status done/active/todo tetap benar.
    const skipLegalFlow = !butuhLegal || signOption === 'ttd_basah';
    const isSkip = (key: string) =>
      skipLegalFlow &&
      [
        'legal_drafting',
        'evaluasi',
        'persetujuan_direksi',
        'blanko_verbal',
      ].includes(key);

    const mapped = all
      .map((s, i) => {
        if (isSkip(s.key)) return null;
        let status: 'todo' | 'active' | 'done';
        // Selesai: semua step selesai (termasuk step 'Selesai' → icon check), bukan
        // step terakhir 'active' (yang render nomor step, bukan check).
        if (tahapan === 'selesai') status = 'done';
        else if (i === activeIdx) status = 'active';
        else if (i < activeIdx) status = 'done';
        else status = 'todo';
        return { step: 0, label: s.label, status };
      })
      .filter(
        (
          s,
        ): s is {
          step: number;
          label: string;
          status: 'todo' | 'active' | 'done';
        } => s !== null,
      );

    return mapped.map((s, i) => ({ ...s, step: i + 1 }));
  }

  async buildAvailableActions(
    tahapan: Tahapan,
    butuhLegal: boolean,
    user: { positionText?: string; positionId?: string; position?: string },
    hasWaitingLegalRows = false,
    hasDireksiRows = false,
    signOption: NaskahEntity['signOption'] = null,
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
      case 'konsep':
        return ['kirim'];
      case 'persetujuan':
        return ['setuju', 'tolak', 'kembalikan'];
      case 'legal_drafting': {
        if (!legal || !butuhLegal) return [];
        // Sudah dikirim ke approver legal (baris waiting ada) → drafter tidak bisa
        // kirim ulang/kembalikan sampai approver merespons (setuju semua → evaluasi,
        // tolak → baris rejected, drafter bebas kirim ulang).
        if (hasWaitingLegalRows) return [];
        return ['kirim-approval-legal', 'kembalikan-legal'];
      }
      case 'evaluasi': {
        // butuhLegal: setelah approval legal selesai, pemrakarsa mengevaluasi hasil
        // legal drafting. Jika sesuai → lanjut persetujuan_direksi; jika belum sesuai
        // → kembalikan ke legal drafting. Legal tetap punya aksi menyusun lembar
        // persetujuan direksi saat tahap ini memang sudah menjadi tanggung jawab legal.
        if (butuhLegal) {
          return legal
            ? ['kirim-lembar-persetujuan-direksi']
            : ['evaluasi', 'kembalikan-evaluasi'];
        }
        return ['evaluasi'];
      }
      case 'persetujuan_direksi': {
        // Legal belum kirim lembar (belum ada baris BOD) → susun + kirim lembar
        // (recovery untuk naskah yang sudah masuk PD tanpa lembar, atau alur normal
        // via evaluasi). Sudah ada baris BOD → legal view-only; direksi paraf/tolak
        // (keberadaan waiting row direksi divalidasi di service paraf/tolak).
        if (legal)
          return hasDireksiRows ? [] : ['kirim-lembar-persetujuan-direksi'];
        return ['paraf', 'tolak'];
      }
      case 'tanda_tangan':
        return signOption === 'ttd_basah' ? [] : ['tanda-tangan'];
      case 'tanda_tangan_pemrakarsa':
        return ['tanda-tangan'];
      case 'blanko_verbal':
        // Legal hanya mengirim blanko sekali, sebelum baris approval direksi
        // dibuat. Setelah ada baris, penyelesaian seluruh paraf harus maju
        // otomatis melalui applyApproval(), bukan menunggu klik legal lagi.
        return legal && !hasDireksiRows ? ['kirim-approval-blanko'] : [];
      case 'tanda_tangan_legal':
        return legal ? ['tanda-tangan'] : [];
      case 'tanda_tangan_pejabat':
        return ['tanda-tangan'];
      case 'perlu_perbaikan':
        return ['kirim'];
      default:
        return [];
    }
  }

  // ---------- Transisi state (murni) ----------

  nextAfterKirim(butuhLegal: boolean): Tahapan {
    return 'persetujuan';
  }

  nextAfterApprovalSetuju(
    current: Tahapan,
    butuhLegal: boolean,
    allVerified: boolean,
    N = 0,
    signOption: NaskahEntity['signOption'] = null,
  ): Tahapan {
    if (!allVerified) return current;
    // Digital:
    // - !butuhLegal: persetujuan selesai → langsung tanda tangan.
    // - butuhLegal: persetujuan selesai → legal drafting.
    // Fisik/manual:
    // - cukup approval pemrakarsa/verifikator, lalu selesai untuk upload final.
    if (current === 'persetujuan') {
      return butuhLegal && signOption !== 'ttd_basah'
        ? 'legal_drafting'
        : this.signingTarget(N, signOption);
    }
    // Persetujuan legal drafting selesai → evaluasi.
    if (current === 'legal_drafting') return 'evaluasi';
    return current;
  }

  /**
   * Target fase signing:
   * - Fisik/manual tidak punya signing task di aplikasi; workflow langsung selesai
   *   dan pemrakarsa mengunggah dokumen final dari halaman detail.
   * - Digital tetap masuk signing berjenjang bila ada penandatangan.
   */
  signingTarget(
    N: number,
    signOption: NaskahEntity['signOption'] = null,
  ): Tahapan {
    return signOption === 'ttd_basah' || N === 0 ? 'selesai' : 'tanda_tangan';
  }

  /** Jumlah penandatangan efektif: pakai penandatanganChain bila ada, fallback ke
   * legacy single penandatangan (atasNama/penandatanganPositionId) — konsisten
   * dengan fallback di signing chain (getDetail) & toListItem. Menghindari false
   * N=0 saat chain null tapi penandatangan legacy terisi (lalu kirim/validation
   * salah tolak, atau transisi skip tanda_tangan padahal ada penandatangan). */
  effectiveSignerCount(naskah: NaskahEntity): number {
    if (naskah.penandatanganChain?.length)
      return naskah.penandatanganChain.length;
    return naskah.penandatanganPositionId != null || !!naskah.atasNama ? 1 : 0;
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
    if (row.status !== 'waiting')
      throw new BadRequestException('Baris approval sudah diproses');

    // Persetujuan Direksi & Blanko Verbal: non-sequential (parallel). Setiap direktur
    // dengan baris waiting boleh bertindak; transisi lanjut hanya jika semua baris
    // pada tahap yang sama sudah verified.
    const isDireksiTahap =
      row.tahap === 'persetujuan_direksi' ||
      row.tahap === 'persetujuan_direksi_ditetapkan' ||
      row.tahap === 'blanko_verbal' ||
      row.tahap === 'blanko_verbal_ditetapkan';
    if (isDireksiTahap) {
      const t = naskah.tahapan as Tahapan;
      const N = this.effectiveSignerCount(naskah);
      const signingIndex = naskah.signingIndex ?? 1;
      const logicalTahap =
        row.tahap === 'persetujuan_direksi_ditetapkan'
          ? 'persetujuan_direksi'
          : row.tahap === 'blanko_verbal_ditetapkan'
            ? 'blanko_verbal'
            : row.tahap;
      const logicalTahapRows = rows.filter(
        (r) =>
          r.tahap === logicalTahap || r.tahap === `${logicalTahap}_ditetapkan`,
      );
      row.status = aksi === 'setuju' ? 'verified' : 'rejected';
      row.catatan = ctx.catatan ?? row.catatan;
      row.tanggal = new Date();
      await ctx.manager.save(row);

      if (aksi === 'tolak') {
        for (const r of logicalTahapRows) {
          if (r.status === 'waiting') {
            r.status = 'rejected';
            await ctx.manager.save(r);
          }
        }
        const next = this.resolveNext(
          t,
          'tolak',
          naskah.butuhLegal,
          signingIndex,
          N,
          naskah.signOption,
        );
        naskah.tahapan = next;
        await this.tulisRiwayat(
          ctx,
          naskah.id,
          aksi,
          String(t),
          next,
          ctx.catatan,
        );
        return next;
      }

      const allVerified = logicalTahapRows.every(
        (r) => r.status === 'verified',
      );
      if (allVerified) {
        const next = this.resolveNext(
          t,
          'complete',
          naskah.butuhLegal,
          signingIndex,
          N,
          naskah.signOption,
        );
        naskah.tahapan = next;
        await this.tulisRiwayat(
          ctx,
          naskah.id,
          aksi,
          String(t),
          next,
          ctx.catatan,
        );
        return next;
      }

      await this.tulisRiwayat(ctx, naskah.id, aksi, String(t), t, ctx.catatan);
      return t;
    }

    // Berjenjang: hanya urutan terendah yang masih waiting yang boleh diproses.
    // Urutan lebih tinggi tunggu hingga urutan sebelumnya verified.
    const lowerWaiting = rows.some(
      (r) =>
        r.tahap === row.tahap &&
        r.urutan < row.urutan &&
        r.status === 'waiting',
    );
    if (lowerWaiting)
      throw new BadRequestException('Urutan approval sebelumnya belum selesai');
    if (row.tahap === 'approval_penandatangan' && aksi === 'kembalikan') {
      // kembalikan pada tahap penandatangan → balik ke blanko_verbal
      row.status = 'waiting';
      await ctx.manager.save(row);
      await this.tulisRiwayat(
        ctx,
        naskah.id,
        aksi,
        'blanko_verbal',
        'dikembalikan — belum semua setuju',
        ctx.catatan,
      );
      return 'blanko_verbal';
    }

    row.status = aksi === 'setuju' ? 'verified' : 'rejected';
    row.catatan = ctx.catatan ?? row.catatan;
    row.tanggal = new Date();
    await ctx.manager.save(row);

    const allVerified = rows.every((r) => r.status === 'verified');
    if (aksi === 'setuju' && allVerified) {
      const next = this.nextAfterApprovalSetuju(
        naskah.tahapan as Tahapan,
        naskah.butuhLegal,
        true,
        this.effectiveSignerCount(naskah),
        naskah.signOption,
      );
      await this.tulisRiwayat(
        ctx,
        naskah.id,
        'setuju',
        String(naskah.tahapan),
        `disetujui → ${next}`,
        ctx.catatan,
      );
      naskah.tahapan = next;
      return next;
    }

    // Persetujuan legal drafting: tolak/kembalikan oleh satu approver → short-circuit.
    // Semua baris legal_drafting yang masih waiting ditandai rejected.
    // - tolak: naskah KEMBALI ke step legal_drafting agar DRAFTER LEGAL merevisi
    //   naskah & kirim ulang approval (buatApprovalLegalDrafting idempotent — hapus
    //   baris lama, seed baru). Alasan tolak tersimpan di row catatan + riwayat.
    // - kembalikan: kembali ke perlu_perbaikan (pemrakarsa merevisi) — perilaku lama.
    if (
      naskah.tahapan === 'legal_drafting' &&
      (aksi === 'tolak' || aksi === 'kembalikan')
    ) {
      for (const r of rows) {
        if (r.tahap === 'legal_drafting' && r.status === 'waiting') {
          r.status = 'rejected';
          await ctx.manager.save(r);
        }
      }
      const nextTahap = aksi === 'tolak' ? 'legal_drafting' : 'perlu_perbaikan';
      naskah.tahapan = nextTahap;
      await this.tulisRiwayat(
        ctx,
        naskah.id,
        aksi,
        'legal_drafting',
        nextTahap,
        ctx.catatan,
      );
      return nextTahap;
    }

    const nextStatus =
      aksi === 'tolak' || aksi === 'kembalikan'
        ? 'perlu_perbaikan'
        : (naskah.tahapan as Tahapan);
    await this.tulisRiwayat(
      ctx,
      naskah.id,
      aksi,
      String(naskah.tahapan),
      nextStatus,
      ctx.catatan,
    );
    if (aksi !== 'setuju') naskah.tahapan = nextStatus;
    return naskah.tahapan as Tahapan;
  }

  // ---------- Transisi utama (dipakai NaskahLainnyaService) ----------

  async transisi(
    naskah: NaskahEntity,
    aksi: JenisAksi,
    ctx: {
      aktor: string;
      jabatan?: string;
      catatan?: string;
      manager: EntityManager;
    },
  ): Promise<void> {
    const t = naskah.tahapan as Tahapan;
    const N = this.effectiveSignerCount(naskah);
    const signingIndex = naskah.signingIndex ?? 1;
    const next = this.resolveNext(
      t,
      aksi,
      naskah.butuhLegal,
      signingIndex,
      N,
      naskah.signOption,
    );

    const patch: Partial<NaskahEntity> = { tahapan: next };
    // Saat memasuki fase tanda_tangan → set signingIndex=1.
    if (next === 'tanda_tangan' && t !== 'tanda_tangan') patch.signingIndex = 1;
    // Saat selesai via transisi langsung (mis. kirim-approval-blanko N=0) → null signingIndex.
    if (next === 'selesai') {
      patch.signingIndex = null;
      if (naskah.signOption === 'ttd_basah') patch.status = 'pending';
    }
    naskah.tahapan = next;
    if (patch.signingIndex !== undefined)
      naskah.signingIndex = patch.signingIndex as number | null;

    // Gunakan update() bukan save() — entity di-load di luar transaction
    // (findNaskah pakai naskahRepo), jadi manager.save() menganggap INSERT → duplicate PK.
    await ctx.manager.update(
      NaskahEntity,
      { id: naskah.id, tanggal: naskah.tanggal as any },
      patch,
    );
    if (aksi === 'kirim') {
      await this.buatApprovalPersetujuan(ctx.manager, naskah);
    }
    await this.tulisRiwayat(ctx, naskah.id, aksi, t, next, ctx.catatan);
  }

  /** Advance fase signing setelah side-effect (QR inject / upload fisik) selesai. */
  async transisiTandaTangan(
    naskah: NaskahEntity,
    ctx: {
      aktor: string;
      jabatan?: string;
      catatan?: string;
      manager: EntityManager;
    },
  ): Promise<void> {
    const N = this.effectiveSignerCount(naskah);
    const idx = naskah.signingIndex ?? 1;
    const next: Tahapan = idx >= N ? 'selesai' : 'tanda_tangan';
    const patch: Partial<NaskahEntity> = {
      tahapan: next,
      signingIndex: next === 'selesai' ? null : idx + 1,
    };
    naskah.tahapan = next;
    naskah.signingIndex = patch.signingIndex as number | null;
    await ctx.manager.update(
      NaskahEntity,
      { id: naskah.id, tanggal: naskah.tanggal as any },
      patch,
    );
    await this.tulisRiwayat(
      ctx,
      naskah.id,
      'tanda-tangan',
      'tanda_tangan',
      next,
      ctx.catatan,
    );
  }

  resolveNext(
    t: Tahapan,
    aksi: JenisAksi,
    butuhLegal: boolean,
    signingIndex = 1,
    N = 0,
    signOption: NaskahEntity['signOption'] = null,
  ): Tahapan {
    if (t === 'evaluasi' && aksi === 'setuju') {
      return butuhLegal
        ? 'persetujuan_direksi'
        : this.signingTarget(N, signOption);
    }
    if (
      t === 'persetujuan_direksi' &&
      (aksi === 'complete' || aksi === 'paraf')
    ) {
      return 'blanko_verbal';
    }
    // Semua approval blanko_verbal terverified → lanjut otomatis ke tanda tangan
    // (atau selesai untuk fisik/tanpa penandatangan). Tanpa ini resolveNext jatuh
    // ke default → kembali 'blanko_verbal' (stuck, harus klik manual oleh legal).
    if (t === 'blanko_verbal' && aksi === 'complete') {
      return this.signingTarget(N, signOption);
    }
    if (t === 'persetujuan_direksi' && aksi === 'tolak') {
      return 'legal_drafting';
    }
    if (t === 'blanko_verbal' && aksi === 'tolak') {
      return 'legal_drafting';
    }
    switch (aksi) {
      case 'kirim':
        return this.nextAfterKirim(butuhLegal);
      case 'kirim-approval-legal':
        return t === 'legal_drafting' ? 'evaluasi' : t;
      case 'kembalikan-legal':
        return 'perlu_perbaikan';
      case 'kembalikan-evaluasi':
        return 'legal_drafting';
      case 'evaluasi':
        return t;
      case 'kirim-blanko':
        return t === 'blanko_verbal' ? t : this.signingTarget(N, signOption);
      case 'kirim-approval-blanko':
        return t === 'blanko_verbal' ? this.signingTarget(N, signOption) : t;
      case 'tanda-tangan':
        return this.nextAfterTtd(t, signingIndex, N);
      case 'tolak':
        return 'perlu_perbaikan';
      default:
        return t;
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
    // Idempotent: hapus baris persetujuan dari siklus sebelumnya sebelum seed ulang.
    // Tanpa ini, re-kirim (perlu_perbaikan) meninggalkan baris rejected/verified lama
    // yang membuat allVerified tidak pernah true. (lihat buatApprovalLegalDrafting)
    await manager.delete(NaskahLainnyaApprovalEntity, {
      naskahId: naskah.id,
      tahap: 'persetujuan',
    });

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
      await manager.save(
        this.approvalRepo.create({
          id: this.uid(),
          naskahId: naskah.id,
          ...r,
          status: 'waiting',
        }),
      );
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
      await manager.save(
        this.approvalRepo.create({
          id: this.uid(),
          naskahId: naskah.id,
          ...r,
          status: 'waiting',
        }),
      );
    }
    await this.tulisRiwayat(
      { manager, aktor: ctx.aktor, jabatan: ctx.jabatan },
      naskah.id,
      'kirim-approval-legal',
      'legal_drafting',
      'legal_drafting',
      ctx.catatan,
    );
  }

  private uid(): string {
    return randomUUID();
  }
}
