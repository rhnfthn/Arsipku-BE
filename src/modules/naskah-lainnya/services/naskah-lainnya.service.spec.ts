import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NaskahLainnyaService } from './naskah-lainnya.service';
import { WorkflowService } from './workflow.service';
import { DocxReaderService } from './docx-reader.service';
import { StorageService } from '../../storage/services/storage.service';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from '../entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from '../entities/naskah-lainnya-dokumen.entity';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

const repo = () => ({ find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn((e) => e), delete: jest.fn(), update: jest.fn() });

const workflowMock = {
  buildStepper: jest.fn(() => []),
  buildAvailableActions: jest.fn(() => []),
  transisi: jest.fn(),
  applyApproval: jest.fn(async () => 'persetujuan'),
  resolveNext: jest.fn((t) => t),
  nextAfterEvaluasi: jest.fn((s) => (s ? 'tanda_tangan_pemrakarsa' : 'perlu_perbaikan')),
};

const docxMock = { readParameters: jest.fn(async () => ({ nomor: 'PER.1/DS.00.02/2026', perihal: 'X', tanggal: '2026-08-11' })) };

const storageMock = {
  getFileUrl: jest.fn(async () => 'https://s3/x'),
  uploadBuffer: jest.fn(async () => 'key'),
  generateUniqueFileName: jest.fn(() => 'key'),
};

describe('NaskahLainnyaService', () => {
  let svc: NaskahLainnyaService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        NaskahLainnyaService,
        { provide: WorkflowService, useValue: workflowMock },
        { provide: DocxReaderService, useValue: docxMock },
        { provide: getRepositoryToken(NaskahEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaApprovalEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaRiwayatEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaBlankoEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaDokumenEntity), useValue: repo() },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb({ save: jest.fn((e) => e), update: jest.fn() })) } },
        { provide: StorageService, useValue: storageMock },
        { provide: LegalRoleService, useValue: { getActivePositionIds: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();
    svc = mod.get(NaskahLainnyaService);
  });

  it('getDetail mengembalikan shape kontrak (dokumen, approval, riwayat, stepper, availableActions)', async () => {
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', nomor: 'PER.1/DS.00.02/2026', jenis: 'PER', perihal: 'X',
      tanggal: new Date('2026-08-11'), createdAt: new Date('2026-08-11'),
      tahapan: 'persetujuan', butuhLegal: true,
      createdByPosition: 'Kabag Hukum',
      pemrakarsa: { nama: 'M Fakhri A' }, // disimpan di created_by (opsional)
    });
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', { positionText: 'Direktur Utama' } as any);
    expect(res).toMatchObject({ success: true });
    expect(res.data).toMatchObject({
      id: 'n1',
      tahapan: 'persetujuan',
      stepper: [],
      availableActions: [],
      dokumen: expect.any(Array),
      approval: expect.any(Array),
      riwayat: expect.any(Array),
    });
  });

  it('createDraft menyimpan naskah tahapan=konsep', async () => {
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.save.mockResolvedValue({ id: 'n9', tahapan: 'konsep' });
    const res = await svc.createDraft(
      { jenis: 'PER', butuhLegal: true, penandatangan: { nama: 'Ir. Ahmad Rizal', jabatan: 'Direktur Utama' } } as any,
      { persnum: '123', nama: 'M Fakhri A', positionText: 'Kabag Hukum' } as any,
    );
    expect(res.data.id).toBe('n9');
    expect(naskahRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tahapan: 'konsep', butuhLegal: true }));
  });

  it('uploadDokumen mengembalikan parameter hasil baca', async () => {
    (await svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n1', tanggal: new Date('2026-08-11'), perihal: 'X',
    });
    const res = await svc.uploadDokumen('n1', { buffer: Buffer.from('x'), originalname: 'a.docx' } as any, { persnum: '123', nama: 'Test' });
    expect(res.data.parameter).toEqual({ nomor: 'PER.1/DS.00.02/2026', perihal: 'X', tanggal: '2026-08-11' });
  });
});
