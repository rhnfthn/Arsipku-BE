import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NaskahLainnyaService } from './naskah-lainnya.service';
import { WorkflowService } from './workflow.service';
import { DocxReaderService } from './docx-reader.service';
import { DocxQrInlineService } from './docx-qr-inline.service';
import { QRCodeService } from '../../digsig/services/qrcode.service';
import { DocxFillerService } from '../../naskah-umum/services/docx-filler.service';
import { StorageService } from '../../storage/services/storage.service';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahLainnyaBlankoEntity } from '../entities/naskah-lainnya-blanko.entity';
import { NaskahLainnyaDokumenEntity } from '../entities/naskah-lainnya-dokumen.entity';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';
import { NomorService } from '../../nomor/services/nomor.service';
import { GeneratePdfLpdService } from '../../generate_pdf/services/generate_pdf_lpd.service';
import { GeneratePdfBlankoVerbalService } from '../../generate_pdf/services/generate_pdf_blanko_verbal.service';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

const repo = () => ({ find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn((e) => e), delete: jest.fn(), update: jest.fn() });

const workflowMock = {
  buildStepper: jest.fn(() => []),
  buildAvailableActions: jest.fn(() => []),
  transisi: jest.fn(),
  transisiTandaTangan: jest.fn(),
  applyApproval: jest.fn(async () => 'persetujuan'),
  resolveNext: jest.fn((t, aksi) => {
    if (t === 'evaluasi' && aksi === 'setuju') return 'persetujuan_direksi';
    if (t === 'evaluasi' && aksi === 'tolak') return 'perlu_perbaikan';
    return t;
  }),
  effectiveSignerCount: jest.fn((n: any) =>
    n.penandatanganChain?.length ? n.penandatanganChain.length : (n.penandatanganPositionId != null || n.atasNama ? 1 : 0)),
  buatApprovalLegalDrafting: jest.fn(),
};

const docxMock = { readParameters: jest.fn(async () => ({ perihal: 'X', tanggal: '2026-08-11' })) };

const storageMock = {
  getFileUrl: jest.fn(async () => 'https://s3/x'),
  getFile: jest.fn(async () => Buffer.from('x')),
  uploadBuffer: jest.fn(async () => ({ key: 'key', url: 'https://s3/x', bucket: 'b' })),
  generateUniqueFileName: jest.fn(() => 'key'),
};

const orgDataMock = {
  findAll: jest.fn(async () => []),
  findLatestOrg: jest.fn(async () => ({ position_json: [] })),
  findBodByCompany: jest.fn(() => [
    { positionId: 'POS_DIR1', nama: 'Direktur Satu', jabatan: 'Direktur Operasi' },
    { positionId: 'POS_DIR2', nama: 'Direktur Dua', jabatan: 'Direktur Utama' },
  ]),
};

const qrCodeMock = {
  generateQRCodePngBuffer: jest.fn(async () => Buffer.from('qr')),
};

describe('NaskahLainnyaService', () => {
  let svc: NaskahLainnyaService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        NaskahLainnyaService,
        { provide: WorkflowService, useValue: workflowMock },
        { provide: DocxReaderService, useValue: docxMock },
        { provide: DocxQrInlineService, useValue: {} },
        { provide: QRCodeService, useValue: qrCodeMock },
        { provide: DocxFillerService, useValue: { fill: jest.fn() } },
        { provide: GeneratePdfLpdService, useValue: { render: jest.fn(async () => Buffer.from('pdf')) } },
        { provide: GeneratePdfBlankoVerbalService, useValue: { render: jest.fn(async () => Buffer.from('pdf')) } },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: getRepositoryToken(NaskahEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaApprovalEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaRiwayatEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaBlankoEntity), useValue: repo() },
        { provide: getRepositoryToken(NaskahLainnyaDokumenEntity), useValue: repo() },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb({ save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() })) } },
        { provide: StorageService, useValue: storageMock },
        { provide: LegalRoleService, useValue: { getActivePositionIds: jest.fn().mockResolvedValue([]) } },
        { provide: NomorService, useValue: { generateNomorForNaskah: jest.fn().mockResolvedValue({ nomor: 'PER.001/LPPNPI/I/2026', noUrut: 1 }) } },
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

  // ── kembalikanEvaluasi: kembalikan naskah dari evaluasi ke legal_drafting ──
  it('kembalikanEvaluasi: transisi kembalikan-evaluasi + hapus baris approval legal_drafting', async () => {
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', nomor: 'PER.1', jenis: 'PER', perihal: 'X',
      tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
      tahapan: 'evaluasi', butuhLegal: true,
    });
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (await svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    workflowMock.transisi.mockClear();

    await svc.kembalikanEvaluasi('n1', 'revisi pasal 3', { nama: 'Pemrakarsa', positionText: 'Kabag' } as any);

    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(), 'kembalikan-evaluasi', expect.objectContaining({ catatan: 'revisi pasal 3' }),
    );
    expect(txManager.delete).toHaveBeenCalledWith(NaskahLainnyaApprovalEntity, { naskahId: 'n1', tahap: 'legal_drafting' });
  });

  it('kembalikanEvaluasi: validasi — tahapan bukan evaluasi / !butuhLegal / catatan kosong → BadRequest', async () => {
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', tahapan: 'persetujuan', butuhLegal: true, tanggal: new Date('2026-08-18') });
    await expect(svc.kembalikanEvaluasi('n1', 'alasan', { nama: 'X' } as any)).rejects.toThrow();
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', tahapan: 'evaluasi', butuhLegal: false, tanggal: new Date('2026-08-18') });
    await expect(svc.kembalikanEvaluasi('n1', 'alasan', { nama: 'X' } as any)).rejects.toThrow();
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', tahapan: 'evaluasi', butuhLegal: true, tanggal: new Date('2026-08-18') });
    await expect(svc.kembalikanEvaluasi('n1', '   ', { nama: 'X' } as any)).rejects.toThrow();
  });

  // ── POV approval: legal hanya lihat legal_drafting, pemrakarsa hanya persetujuan ──
  const naskahPov = {
    id: 'n1', nomor: 'PER.1', jenis: 'PER', perihal: 'X',
    tanggal: new Date('2026-08-11'), createdAt: new Date('2026-08-11'),
    tahapan: 'legal_drafting', butuhLegal: true, dikirimOleh: { position_id: 'POS_PEM' },
  };
  const approvalPovRows = [
    { id: 'a1', naskahId: 'n1', tahap: 'persetujuan', nama: 'Pemrakarsa Approver', jabatan: 'Kabag',
      urutan: 1, status: 'verified' },
    { id: 'a2', naskahId: 'n1', tahap: 'legal_drafting', nama: 'Legal Approver', jabatan: 'Legal',
      urutan: 1, status: 'waiting' },
  ];

  it('getDetail POV legal: approvalByTahap hanya legal_drafting (flat approval tetap utuh)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    (await svc as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    (await svc as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', { positionId: 'POS_LEGAL', nama: 'Legal' } as any);
    expect(Object.keys(res.data.approvalByTahap)).toEqual(['legal_drafting']);
    // Flat approval tetap utuh untuk logic aksi FE.
    expect(res.data.approval.map((a: any) => a.tahap)).toEqual(expect.arrayContaining(['persetujuan', 'legal_drafting']));
  });

  it('getDetail POV pemrakarsa: approvalByTahap hanya persetujuan', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    (await svc as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    (await svc as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', { positionId: 'POS_PEM', nama: 'Pemrakarsa' } as any);
    expect(Object.keys(res.data.approvalByTahap)).toEqual(['persetujuan']);
  });

  it('getDetail POV lain (bukan legal/pemrakarsa): approvalByTahap semua tahap', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    (await svc as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    (await svc as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', { positionId: 'POS_TTD', nama: 'Pejabat' } as any);
    expect(Object.keys(res.data.approvalByTahap).sort()).toEqual(['legal_drafting', 'persetujuan']);
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

  it('updateDraft: WHEN tanggal berubah, WHERE pakai tanggal ASLI + patch tanggal baru & penandatangan (regresi PK)', async () => {
    // Bug lama: n.tanggal dimutasi ke tanggal baru LALU dipakai di WHERE → 0 row
    // ter-update → penandatangan/tanggal tidak tersimpan. tanggal bagian PK (id, tanggal).
    const naskahRepo = (await svc as any).naskahRepo;
    const tOld = new Date('2026-08-01');
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', jenis: 'PER', tahapan: 'konsep', tanggal: tOld, createdAt: new Date('2026-08-01'),
    });
    naskahRepo.update.mockResolvedValue({});
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    await svc.updateDraft('n1', {
      tanggal: '2026-08-20',
      penandatangan: { nama: 'Budi', jabatan: 'Direktur' },
      signOption: 'qr_only',
    } as any);
    const [whereArgs, patch] = (naskahRepo.update as jest.Mock).mock.calls[0];
    // WHERE harus pakai tanggal ASLI (DB), bukan tanggal baru — kalau tidak row hilang.
    expect(whereArgs).toEqual({ id: 'n1', tanggal: tOld });
    // Patch harus berisi tanggal baru (update kolom PK) + penandatanganChain + legacy atasNama.
    expect(patch.tanggal).toEqual(new Date('2026-08-20'));
    expect(patch.penandatanganChain).toEqual([{ positionId: undefined, persnum: undefined, nama: 'Budi', jabatan: 'Direktur' }]);
    expect(patch.atasNama).toBe('Budi');
  });

  it('uploadDokumen mengembalikan parameter hasil baca', async () => {
    (await svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n1', tanggal: new Date('2026-08-11'), perihal: 'X',
    });
    const res = await svc.uploadDokumen('n1', { buffer: Buffer.from('x'), originalname: 'a.docx' } as any, { persnum: 123, nama: 'Test' });
    expect(res.data.parameter).toEqual({ perihal: 'X', tanggal: '2026-08-11' });
  });

  // ── Helper: query builder mock (chain returns `rows` via getMany, `rawRows` via getRawMany) ──
  const makeQb = (rows: any[] = [], rawRows: any[] = []) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  });

  it('getLegalDrafting: default status belum-dikirim → base query (legal_drafting+PD+BV), tanpa sub-filter', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'legal_drafting', butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa A' }, perihal: 'Perihal', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
      { id: 'n2', nomor: 'BA.1', jenis: 'BA', tahapan: 'blanko_verbal', butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa B' }, perihal: 'BA', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data.map((d: any) => d.tahapan)).toEqual(expect.arrayContaining(['legal_drafting', 'blanko_verbal']));
    // Base clause memasukkan persetujuan_direksi & blanko_verbal.
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(':bv'),
      expect.objectContaining({ bv: 'blanko_verbal', pd: 'persetujuan_direksi' }),
    );
    // Tidak ada sub-filter NOT EXISTS (filter statusLegal client-side).
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=menunggu → base query, tanpa sub-filter EXISTS waiting', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'menunggu');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    // Base query tetap (mencakup PD & BV), tanpa sub-filter EXISTS waiting.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(true);
    expect(calls.some((s) => s.includes("status = 'waiting'"))).toBe(false);
  });

  it('getLegalDrafting: status=revisi → base query, tanpa sub-filter EXISTS rejected', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'revisi');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    // Base query tetap, tanpa sub-filter EXISTS rejected / NOT EXISTS waiting.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(true);
    expect(calls.some((s) => s.includes("'rejected'"))).toBe(false);
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=semua → base clause saja, tanpa sub-filter waiting/rejected', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    // base clause (legal_drafting OR blanko_verbal) tetap dipakai.
    expect(calls.some((s) => s.includes(':bv'))).toBe(true);
    // tidak ada sub-filter status (waiting/rejected/NOT EXISTS legal_drafting row).
    expect(calls.some((s) => s.includes("'waiting'") || s.includes("'rejected'"))).toBe(false);
  });

  it('getLegalDrafting: statusLegal per-row — legal_drafting no rows → belum_dikirim, blanko_verbal (no BOD rows) → belum_dikirim', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'legal_drafting', butuhLegal: true,
        pemrakarsa: { nama: 'A' }, perihal: 'p', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
      { id: 'n2', nomor: 'BA.1', jenis: 'BA', tahapan: 'blanko_verbal', butuhLegal: true,
        pemrakarsa: { nama: 'B' }, perihal: 'b', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    const byId = Object.fromEntries(res.data.map((d: any) => [d.id, d.statusLegal]));
    expect(byId['n1']).toBe('belum_dikirim');
    expect(byId['n2']).toBe('belum_dikirim');
  });

  it('getLegalDrafting: blanko_verbal dengan baris BOD waiting → menunggu_persetujuan, all verified → sudah_dikerjakan', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n3', nomor: 'BA.2', jenis: 'BA', tahapan: 'blanko_verbal', butuhLegal: true,
        pemrakarsa: { nama: 'C' }, perihal: 'c', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
      { id: 'n4', nomor: 'BA.3', jenis: 'BA', tahapan: 'blanko_verbal', butuhLegal: true,
        pemrakarsa: { nama: 'D' }, perihal: 'd', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (await svc as any).approvalRepo.find.mockResolvedValue([
      { naskahId: 'n3', tahap: 'blanko_verbal', status: 'waiting' },
      { naskahId: 'n4', tahap: 'blanko_verbal', status: 'verified' },
    ]);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    const byId = Object.fromEntries(res.data.map((d: any) => [d.id, d.statusLegal]));
    expect(byId['n3']).toBe('menunggu_persetujuan');
    expect(byId['n4']).toBe('sudah_dikerjakan');
  });

  it('getLegalDrafting: persetujuan_direksi (aksi-saya) dengan waiting → menunggu_persetujuan', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n5', nomor: 'PER.2', jenis: 'PER', tahapan: 'persetujuan_direksi', butuhLegal: true,
        pemrakarsa: { nama: 'E' }, perihal: 'e', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (await svc as any).approvalRepo.find.mockResolvedValue([
      { naskahId: 'n5', tahap: 'persetujuan_direksi', status: 'waiting' },
    ]);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    expect(res.data[0].statusLegal).toBe('menunggu_persetujuan');
  });

  it('getLegalDrafting: persetujuan_direksi tanpa baris BOD (belum kirim lembar) → belum_dikirim', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n6', nomor: 'PER.3', jenis: 'PER', tahapan: 'persetujuan_direksi', butuhLegal: true,
        pemrakarsa: { nama: 'F' }, perihal: 'f', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    expect(res.data[0].statusLegal).toBe('belum_dikirim');
  });

  it('getLegalDrafting: dikembalikan dari evaluasi (legal_drafting, no rows, riwayat terakhir kembalikan-evaluasi) → statusLegal revisi', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'legal_drafting', butuhLegal: true,
        pemrakarsa: { nama: 'A' }, perihal: 'p', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (await svc as any).approvalRepo.find.mockResolvedValue([]); // baris legal dihapus
    // Riwayat terbaru = kembalikan-evaluasi (order DESC → elemen pertama = terbaru).
    (await svc as any).riwayatRepo.find.mockResolvedValue([
      { naskahId: 'n1', aksi: 'kembalikan-evaluasi', createdAt: new Date('2026-08-19') },
      { naskahId: 'n1', aksi: 'kirim-approval-legal', createdAt: new Date('2026-08-18') },
    ]);
    const res = await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'semua');
    expect(res.data[0].statusLegal).toBe('revisi');
  });

  it('getLegalDrafting: status=revisi → base query mencakup persetujuan_direksi & blanko_verbal (sub-filter client-side)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'revisi');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    // Base query tahapan mencakup legal_drafting, persetujuan_direksi, blanko_verbal.
    const baseClause = calls.find((s) => s.includes(':pd') && s.includes(':bv'));
    expect(baseClause).toBeDefined();
    // Tidak ada sub-filter NOT EXISTS / kembalikan-evaluasi (filter statusLegal client-side).
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
    expect(calls.some((s) => s.includes("'kembalikan-evaluasi'"))).toBe(false);
  });

  it('getLegalDrafting: status invalid → fallback base query (tanpa sub-filter NOT EXISTS)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'nonsense');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    // Fallback ke base query (legal_drafting/persetujuan_direksi/blanko_verbal), tanpa NOT EXISTS.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(true);
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=aksi-saya → EXISTS riwayat aktor=me, aksi IN legal-drafter actions, tanpa filter tahapan', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Andi Legal' } as any, 'aksi-saya');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/EXISTS[\s\S]*naskah_lainnya_riwayat[\s\S]*r\.aktor = :aktor[\s\S]*r\.aksi IN \(:\.\.\.aksiSaya\)/),
      expect.objectContaining({ aktor: 'Andi Legal', aksiSaya: ['mulai-legal', 'kirim-approval-legal', 'kembalikan-legal', 'kirim-approval-blanko'] }),
    );
    // aksi-saya tidak memakai filter tahapan legal_drafting/blanko_verbal (naskah bisa sudah lanjut).
    const tahapanCalls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string' && s.includes(':bv'));
    expect(tahapanCalls).toHaveLength(0);
  });

  it('getLegalDrafting: non-legal user → throws Forbidden', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    await expect(
      svc.getLegalDrafting({ positionId: 'POS_OTHER', nama: 'X' } as any),
    ).rejects.toThrow();
  });

  it('getPersetujuan: tidak lagi memanggil legalRoleService (block legal_drafting dihapus)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const approvalRepo = (await svc as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const res = await svc.getPersetujuan({ positionId: 'POS_LEGAL', nama: 'Legal' } as any);
    expect(legalRole.getActivePositionIds).not.toHaveBeenCalled();
    expect(res.data).toEqual([]);
  });

  it('getPersetujuan(status=disetujui): returns naskah where user approval = setuju', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n1' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'selesai', butuhLegal: false,
        pemrakarsa: { nama: 'A' }, perihal: 'p', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any, 'disetujui');
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n1' });
    expect(aqb.setParameters).toHaveBeenCalledWith(expect.objectContaining({ status: 'setuju' }));
  });

  it('getPersetujuan(disetujui): termasuk naskah selesai yang user tandatangani (penandatangan, bukan approver)', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    // User bukan approver → tidak ada baris approval setuju (riwayat query kosong).
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n-ttd', nomor: 'PER.TTD', jenis: 'PER', tahapan: 'selesai', butuhLegal: false,
        pemrakarsa: { nama: 'Pem' }, perihal: 'ditandatangani', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_SIGNER', nama: 'Signer' } as any, 'disetujui');
    // Naskah selesai muncul di "Disetujui" walau user tidak punya baris approval
    // (penandatangan disimpan di penandatangan_chain, bukan tabel approval).
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-ttd', tahapan: 'selesai' });
  });

  it('getPersetujuan(status=ditolak): maps filter ke approval status tolak', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n2' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n2', nomor: 'KEP.1', jenis: 'KEP', tahapan: 'perlu_perbaikan', butuhLegal: false,
        pemrakarsa: { nama: 'B' }, perihal: 'p2', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any, 'ditolak');
    expect(res.data).toHaveLength(1);
    expect(aqb.setParameters).toHaveBeenCalledWith(expect.objectContaining({ status: 'tolak' }));
  });

  it('getPersetujuan(status=semua): gabung waiting + setuju + tolak (dedupe by id)', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n1' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'persetujuan', butuhLegal: false,
        pemrakarsa: { nama: 'A' }, perihal: 'p', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any, 'semua');
    // 'semua' memanggil getNaskahIdsForApproverStatus untuk waiting (antrian) + setuju + tolak (riwayat).
    const statusArgs = (aqb.setParameters as jest.Mock).mock.calls.map((c) => c[0]?.status);
    expect(statusArgs).toEqual(expect.arrayContaining(['waiting', 'setuju', 'tolak']));
    // Dedupe by id → satu baris n1 meski ketiga himpunan overlap di mock.
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n1' });
  });

  it('getPersetujuan(status tak dikenal) → fallback menunggu', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], []);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any, 'nonsense');
    expect(res.data).toEqual([]);
    expect(aqb.setParameters).toHaveBeenCalledWith(expect.objectContaining({ status: 'waiting' }));
  });

  it('getPersetujuan(menunggu): berjenjang — query approval menambah gate urutan MIN', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n3' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n3', nomor: 'PER.3', jenis: 'PER', tahapan: 'persetujuan', butuhLegal: false,
        pemrakarsa: { nama: 'C' }, perihal: 'p3', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any);
    const andWhereCalls = (aqb.andWhere as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(andWhereCalls.some((s) => s.includes('MIN(a2.urutan)'))).toBe(true);
  });

  it('getPersetujuan(menunggu): persetujuan_direksi & blanko_verbal masuk antrian paraf direksi', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n-pd' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    const nqb = makeQb([
      { id: 'n-pd', nomor: 'PER.PD', jenis: 'PER', tahapan: 'persetujuan_direksi', butuhLegal: false,
        pemrakarsa: { nama: 'Dir' }, perihal: 'pd', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(nqb);
    const res = await svc.getPersetujuan({ positionId: 'POS_DIR', nama: 'Direktur Satu' } as any);
    // Naskah PD muncul di antrian "Menunggu" untuk direksi (baris waiting).
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-pd' });
    // Filter tahapan part 1 kini termasuk paraf direksi (parallel, urutan=1 lolos gate berjenjang).
    const tParam = (nqb.andWhere as jest.Mock).mock.calls
      .map((c) => c[1]).find((p) => p && Array.isArray(p.t));
    expect(tParam.t).toEqual(expect.arrayContaining(['persetujuan_direksi', 'blanko_verbal']));
  });

  it('getPersetujuan(menunggu): naskah tanda_tangan di mana user adalah signer AKTIF muncul di antrian', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], [])); // user bukan approver
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n-ttd', nomor: 'PER.TTD', jenis: 'PER', tahapan: 'tanda_tangan', butuhLegal: false,
        pemrakarsa: { nama: 'Pem' }, perihal: 'multi-signer', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
        signingIndex: 2, penandatanganChain: [
          { positionId: 'POS_OTHER', nama: 'Signer 1', jabatan: 'Dir 1' },
          { positionId: 'POS_X', nama: 'User', jabatan: 'Dir 2' }, // user = signer ke-2, giliran-nya sekarang
        ] },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'User' } as any, 'menunggu');
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-ttd' });
  });

  it('getPersetujuan(menunggu): naskah tanda_tangan yang SUDAH ditandatangani user (bukan signer aktif) TIDAK muncul', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], [])); // user bukan approver
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n-ttd', nomor: 'PER.TTD', jenis: 'PER', tahapan: 'tanda_tangan', butuhLegal: false,
        pemrakarsa: { nama: 'Pem' }, perihal: 'multi-signer', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
        // user = signer ke-2, tapi giliran masih signer ke-1 → user sudah/belum giliran? di sini
        // signingIndex=1 menunjuk signer 1, user (POS_X) bukan signer aktif.
        signingIndex: 1, penandatanganChain: [
          { positionId: 'POS_OTHER', nama: 'Signer 1', jabatan: 'Dir 1' },
          { positionId: 'POS_X', nama: 'User', jabatan: 'Dir 2' },
        ] },
    ]));
    const res = await svc.getPersetujuan({ positionId: 'POS_X', nama: 'User' } as any, 'menunggu');
    // User belum giliran (signingIndex=1 → signer 1) → tidak muncul di "Menunggu".
    expect(res.data).toEqual([]);
  });

  it('getPersetujuan(disetujui): berjenjang — query riwayat TIDAK menambah gate urutan', async () => {
    const approvalRepo = (await svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n4' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([
      { id: 'n4', nomor: 'PER.4', jenis: 'PER', tahapan: 'selesai', butuhLegal: false,
        pemrakarsa: { nama: 'D' }, perihal: 'p4', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]));
    await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any, 'disetujui');
    const andWhereCalls = (aqb.andWhere as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(andWhereCalls.some((s) => s.includes('MIN(a2.urutan)'))).toBe(false);
  });

  it('getList: legal-role user → exclude legal_drafting & blanko_verbal dari Daftar', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([
      { id: 'n1', nomor: 'PER.1', jenis: 'PER', tahapan: 'persetujuan', butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa A' }, perihal: 'Perihal', tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18') },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    const res = await svc.getList({}, { positionId: 'POS_LEGAL', nama: 'Legal', positionText: 'Legal' } as any);
    expect(res.success).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'n.tahapan NOT IN (:...ex)',
      expect.objectContaining({ ex: ['legal_drafting', 'blanko_verbal'] }),
    );
  });

  it('getList: non-legal user → tidak exclude legal_drafting/blanko_verbal (tetap lihat naskahnya di Daftar)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getList({}, { positionId: 'POS_OTHER', nama: 'X', positionText: 'Other' } as any);
    const notInCalls = (qb.andWhere as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === 'n.tahapan NOT IN (:...ex)',
    );
    expect(notInCalls).toHaveLength(0);
  });

  it('getList: filter pemrakarsa pakai position_id/persnum, BUKAN created_by_position (anti-leak antar user dengan jabatan sama)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getList({}, { positionId: 'POS_LEGAL', persnum: 10011066, nama: 'Legal', positionText: 'Staf Administrasi' } as any);
    const pemrakarsaCalls = (qb.andWhere as jest.Mock).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('dikirim_oleh'),
    );
    expect(pemrakarsaCalls.length).toBeGreaterThan(0);
    const sql = pemrakarsaCalls[0][0] as string;
    expect(sql).not.toContain('created_by_position'); // jangan match by jabatan text (bocor)
    expect(sql).toContain(':persnum');
    expect(pemrakarsaCalls[0][1]).toEqual(expect.objectContaining({ persnum: 10011066 }));
  });

  it('kirimApprovalLegal: legal user + approval array → seed baris legal_drafting via workflow, tetap legal_drafting', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', jenis: 'PER', nomor: 'PER.1', perihal: 'p', tahapan: 'legal_drafting', butuhLegal: true, tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'), penandatanganChain: [] });
    (await svc as any).approvalRepo.find.mockResolvedValue([]);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    const approval = [{ positionId: 'P2', nama: 'Legal B', jabatan: 'Staff Legal' }];
    const res = await svc.kirimApprovalLegal('n1', approval, { positionId: 'POS_LEGAL', nama: 'Drafter', positionText: 'Kabag Hukum' } as any);
    expect(workflowMock.buatApprovalLegalDrafting).toHaveBeenCalled();
    // argumen ketiga = array approval (urutan dipertahankan)
    const call = (workflowMock.buatApprovalLegalDrafting as jest.Mock).mock.calls[0];
    expect(call[2]).toEqual(approval);
    expect(res.success).toBe(true);
  });

  it('kirimApprovalLegal: non-legal user → Forbidden', async () => {
    (workflowMock.buatApprovalLegalDrafting as jest.Mock).mockClear();
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', jenis: 'PER', nomor: 'PER.1', perihal: 'p', tahapan: 'legal_drafting', butuhLegal: true, tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'), penandatanganChain: [] });
    await expect(
      svc.kirimApprovalLegal('n1', [{ positionId: 'P2', nama: 'X', jabatan: 'Y' }], { positionId: 'POS_OTHER', nama: 'Z' } as any),
    ).rejects.toThrow();
    expect(workflowMock.buatApprovalLegalDrafting).not.toHaveBeenCalled();
  });

  it('kirimApprovalLegal: approval kosong → BadRequest', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', jenis: 'PER', nomor: 'PER.1', perihal: 'p', tahapan: 'legal_drafting', butuhLegal: true, tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'), penandatanganChain: [] });
    await expect(
      svc.kirimApprovalLegal('n1', [], { positionId: 'POS_LEGAL', nama: 'Drafter' } as any),
    ).rejects.toThrow();
  });

  it('getDetail: hasWaitingLegalRows diteruskan ke buildAvailableActions (sembunyikan kirim-approval-legal)', async () => {
    const naskahRepo = (await svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({ id: 'n1', jenis: 'PER', nomor: 'PER.1', perihal: 'p', tahapan: 'legal_drafting', butuhLegal: true, tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'), penandatanganChain: [] });
    const approvalRepo = (await svc as any).approvalRepo;
    approvalRepo.find.mockResolvedValue([
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'waiting', nama: 'Legal A', jabatan: 'X', catatan: null, tanggal: null },
    ]);
    (await svc as any).riwayatRepo.find.mockResolvedValue([]);
    (await svc as any).blankoRepo.find.mockResolvedValue([]);
    (await svc as any).dokumenRepo.find.mockResolvedValue([]);
    await svc.getDetail('n1', { positionId: 'POS_LEGAL', nama: 'Drafter', positionText: 'Kabag Hukum' } as any);
    const args = (workflowMock.buildAvailableActions as jest.Mock).mock.calls.at(-1);
    expect(args?.[3]).toBe(true); // hasWaitingLegalRows
  });

  it('catatVersiNaskah menyimpan baris history dengan status sesuai tahapan', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    dokumenRepo.save.mockResolvedValue({});
    await (svc as any).catatVersiNaskah(
      'n1', 'perlu_perbaikan', 'k1', 'rev.docx', 'application/x', 10,
      { persnum: 5, nama: 'Sari', positionText: 'Legal' } as any,
    );
    expect(dokumenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      naskahId: 'n1', tipe: 'naskah', minioKey: 'k1', nama: 'rev.docx',
      tahapan: 'perlu_perbaikan', status: 'revisi',
      uploaderNama: 'Sari', uploaderJabatan: 'Legal', uploaderPersnum: 5,
    }));
  });

  it('mapStatusUpload: konsep→draf, legal_drafting→draf, perlu_perbaikan→revisi, null→draf', () => {
    const m = (svc as any).mapStatusUpload.bind(svc);
    expect(m('konsep')).toBe('draf');
    expect(m('legal_drafting')).toBe('draf');
    expect(m('perlu_perbaikan')).toBe('revisi');
    expect(m(null)).toBe('draf');
  });

  it('uploadDokumen mencatat baris history naskah (tipe=naskah, fase, status, uploader)', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', jenis: 'PER', tahapan: 'konsep', tanggal: new Date('2026-08-11'),
    });
    naskahRepo.update.mockResolvedValue({});
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    dokumenRepo.save.mockResolvedValue({});
    const file = {
      originalname: 'draft.docx', buffer: Buffer.from('x'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 10,
    } as any;
    await svc.uploadDokumen('n1', file, { persnum: 1, nama: 'Budi', positionText: 'Kabag' } as any);
    expect(dokumenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      // nama kanonik dari buildNaskahFileName(perihal, jenis, naskahId) — bukan originalname.
      naskahId: 'n1', tipe: 'naskah', nama: 'x-n1.docx',
      tahapan: 'konsep', status: 'draf',
      uploaderNama: 'Budi', uploaderJabatan: 'Kabag', uploaderPersnum: 1,
    }));
  });

  it('getDetail menampilkan versi naskah dari baris tipe=naskah urut DESC', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', jenis: 'PER', tahapan: 'selesai', lampiran: 'k1', signedLampiran: 's1',
      tanggal: new Date('2026-08-11'), createdAt: new Date('2026-08-11'),
    });
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockReset();
    dokumenRepo.find
      .mockResolvedValueOnce([
        { id: 'v2', naskahId: 'n1', tipe: 'naskah', nama: 'v2.docx', minioKey: 'k2',
          mimetype: 'x', ukuran: 10, tahapan: 'legal_drafting', status: 'draf',
          uploaderNama: 'Sari', uploaderJabatan: 'Legal', uploaderPersnum: 9,
          createdAt: new Date('2026-08-12') },
        { id: 'v1', naskahId: 'n1', tipe: 'naskah', nama: 'v1.docx', minioKey: 'k1',
          mimetype: 'x', ukuran: 8, tahapan: 'konsep', status: 'draf',
          uploaderNama: 'Budi', uploaderJabatan: 'Kabag', uploaderPersnum: 1,
          createdAt: new Date('2026-08-11') },
      ])
      .mockResolvedValueOnce([]); // fisik/pendukung
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', { positionText: 'X' } as any);
    const naskahDocs = res.data.dokumen.filter((d: any) => d.tipe === 'naskah');
    expect(naskahDocs).toHaveLength(2);
    expect(naskahDocs[0].id).toBe('v2'); // DESC: v2 (Aug 12) dulu
    expect(naskahDocs[0]).toMatchObject({ uploaderNama: 'Sari', fase: 'legal_drafting', status: 'draf' });
  });

  it('getDetail: revisi legal — hanya naskah legal_drafting TERAKHIR yang tampil, versi legal_drafting sebelumnya disembunyikan', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', jenis: 'PER', tahapan: 'legal_drafting', lampiran: 'k3',
      tanggal: new Date('2026-08-11'), createdAt: new Date('2026-08-11'),
    });
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockReset();
    dokumenRepo.find
      .mockResolvedValueOnce([
        { id: 'v3', naskahId: 'n1', tipe: 'naskah', nama: 'rev2.docx', minioKey: 'k3',
          mimetype: 'x', ukuran: 12, tahapan: 'legal_drafting', status: 'draf',
          uploaderNama: 'Sari', uploaderJabatan: 'Legal', uploaderPersnum: 9,
          createdAt: new Date('2026-08-13') },
        { id: 'v2', naskahId: 'n1', tipe: 'naskah', nama: 'rev1.docx', minioKey: 'k2',
          mimetype: 'x', ukuran: 10, tahapan: 'legal_drafting', status: 'draf',
          uploaderNama: 'Sari', uploaderJabatan: 'Legal', uploaderPersnum: 9,
          createdAt: new Date('2026-08-12') },
        { id: 'v1', naskahId: 'n1', tipe: 'naskah', nama: 'konsep.docx', minioKey: 'k1',
          mimetype: 'x', ukuran: 8, tahapan: 'konsep', status: 'draf',
          uploaderNama: 'Budi', uploaderJabatan: 'Kabag', uploaderPersnum: 1,
          createdAt: new Date('2026-08-11') },
      ])
      .mockResolvedValueOnce([]); // fisik/pendukung
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', { positionText: 'X' } as any);
    const naskahDocs = res.data.dokumen.filter((d: any) => d.tipe === 'naskah');
    // v3 (revisi final) + v1 (konsep) tampil; v2 (legal_drafting pra-revisi) disembunyikan.
    expect(naskahDocs.map((d: any) => d.id)).toEqual(['v3', 'v1']);
    expect(naskahDocs[0]).toMatchObject({ fase: 'legal_drafting' });
    expect(naskahDocs[1]).toMatchObject({ fase: 'konsep' });
  });

  it('getDetail fallback: tanpa baris naskah tapi n.lampiran ada → 1 node legacy', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', jenis: 'PER', tahapan: 'selesai',
      lampiran: 'naskah-lainnya/PER/n1/naskah/legacy.docx', signedLampiran: null,
      tanggal: new Date('2026-08-11'), createdAt: new Date('2026-08-11'),
    });
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockReset();
    dokumenRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', { positionText: 'X' } as any);
    const naskahDocs = res.data.dokumen.filter((d: any) => d.tipe === 'naskah');
    expect(naskahDocs).toHaveLength(1);
    expect(naskahDocs[0]).toMatchObject({ status: 'final' });
    expect(naskahDocs[0].nama).toBe('legacy.docx');
  });

  it('deleteDokumenTambahan menolak hapus baris tipe=naskah (riwayat immutable)', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.findOne.mockResolvedValue({ id: 'd1', naskahId: 'n1', tipe: 'naskah', minioKey: 'k1' });
    await expect(svc.deleteDokumenTambahan('n1', 'd1')).rejects.toThrow(
      'Riwayat naskah tidak dapat dihapus per versi',
    );
  });

  it('upsertDittdRow insert bila belum ada row dittd, update bila sudah ada', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    // case 1: no existing → insert (save dipanggil)
    dokumenRepo.findOne.mockResolvedValueOnce(null);
    dokumenRepo.save.mockResolvedValue({});
    await (svc as any).upsertDittdRow('n1', 'signed-1', { persnum: 2, nama: 'Andi', positionText: 'Dir' } as any);
    expect(dokumenRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      naskahId: 'n1', tipe: 'naskah', status: 'dittd', minioKey: 'signed-1', uploaderNama: 'Andi',
    }));
    // case 2: existing → update (update dipanggil, save tidak)
    dokumenRepo.findOne.mockResolvedValueOnce({ id: 'row1', naskahId: 'n1', tipe: 'naskah', status: 'dittd' });
    dokumenRepo.update.mockResolvedValue({});
    await (svc as any).upsertDittdRow('n1', 'signed-2', { persnum: 3, nama: 'Budi', positionText: 'Dir2' } as any);
    expect(dokumenRepo.update).toHaveBeenCalledWith('row1', expect.objectContaining({
      minioKey: 'signed-2', uploaderNama: 'Budi',
    }));
  });

  it('deleteDraft menghapus MinIO key semua baris naskah + dokumenRepo.delete', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1', tahapan: 'konsep', tanggal: new Date('2026-08-11'),
      lampiran: 'k-main', signedLampiran: null,
    });
    naskahRepo.delete.mockResolvedValue({});
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockResolvedValue([
      { id: 'd1', naskahId: 'n1', tipe: 'naskah', minioKey: 'k1' },
      { id: 'd2', naskahId: 'n1', tipe: 'naskah', minioKey: 'k-main' }, // sama dengan lampiran
    ]);
    (svc as any).approvalRepo.delete.mockResolvedValue({});
    (svc as any).riwayatRepo.delete.mockResolvedValue({});
    (svc as any).blankoRepo.delete.mockResolvedValue({});
    const storage = (svc as any).storage;
    storage.deleteFile = jest.fn().mockResolvedValue({});

    await svc.deleteDraft('n1');

    const deleted = storage.deleteFile.mock.calls.map((c: any) => c[0]);
    expect(deleted).toContain('k1');
    expect(deleted).toContain('k-main');
    expect(dokumenRepo.delete).toHaveBeenCalledWith({ naskahId: 'n1' });
  });

  // ---------- Sheet (lembar persetujuan direksi & blanko verbal) ----------

  const sheetNaskahEvaluasi = {
    id: 'n-sheet', jenis: 'PER', nomor: 'PER.1', perihal: 'p',
    tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
    tahapan: 'evaluasi', butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  const sheetNaskahPersetujuanDireksi = {
    id: 'n-sheet', jenis: 'PER', nomor: 'PER.1', perihal: 'p',
    tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
    tahapan: 'persetujuan_direksi', butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  const sheetNaskahBlankoVerbal = {
    id: 'n-sheet', jenis: 'PER', nomor: 'PER.1', perihal: 'p',
    tanggal: new Date('2026-08-18'), createdAt: new Date('2026-08-18'),
    tahapan: 'blanko_verbal', butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  function setupDetailMocks() {
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);
  }

  it('kirimLembarPersetujuanDireksi: seed 2 BOD approvals, transisi (LPD tidak digenerate saat kirim)', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahEvaluasi);
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    const res = await svc.kirimLembarPersetujuanDireksi(
      'n-sheet', { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      { nama: 'Pemrakarsa', positionText: 'Kabag' } as any,
    );

    // LPD hanya di-render saat paraf terakhir (semua direksi verified), bukan saat kirim.
    expect((svc as any).lpdService.render).not.toHaveBeenCalled();
    expect(txManager.save).toHaveBeenCalledTimes(2); // 2 BOD approvals
    const savedApprovals = (txManager.save as jest.Mock).mock.calls.map((c) => c[0]).filter((e: any) => e.tahap === 'persetujuan_direksi');
    expect(savedApprovals).toHaveLength(2);
    expect(savedApprovals.every((a: any) => a.status === 'waiting' && a.urutan === 1)).toBe(true);
    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(), 'setuju', expect.objectContaining({ manager: txManager }),
    );
    expect(res.success).toBe(true);
  });

  it('parafLembarPersetujuanDireksi: verifikasi baris waiting dan re-generate PDF', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    const approvalRows = [
      { id: 'pd1', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR1', nama: 'Direktur Satu', jabatan: 'Direktur Operasi', urutan: 1, status: 'waiting' },
      { id: 'pd2', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR2', nama: 'Direktur Dua', jabatan: 'Direktur Utama', urutan: 1, status: 'waiting' },
    ];
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    workflowMock.applyApproval.mockResolvedValueOnce('blanko_verbal');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).lpdService.render.mockClear();

    const res = await svc.parafLembarPersetujuanDireksi(
      'n-sheet', { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      { nama: 'Direktur Satu', positionId: 'POS_DIR1', positionText: 'Direktur Operasi' } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(), approvalRows, 'pd1', 'setuju',
      expect.objectContaining({ aktor: 'Direktur Satu', manager: txManager }),
    );
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      expect.objectContaining({ tahapan: 'blanko_verbal' }),
    );
    expect((svc as any).lpdService.render).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it('parafLembarPersetujuanDireksi: paraf parsial (belum semua verified) tetap re-generate LPD', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    // pd1 sudah verified, pd2 baru diparaf → belum semua verified → tetap PD.
    const approvalRows = [
      { id: 'pd1', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR1', nama: 'Direktur Satu', jabatan: 'Direktur Operasi', urutan: 1, status: 'verified' },
      { id: 'pd2', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR2', nama: 'Direktur Dua', jabatan: 'Direktur Utama', urutan: 1, status: 'waiting' },
    ];
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    workflowMock.applyApproval.mockResolvedValueOnce('persetujuan_direksi');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).lpdService.render.mockClear();

    const res = await svc.parafLembarPersetujuanDireksi(
      'n-sheet', { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      { nama: 'Direktur Dua', positionId: 'POS_DIR2', positionText: 'Direktur Utama' } as any,
    );

    // Tahapan tetap PD (belum semua verified)...
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      expect.objectContaining({ tahapan: 'persetujuan_direksi' }),
    );
    // ...tapi LPD tetap di-render (paraf parsial terlihat di file).
    expect((svc as any).lpdService.render).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it('tolakLembarPersetujuanDireksi: tolak semua waiting dan kembali ke legal_drafting', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    const approvalRows = [
      { id: 'pd1', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR1', nama: 'Direktur Satu', jabatan: 'Direktur Operasi', urutan: 1, status: 'waiting' },
      { id: 'pd2', naskahId: 'n-sheet', tahap: 'persetujuan_direksi', positionId: 'POS_DIR2', nama: 'Direktur Dua', jabatan: 'Direktur Utama', urutan: 1, status: 'waiting' },
    ];
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    workflowMock.applyApproval.mockResolvedValueOnce('legal_drafting');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);

    const res = await svc.tolakLembarPersetujuanDireksi(
      'n-sheet', 'tidak setuju pasal 5', { nama: 'Direktur Satu', positionId: 'POS_DIR1', positionText: 'Direktur Operasi' } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(), approvalRows, 'pd1', 'tolak',
      expect.objectContaining({ catatan: 'tidak setuju pasal 5', manager: txManager }),
    );
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      expect.objectContaining({ tahapan: 'legal_drafting' }),
    );
    expect(res.success).toBe(true);
  });

  it('kirimBlankoVerbal: generate PDF, seed 2 BOD approvals, transisi kirim-approval-blanko', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahBlankoVerbal);
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    const res = await svc.kirimBlankoVerbal(
      'n-sheet', { perihal: 'p', bodyHtml: '<p>Blanko</p>' } as any,
      { nama: 'Legal', positionId: 'POS_LEGAL', positionText: 'Kabag Hukum' } as any,
    );

    expect((svc as any).blankoService.render).toHaveBeenCalledTimes(1);
    const savedApprovals = (txManager.save as jest.Mock).mock.calls.map((c) => c[0]).filter((e: any) => e.tahap === 'blanko_verbal');
    expect(savedApprovals).toHaveLength(2);
    expect(savedApprovals.every((a: any) => a.status === 'waiting' && a.urutan === 1)).toBe(true);
    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(), 'kirim-blanko', expect.objectContaining({ manager: txManager }),
    );
    expect(res.success).toBe(true);
  });

  it('parafBlankoVerbal: verifikasi baris waiting dan re-generate PDF', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahBlankoVerbal);
    const approvalRows = [
      { id: 'bv1', naskahId: 'n-sheet', tahap: 'blanko_verbal', positionId: 'POS_DIR1', nama: 'Direktur Satu', jabatan: 'Direktur Operasi', urutan: 1, status: 'waiting' },
      { id: 'bv2', naskahId: 'n-sheet', tahap: 'blanko_verbal', positionId: 'POS_DIR2', nama: 'Direktur Dua', jabatan: 'Direktur Utama', urutan: 1, status: 'waiting' },
    ];
    const txManager = { save: jest.fn((e) => e), update: jest.fn(), delete: jest.fn() };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    workflowMock.applyApproval.mockResolvedValueOnce('blanko_verbal');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).blankoService.render.mockClear();

    const res = await svc.parafBlankoVerbal(
      'n-sheet', { perihal: 'p', bodyHtml: '<p>Blanko</p>' } as any,
      { nama: 'Direktur Dua', positionId: 'POS_DIR2', positionText: 'Direktur Utama' } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(), approvalRows, 'bv2', 'setuju',
      expect.objectContaining({ aktor: 'Direktur Dua', manager: txManager }),
    );
    expect((svc as any).blankoService.render).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });
});
