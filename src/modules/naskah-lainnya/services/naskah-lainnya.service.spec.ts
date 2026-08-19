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

const repo = () => ({ find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn((e) => e), delete: jest.fn(), update: jest.fn() });

const workflowMock = {
  buildStepper: jest.fn(() => []),
  buildAvailableActions: jest.fn(() => []),
  transisi: jest.fn(),
  transisiTandaTangan: jest.fn(),
  applyApproval: jest.fn(async () => 'persetujuan'),
  resolveNext: jest.fn((t) => t),
  nextAfterEvaluasi: jest.fn((s) => (s ? 'tanda_tangan' : 'perlu_perbaikan')),
  buatApprovalLegalDrafting: jest.fn(),
};

const docxMock = { readParameters: jest.fn(async () => ({ perihal: 'X', tanggal: '2026-08-11' })) };

const storageMock = {
  getFileUrl: jest.fn(async () => 'https://s3/x'),
  getFile: jest.fn(async () => Buffer.from('x')),
  uploadBuffer: jest.fn(async () => ({ key: 'key', url: 'https://s3/x', bucket: 'b' })),
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
        { provide: DocxQrInlineService, useValue: {} },
        { provide: QRCodeService, useValue: { generateQRCodePngBuffer: jest.fn() } },
        { provide: DocxFillerService, useValue: { fill: jest.fn() } },
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

  it('getLegalDrafting: default status belum-dikirim → NOT EXISTS baris legal_drafting approval', async () => {
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
    // Base clause memasukkan blanko_verbal.
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(':bv'),
      expect.objectContaining({ bv: 'blanko_verbal' }),
    );
    // Default (belum-dikirim) → NOT EXISTS baris legal_drafting approval (tanpa param).
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/NOT EXISTS[\s\S]*naskah_lainnya_approval[\s\S]*tahap = 'legal_drafting'/),
    );
  });

  it('getLegalDrafting: status=menunggu → EXISTS baris waiting', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'menunggu');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/EXISTS[\s\S]*naskah_lainnya_approval[\s\S]*status = 'waiting'/),
    );
  });

  it('getLegalDrafting: status=ditolak → EXISTS rejected AND NOT EXISTS waiting', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'ditolak');
    const calls = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0]).filter((s): s is string => typeof s === 'string');
    const clause = calls.find((s) => s.includes("'rejected'"));
    expect(clause).toBeDefined();
    expect(clause).toMatch(/EXISTS[\s\S]*'rejected'[\s\S]*NOT EXISTS[\s\S]*'waiting'/);
  });

  it('getLegalDrafting: status invalid → fallback belum-dikirim (NOT EXISTS tanpa waiting)', async () => {
    const legalRole = (await svc as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = (await svc as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting({ positionId: 'POS_LEGAL', nama: 'Legal' } as any, 'nonsense');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(/NOT EXISTS[\s\S]*naskah_lainnya_approval[\s\S]*tahap = 'legal_drafting'/),
    );
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
      naskahId: 'n1', tipe: 'naskah', nama: 'draft.docx',
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
});
