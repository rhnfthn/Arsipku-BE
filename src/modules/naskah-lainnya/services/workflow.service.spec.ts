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

  it('buildStepper: butuhLegal=false melewati Legal Drafting (skip)', () => {
    const steps = svc.buildStepper('evaluasi', false);
    expect(steps.find((s) => s.step === 3)?.status).toBe('skip');
    expect(steps.find((s) => s.step === 4)?.status).toBe('active');
  });

  it('transisi kirim: konsep → persetujuan, menulis riwayat + baris approval', async () => {
    const naskah = { id: 'n1', tahapan: 'konsep', butuhLegal: true, tanggal: new Date('2026-08-13') } as NaskahEntity;
    const manager = { save: jest.fn((e) => e), update: jest.fn() };
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

  it('legal_drafting: tolak → tetap legal_drafting + short-circuit baris waiting lain', async () => {
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

  it('buildAvailableActions legal_drafting: hasWaitingLegalRows=true → kosong (drafter tunggu approver)', async () => {
    const actions = await svc.buildAvailableActions('legal_drafting', true, { positionId: 'POS_LEGAL' }, true);
    expect(actions).toEqual([]);
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

  it('evaluasi tidak sesuai → perlu_perbaikan; sesuai → blanko_verbal (butuhLegal)', () => {
    expect(svc.nextAfterEvaluasi(true, true, 1)).toBe('blanko_verbal');
    expect(svc.nextAfterEvaluasi(false, true, 1)).toBe('perlu_perbaikan');
  });

  it('nextAfterEvaluasi sesuai + butuhLegal → blanko_verbal', () => {
    expect(svc.nextAfterEvaluasi(true, true, 2)).toBe('blanko_verbal');
  });

  it('nextAfterEvaluasi sesuai + !butuhLegal + N>0 → tanda_tangan', () => {
    expect(svc.nextAfterEvaluasi(true, false, 2)).toBe('tanda_tangan');
  });

  it('nextAfterEvaluasi sesuai + N=0 → selesai (skip signing)', () => {
    expect(svc.nextAfterEvaluasi(true, false, 0)).toBe('selesai');
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
