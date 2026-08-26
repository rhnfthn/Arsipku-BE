import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkflowService } from './workflow.service';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

const repo = () => ({ find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() });

describe('WorkflowService', () => {
  let svc: WorkflowService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: getRepositoryToken(NaskahLainnyaApprovalEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaRiwayatEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahEntity), useValue: repo() },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb({ manager: { save: jest.fn() } })) } },
        { provide: LegalRoleService, useValue: { getActivePositionIds: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();
    svc = mod.get(WorkflowService);
  });

  it('buildStepper: butuhLegal=false menghapus Legal Drafting, Evaluasi, PD & Blanko dari stepper', () => {
    const steps = svc.buildStepper('persetujuan', false, 1);
    const labels = steps.map((s) => s.label);
    expect(labels).not.toContain('Legal Drafting');
    expect(labels).not.toContain('Evaluasi');
    expect(labels).not.toContain('Persetujuan Direksi');
    expect(labels).not.toContain('Blanko Verbal');
    // step tersisa berurutan 1..M, persetujuan aktif
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4]);
    expect(steps.find((s) => s.label === 'Persetujuan')?.status).toBe('active');
  });

  it('buildStepper: selesai → step terakhir "Selesai" berstatus done (icon check), bukan active', () => {
    const steps = svc.buildStepper('selesai', true, 1);
    const last = steps[steps.length - 1];
    expect(last.label).toBe('Selesai');
    expect(last.status).toBe('done');
    // semua step done saat selesai (tidak ada active/todo)
    expect(steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('transisi kirim: konsep → persetujuan, menulis riwayat + baris approval', async () => {
    const naskah = { id: 'n1', tahapan: 'konsep', butuhLegal: true, tanggal: new Date('2026-08-13') } as NaskahEntity;
    const manager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    await svc.transisi(naskah, 'kirim', { aktor: 'M Fakhri A', jabatan: 'Kabag Hukum', manager: manager as any });
    expect(naskah.tahapan).toBe('persetujuan');
    expect(manager.update).toHaveBeenCalled();
  });

  it('setuju pada baris terakhir persetujuan → legal_drafting (butuhLegal)', async () => {
    const naskah = { id: 'n2', tahapan: 'persetujuan', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', { aktor: 'Test', catatan: 'ok', manager: manager as any });
    expect(next).toBe('legal_drafting');
    expect(approval.find((a) => a.id === 'a2')?.status).toBe('verified');
  });

  it('setuju pada baris terakhir persetujuan → tanda_tangan (!butuhLegal, N=2; skip evaluasi)', async () => {
    const naskah = { id: 'n2b', tahapan: 'persetujuan', butuhLegal: false, penandatanganChain: [{}, {}] } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', { aktor: 'Test', catatan: 'ok', manager: manager as any });
    expect(next).toBe('tanda_tangan');
  });

  it('setuju pada baris terakhir persetujuan → selesai (!butuhLegal, N=0; tanpa penandatangan)', async () => {
    const naskah = { id: 'n2c', tahapan: 'persetujuan', butuhLegal: false } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', { aktor: 'Test', catatan: 'ok', manager: manager as any });
    expect(next).toBe('selesai');
  });

  it('setuju belum semua → tetap persetujuan', async () => {
    const naskah = { id: 'n3', tahapan: 'persetujuan', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a1', 'setuju', { aktor: 'Test', catatan: undefined, manager: manager as any });
    expect(next).toBe('persetujuan');
  });

  it('applyApproval: direksi parallel — urutan 2 can act before urutan 1', async () => {
    const naskah = { id: 'n1', tahapan: 'persetujuan_direksi', butuhLegal: true, signingIndex: 0 } as any;
    const rows = [
      { id: 'a1', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 1, status: 'waiting', nama: 'A' } as any,
      { id: 'a2', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 2, status: 'waiting', nama: 'B' } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    await svc.applyApproval(naskah, rows, 'a2', 'setuju', { aktor: 'B', catatan: undefined, manager: manager as any });
    expect(rows[1].status).toBe('verified');
    expect(naskah.tahapan).toBe('persetujuan_direksi');
  });

  it('applyApproval: direksi parallel — all verified triggers complete', async () => {
    const naskah = { id: 'n1', tahapan: 'persetujuan_direksi', butuhLegal: true, signingIndex: 0 } as any;
    const rows = [
      { id: 'a1', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 1, status: 'verified', nama: 'A' } as any,
      { id: 'a2', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 2, status: 'waiting', nama: 'B' } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'setuju', { aktor: 'B', catatan: undefined, manager: manager as any });
    expect(rows[1].status).toBe('verified');
    expect(next).toBe('blanko_verbal');
    expect(naskah.tahapan).toBe('blanko_verbal');
  });

  it('applyApproval: direksi reject short-circuits remaining waiting rows', async () => {
    const naskah = { id: 'n1', tahapan: 'persetujuan_direksi', butuhLegal: true, signingIndex: 0 } as any;
    const rows = [
      { id: 'a1', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 1, status: 'waiting', nama: 'A' } as any,
      { id: 'a2', naskahId: 'n1', tahap: 'persetujuan_direksi', urutan: 2, status: 'waiting', nama: 'B' } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'tolak', { aktor: 'B', catatan: 'salah', manager: manager as any });
    expect(rows[0].status).toBe('rejected');
    expect(rows[1].status).toBe('rejected');
    expect(next).toBe('legal_drafting');
    expect(naskah.tahapan).toBe('legal_drafting');
  });

  it('applyApproval: blanko_verbal parallel — urutan 2 can act before urutan 1', async () => {
    const naskah = { id: 'n1', tahapan: 'blanko_verbal', butuhLegal: true, signingIndex: 0 } as any;
    const rows = [
      { id: 'a1', naskahId: 'n1', tahap: 'blanko_verbal', urutan: 1, status: 'waiting', nama: 'A' } as any,
      { id: 'a2', naskahId: 'n1', tahap: 'blanko_verbal', urutan: 2, status: 'waiting', nama: 'B' } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    await svc.applyApproval(naskah, rows, 'a2', 'setuju', { aktor: 'B', catatan: undefined, manager: manager as any });
    expect(rows[1].status).toBe('verified');
    expect(naskah.tahapan).toBe('blanko_verbal');
  });

  it('applyApproval: blanko_verbal all verified does NOT auto-advance (manual kirim-approval-blanko)', async () => {
    const naskah = { id: 'n1', tahapan: 'blanko_verbal', butuhLegal: true, signingIndex: 0 } as any;
    const rows = [
      { id: 'a1', naskahId: 'n1', tahap: 'blanko_verbal', urutan: 1, status: 'verified', nama: 'A' } as any,
      { id: 'a2', naskahId: 'n1', tahap: 'blanko_verbal', urutan: 2, status: 'waiting', nama: 'B' } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'setuju', { aktor: 'B', catatan: undefined, manager: manager as any });
    expect(rows[1].status).toBe('verified');
    expect(next).toBe('blanko_verbal');
    expect(naskah.tahapan).toBe('blanko_verbal');
  });

  it('applyApproval menolak aksi urutan 2 bila urutan 1 masih waiting (berjenjang)', async () => {
    const naskah = { id: 'n5', tahapan: 'persetujuan', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    await expect(
      svc.applyApproval(naskah, approval, 'a2', 'setuju', { aktor: 'Test', catatan: undefined, manager: manager as any }),
    ).rejects.toThrow('Urutan approval sebelumnya belum selesai');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('tolak → perlu_perbaikan', async () => {
    const naskah = { id: 'n4', tahapan: 'persetujuan', butuhLegal: true } as NaskahEntity;
    const approval = [{ id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' }] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a1', 'tolak', { aktor: 'Test', catatan: 'alasan', manager: manager as any });
    expect(next).toBe('perlu_perbaikan');
  });

  it('legal_drafting: setuju semua → evaluasi', async () => {
    const naskah = { id: 'l1', tahapan: 'legal_drafting', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'verified' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'la2', 'setuju', { aktor: 'Legal B', manager: manager as any });
    expect(next).toBe('evaluasi');
    expect(naskah.tahapan).toBe('evaluasi');
  });

  it('legal_drafting: tolak → legal_drafting (kembali ke drafter legal untuk revisi & kirim ulang) + short-circuit baris waiting lain', async () => {
    const naskah = { id: 'l2', tahapan: 'legal_drafting', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'waiting' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'la1', 'tolak', { aktor: 'Legal A', catatan: 'revisi', manager: manager as any });
    expect(next).toBe('legal_drafting');
    expect(naskah.tahapan).toBe('legal_drafting');
    // baris waiting lain ikut rejected (short-circuit)
    expect(approval.find((a) => a.id === 'la2')?.status).toBe('rejected');
  });

  it('legal_drafting: kembalikan → perlu_perbaikan (kembali ke pemrakarsa) + short-circuit baris waiting lain', async () => {
    const naskah = { id: 'l2b', tahapan: 'legal_drafting', butuhLegal: true } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'waiting' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'la1', 'kembalikan', { aktor: 'Legal A', catatan: 'kembalikan', manager: manager as any });
    expect(next).toBe('perlu_perbaikan');
    expect(naskah.tahapan).toBe('perlu_perbaikan');
    expect(approval.find((a) => a.id === 'la2')?.status).toBe('rejected');
  });

  it('buildAvailableActions legal_drafting: hasWaitingLegalRows=true → kosong (drafter tunggu approver)', async () => {
    const actions = await svc.buildAvailableActions('legal_drafting', true, { positionId: 'POS_LEGAL' }, true);
    expect(actions).toEqual([]);
  });

  it('buildAvailableActions evaluasi: butuhLegal+legal → [kirim-lembar-persetujuan-direksi]; butuhLegal+non-legal → [kembalikan-evaluasi]; !butuhLegal → [evaluasi]', async () => {
    expect(await svc.buildAvailableActions('evaluasi', true, { positionText: 'Kabag Hukum' })).toEqual(['kirim-lembar-persetujuan-direksi']);
    expect(await svc.buildAvailableActions('evaluasi', true, { positionId: 'POS_X' })).toEqual(['kembalikan-evaluasi']);
    expect(await svc.buildAvailableActions('evaluasi', false, { positionId: 'POS_X' })).toEqual(['evaluasi']);
  });

  it('resolveNext kembalikan-evaluasi → legal_drafting', () => {
    expect(svc.resolveNext('evaluasi', 'kembalikan-evaluasi', true)).toBe('legal_drafting');
  });

  it('resolveNext: evaluasi + setuju + butuhLegal → persetujuan_direksi', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', true)).toBe('persetujuan_direksi');
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal → signingTarget', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false)).toBe(svc.signingTarget(0));
  });

  it('resolveNext: persetujuan_direksi + complete → blanko_verbal', () => {
    expect(svc.resolveNext('persetujuan_direksi', 'complete', true)).toBe('blanko_verbal');
  });

  it('resolveNext: persetujuan_direksi + tolak → legal_drafting', () => {
    expect(svc.resolveNext('persetujuan_direksi', 'tolak', true)).toBe('legal_drafting');
  });

  it('buildStepper includes persetujuan_direksi when butuhLegal', () => {
    const stepper = svc.buildStepper('persetujuan_direksi', true, 0);
    expect(stepper.map((s) => s.label)).toContain('Persetujuan Direksi');
  });

  it('buatApprovalLegalDrafting: hapus baris legal lama + seed baru, tetap legal_drafting', async () => {
    const naskah = { id: 'l3', tahapan: 'legal_drafting', butuhLegal: true, tanggal: new Date('2026-08-18') } as NaskahEntity;
    const manager = { save: jest.fn((e) => e), delete: jest.fn() };
    const approval = [
      { positionId: 'P1', nama: 'Legal A', jabatan: 'Kabag Hukum' },
      { positionId: 'P2', nama: 'Legal B', jabatan: 'Staff Legal' },
    ];
    await svc.buatApprovalLegalDrafting(manager as any, naskah, approval, { aktor: 'Drafter' });
    expect(manager.delete).toHaveBeenCalledWith(NaskahLainnyaApprovalEntity, { naskahId: 'l3', tahap: 'legal_drafting' });
    // 2 baris baru di-seed (save dipanggil untuk tiap baris + riwayat)
    expect(manager.save).toHaveBeenCalled();
    expect(naskah.tahapan).toBe('legal_drafting');
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal + N>0 → tanda_tangan', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false, 1, 2)).toBe('tanda_tangan');
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal + N=0 → selesai (skip signing)', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false, 1, 0)).toBe('selesai');
  });

  it('effectiveSignerCount: chain null + legacy atasNama/positionId → 1 (bukan 0)', () => {
    // Legacy naskah (penandatanganChain null, penandatangan hanya di field legacy).
    // Harus dihitung 1 — bukan 0 — supaya validasi kirim qr_only & transisi signing
    // tidak salah anggap tidak ada penandatangan.
    expect(svc.effectiveSignerCount({ atasNama: 'Budi', penandatanganPositionId: 'P1' } as any)).toBe(1);
    expect(svc.effectiveSignerCount({ atasNama: 'Budi' } as any)).toBe(1);
    expect(svc.effectiveSignerCount({ penandatanganPositionId: 'P1' } as any)).toBe(1);
    // Tanpa chain maupun legacy → 0.
    expect(svc.effectiveSignerCount({} as any)).toBe(0);
    // Chain terisi → pakai panjang chain.
    expect(svc.effectiveSignerCount({ penandatanganChain: [{}, {}] } as any)).toBe(2);
  });

  it('resolveNext: evaluasi + tolak → perlu_perbaikan', () => {
    expect(svc.resolveNext('evaluasi', 'tolak', true, 1, 2)).toBe('perlu_perbaikan');
  });

  it('buildAvailableActions persetujuan_direksi: non-legal → paraf/tolak; legal tanpa baris BOD → kirim-lembar; legal dgn baris BOD → []', async () => {
    expect(await svc.buildAvailableActions('persetujuan_direksi', true, { positionId: 'POS_X' }, false, false)).toEqual(['paraf', 'tolak']);
    expect(await svc.buildAvailableActions('persetujuan_direksi', true, { positionText: 'Kabag Hukum' }, false, false)).toEqual(['kirim-lembar-persetujuan-direksi']);
    expect(await svc.buildAvailableActions('persetujuan_direksi', true, { positionText: 'Kabag Hukum' }, false, true)).toEqual([]);
  });

  it('signingTarget: N=0 → selesai, N>0 → tanda_tangan', () => {
    expect(svc.signingTarget(0)).toBe('selesai');
    expect(svc.signingTarget(3)).toBe('tanda_tangan');
  });

  it('nextAfterTtd tanda_tangan: idx<N tetap, idx>=N selesai', () => {
    expect(svc.nextAfterTtd('tanda_tangan', 1, 3)).toBe('tanda_tangan');
    expect(svc.nextAfterTtd('tanda_tangan', 3, 3)).toBe('selesai');
  });

  it('transisi kirim-approval-blanko: blanko_verbal → tanda_tangan + signingIndex=1', async () => {
    const naskah = { id: 'b1', tahapan: 'blanko_verbal', butuhLegal: true, penandatanganChain: [{ nama: 'A', jabatan: 'X' }, { nama: 'B', jabatan: 'Y' }], tanggal: new Date('2026-08-18') } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisi(naskah, 'kirim-approval-blanko', { aktor: 'Legal', jabatan: 'Kepala Unit Legal', manager: manager as any });
    expect(naskah.tahapan).toBe('tanda_tangan');
    expect(naskah.signingIndex).toBe(1);
    expect(manager.update).toHaveBeenCalled();
  });

  it('transisi kirim-blanko: blanko_verbal stays blanko_verbal', async () => {
    const naskah = { id: 'b2', tahapan: 'blanko_verbal', butuhLegal: true, penandatanganChain: [{ nama: 'A', jabatan: 'X' }, { nama: 'B', jabatan: 'Y' }], tanggal: new Date('2026-08-18') } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisi(naskah, 'kirim-blanko', { aktor: 'Legal', jabatan: 'Kepala Unit Legal', manager: manager as any });
    expect(naskah.tahapan).toBe('blanko_verbal');
    expect(naskah.signingIndex).toBeUndefined();
    expect(manager.update).toHaveBeenCalled();
  });

  it('transisiTandaTangan: idx<N → increment signingIndex', async () => {
    const naskah = { id: 's1', tahapan: 'tanda_tangan', signingIndex: 1, penandatanganChain: [{ nama: 'A', jabatan: 'X' }, { nama: 'B', jabatan: 'Y' }], tanggal: new Date('2026-08-18') } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisiTandaTangan(naskah, { aktor: 'A', jabatan: 'X', manager: manager as any });
    expect(naskah.tahapan).toBe('tanda_tangan');
    expect(naskah.signingIndex).toBe(2);
  });

  it('transisiTandaTangan: idx===N → selesai + signingIndex null', async () => {
    const naskah = { id: 's2', tahapan: 'tanda_tangan', signingIndex: 2, penandatanganChain: [{ nama: 'A', jabatan: 'X' }, { nama: 'B', jabatan: 'Y' }], tanggal: new Date('2026-08-18') } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisiTandaTangan(naskah, { aktor: 'B', jabatan: 'Y', manager: manager as any });
    expect(naskah.tahapan).toBe('selesai');
    expect(naskah.signingIndex).toBeNull();
  });

  it('buildStepper dinamis: N=2, signingIndex=1 → 2 sub-step signing', () => {
    const steps = svc.buildStepper('tanda_tangan', true, 2, 1);
    const signingSteps = steps.filter((s) => /Tanda Tangan Penandatangan/.test(s.label));
    expect(signingSteps.length).toBe(2);
    expect(signingSteps[0].status).toBe('active');
    expect(signingSteps[1].status).toBe('todo');
  });
});
