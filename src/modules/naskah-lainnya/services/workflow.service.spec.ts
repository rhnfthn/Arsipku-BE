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

  it('tolak → perlu_perbaikan', async () => {
    const naskah = { id: 'n4', tahapan: 'persetujuan', butuhLegal: true } as NaskahEntity;
    const approval = [{ id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' }] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a1', 'tolak', { aktor: 'Test', catatan: 'alasan', manager: manager as any });
    expect(next).toBe('perlu_perbaikan');
  });

  it('evaluasi tidak sesuai → perlu_perbaikan; sesuai → tanda_tangan_pemrakarsa', () => {
    expect(svc.nextAfterEvaluasi(true)).toBe('tanda_tangan_pemrakarsa');
    expect(svc.nextAfterEvaluasi(false)).toBe('perlu_perbaikan');
  });
});
