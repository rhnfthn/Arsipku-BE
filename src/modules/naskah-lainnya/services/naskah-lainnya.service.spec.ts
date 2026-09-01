import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
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
import { NotificationService } from '../../notification/services';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((e) => e),
  delete: jest.fn(),
  update: jest.fn(),
});

const workflowMock = {
  buildStepper: jest.fn(() => []),
  buildAvailableActions: jest.fn((): any[] => []),
  transisi: jest.fn(),
  transisiTandaTangan: jest.fn(),
  applyApproval: jest.fn(async () => 'persetujuan'),
  resolveNext: jest.fn((t, aksi) => {
    if (t === 'evaluasi' && aksi === 'setuju') return 'persetujuan_direksi';
    if (t === 'evaluasi' && aksi === 'tolak') return 'perlu_perbaikan';
    return t;
  }),
  effectiveSignerCount: jest.fn((n: any) =>
    n.penandatanganChain?.length
      ? n.penandatanganChain.length
      : n.penandatanganPositionId != null || n.atasNama
        ? 1
        : 0,
  ),
  buatApprovalLegalDrafting: jest.fn(),
};

const docxMock = {
  readParameters: jest.fn(async () => ({
    perihal: 'X',
    tanggal: '2026-08-11',
  })),
};

const storageMock = {
  getFileUrl: jest.fn(async () => 'https://s3/x'),
  getFile: jest.fn(async () => Buffer.from('x')),
  uploadBuffer: jest.fn(async () => ({
    key: 'key',
    url: 'https://s3/x',
    bucket: 'b',
  })),
  generateUniqueFileName: jest.fn(() => 'key'),
  deleteFile: jest.fn(async () => undefined),
};

const orgDataMock = {
  findAll: jest.fn(async () => []),
  findLatestOrg: jest.fn(async () => ({ position_json: [] })),
  findByPersnum: jest.fn(async (): Promise<any> => null),
  getAtasanManagerial: jest.fn(async () => ({ data: [] as any[] })),
  getManagerialSameUnit: jest.fn(async () => ({ data: [] })),
  findBodByCompany: jest.fn(() => [
    {
      positionId: 'POS_DIR1',
      nama: 'Direktur Satu',
      jabatan: 'Direktur Operasi',
    },
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
        {
          provide: GeneratePdfLpdService,
          useValue: { render: jest.fn(async () => Buffer.from('pdf')) },
        },
        {
          provide: GeneratePdfBlankoVerbalService,
          useValue: { render: jest.fn(async () => Buffer.from('pdf')) },
        },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: getRepositoryToken(NaskahEntity), useValue: repo() },
        {
          provide: getRepositoryToken(NaskahLainnyaApprovalEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(NaskahLainnyaRiwayatEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(NaskahLainnyaBlankoEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(NaskahLainnyaDokumenEntity),
          useValue: repo(),
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb) =>
              cb({
                find: jest.fn(async () => []),
                save: jest.fn((e) => e),
                update: jest.fn(),
                delete: jest.fn(),
              }),
            ),
          },
        },
        { provide: StorageService, useValue: storageMock },
        {
          provide: LegalRoleService,
          useValue: {
            getActivePositionIds: jest.fn().mockResolvedValue([]),
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: NomorService,
          useValue: {
            generateNomorForNaskah: jest
              .fn()
              .mockResolvedValue({ nomor: 'PER.001/LPPNPI/I/2026', noUrut: 1 }),
          },
        },
        {
          provide: NotificationService,
          useValue: { createNotification: jest.fn() },
        },
        {
          provide: RealtimeEmitService,
          useValue: {
            emitNaskahLainnyaPersetujuanCount: jest.fn(),
            emitNaskahLainnyaLegalDraftingCount: jest.fn(),
          },
        },
      ],
    }).compile();
    svc = mod.get(NaskahLainnyaService);
  });

  it('getDetail mengembalikan shape kontrak (dokumen, approval, riwayat, stepper, availableActions)', async () => {
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      nomor: 'PER.1/DS.00.02/2026',
      jenis: 'PER',
      perihal: 'X',
      tanggal: new Date('2026-08-11'),
      createdAt: new Date('2026-08-11'),
      tahapan: 'persetujuan',
      butuhLegal: true,
      createdByPosition: 'Kabag Hukum',
      pemrakarsa: { nama: 'M Fakhri A' }, // disimpan di created_by (opsional)
    });
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', {
      positionText: 'Direktur Utama',
    } as any);
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

  it('getDetail: approver legal yang sudah selesai tidak mendapat aksi membuat lembar direksi pada evaluasi', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n-evaluasi',
      nomor: 'PER.1',
      jenis: 'PER',
      perihal: 'X',
      tanggal: new Date('2026-08-27'),
      createdAt: new Date('2026-08-27'),
      tahapan: 'evaluasi',
      butuhLegal: true,
      penandatanganChain: [],
    });
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([
      {
        aksi: 'kirim-approval-legal',
        aktor: 'Legal Drafter',
        tanggal: new Date('2026-08-27'),
      },
    ]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    (svc as any).legalRoleService.getActivePositionIds.mockResolvedValue([
      'POS_LEGAL',
    ]);
    workflowMock.buildAvailableActions.mockReturnValue([
      'kirim-lembar-persetujuan-direksi',
    ]);

    const res = await svc.getDetail('n-evaluasi', {
      positionId: 'POS_LEGAL',
      nama: 'Legal Approver',
    } as any);

    expect(res.data.availableActions).not.toContain(
      'kirim-lembar-persetujuan-direksi',
    );
  });

  it('getDetail memulihkan Blanko Verbal yang semua approval-nya sudah verified ke tanda_tangan', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n-blanko-stuck',
      nomor: 'PER.1',
      jenis: 'PER',
      perihal: 'X',
      tanggal: new Date('2026-08-27'),
      createdAt: new Date('2026-08-27'),
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      penandatanganChain: [{ positionId: 'SIGNER_1' }],
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'bv-d',
        tahap: 'blanko_verbal_ditetapkan',
        status: 'verified',
        urutan: 1,
        tanggal: new Date('2026-08-27T04:14:47.000Z'),
      },
      {
        id: 'bv-k',
        tahap: 'blanko_verbal',
        status: 'verified',
        urutan: 1,
        tanggal: new Date('2026-08-27T04:15:36.000Z'),
      },
    ]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);
    workflowMock.transisi.mockImplementationOnce((naskah: any) => {
      naskah.tahapan = 'tanda_tangan';
      naskah.signingIndex = 1;
    });

    const res = await svc.getDetail('n-blanko-stuck', {
      nama: 'Direktur',
      positionText: 'Direktur',
    } as any);

    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(),
      'complete',
      expect.objectContaining({ aktor: 'Direktur' }),
    );
    expect(res.data.tahapan).toBe('tanda_tangan');
  });

  it('endpoint evaluasi lama tidak dapat melewati approval EVP', async () => {
    await expect(
      svc.evaluasi('n1', { sesuai: true, checklist: [] }, { nama: 'X' } as any),
    ).rejects.toThrow('Kirim evaluasi ke EVP terlebih dahulu');
    await expect(
      svc.kembalikanEvaluasi('n1', 'alasan', { nama: 'X' } as any),
    ).rejects.toThrow('harus melalui keputusan EVP');
  });

  // ── POV approval: legal lihat legal_drafting + monitoring direksi/blanko,
  // pemrakarsa melihat persetujuan dan fase evaluasi ──
  const naskahPov = {
    id: 'n1',
    nomor: 'PER.1',
    jenis: 'PER',
    perihal: 'X',
    tanggal: new Date('2026-08-11'),
    createdAt: new Date('2026-08-11'),
    tahapan: 'legal_drafting',
    butuhLegal: true,
    dikirimOleh: { position_id: 'POS_PEM' },
  };
  const approvalPovRows = [
    {
      id: 'a1',
      naskahId: 'n1',
      tahap: 'persetujuan',
      nama: 'Pemrakarsa Approver',
      jabatan: 'Kabag',
      urutan: 1,
      status: 'verified',
    },
    {
      id: 'a2',
      naskahId: 'n1',
      tahap: 'legal_drafting',
      nama: 'Legal Approver',
      jabatan: 'Legal',
      urutan: 1,
      status: 'waiting',
    },
    {
      id: 'a3',
      naskahId: 'n1',
      tahap: 'persetujuan_direksi',
      nama: 'Direktur A',
      jabatan: 'Direktur',
      urutan: 1,
      status: 'waiting',
    },
    {
      id: 'a4',
      naskahId: 'n1',
      tahap: 'blanko_verbal',
      nama: 'Direktur B',
      jabatan: 'Direktur',
      urutan: 1,
      status: 'pending',
    },
  ];

  it('getDetail POV legal: approvalByTahap berisi legal_drafting + progress direksi/blanko (flat approval tetap utuh)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.findAll.mockResolvedValue([
      { positionId: 'POS_LEGAL', isActive: true },
    ]);
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    ((await svc) as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', {
      positionId: 'POS_LEGAL',
      nama: 'Legal',
    } as any);
    expect(Object.keys(res.data.approvalByTahap)).toEqual([
      'legal_drafting',
      'persetujuan_direksi',
      'persetujuan_direksi_ditetapkan',
      'blanko_verbal',
      'blanko_verbal_ditetapkan',
    ]);
    expect(res.data.approvalByTahap.persetujuan_direksi).toHaveLength(1);
    expect(res.data.approvalByTahap.blanko_verbal).toHaveLength(1);
    // Flat approval tetap utuh untuk logic aksi FE.
    expect(res.data.approval.map((a: any) => a.tahap)).toEqual(
      expect.arrayContaining([
        'persetujuan',
        'legal_drafting',
        'persetujuan_direksi',
      ]),
    );
  });

  it('getDetail: repair legacy *_ditetapkan verified tanpa tanggal menjadi waiting', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    const approvalRepo = ((await svc) as any).approvalRepo as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    approvalRepo.find.mockResolvedValue([
      {
        id: 'legacy-ditetapkan',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi_ditetapkan',
        nama: 'Direktur Utama',
        jabatan: 'Direktur Utama',
        urutan: 0,
        status: 'verified',
        tanggal: null,
      },
      {
        id: 'pd1',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        nama: 'Direktur SDM',
        jabatan: 'Direktur SDM dan Umum',
        urutan: 1,
        status: 'waiting',
        tanggal: null,
      },
    ]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', {
      positionId: 'POS_LEGAL',
      nama: 'Legal',
    } as any);

    expect(approvalRepo.update).toHaveBeenCalledWith(
      { id: 'legacy-ditetapkan' },
      { status: 'waiting', urutan: 1 },
    );
    expect(res.data.approval[0]).toEqual(
      expect.objectContaining({
        tahap: 'persetujuan_direksi_ditetapkan',
        status: 'waiting',
        urutan: 1,
      }),
    );
  });

  it('getDetail POV pemrakarsa: approvalByTahap mencakup persetujuan dan evaluasi', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    ((await svc) as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', {
      positionId: 'POS_PEM',
      nama: 'Pemrakarsa',
    } as any);
    expect(Object.keys(res.data.approvalByTahap)).toEqual([
      'persetujuan',
      'evaluasi',
      'persetujuan_lanjutan',
      'evaluasi_final',
    ]);
  });

  it('getDetail POV lain (bukan legal/pemrakarsa): approvalByTahap semua tahap', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue(naskahPov);
    ((await svc) as any).approvalRepo.find.mockResolvedValue(approvalPovRows);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
    const res = await svc.getDetail('n1', {
      positionId: 'POS_TTD',
      nama: 'Pejabat',
    } as any);
    expect(Object.keys(res.data.approvalByTahap).sort()).toEqual([
      'blanko_verbal',
      'legal_drafting',
      'persetujuan',
      'persetujuan_direksi',
    ]);
  });

  it('getDetail: penerima aktif legal_drafting hanya mendapat aksi workspace Legal', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_DRAFTER']);
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-legal',
      nomor: 'PER.1',
      jenis: 'PER',
      perihal: 'Legal approval',
      tanggal: new Date('2026-08-26'),
      createdAt: new Date('2026-08-26'),
      tahapan: 'legal_drafting',
      butuhLegal: true,
      dikirimOleh: { position_id: 'POS_PEMRAKARSA' },
    });
    ((await svc) as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'approval-legal',
        naskahId: 'n-legal',
        tahap: 'legal_drafting',
        positionId: 'POS_ATASAN',
        nama: 'Atasan Legal',
        jabatan: 'Kepala Legal',
        urutan: 1,
        status: 'waiting',
      },
    ]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n-legal', {
      positionId: 'POS_ATASAN',
      nama: 'Atasan Legal',
    } as any);

    expect(res.data.availableActions).toContain('kirim-approval-legal');
    expect(res.data.availableActions).not.toEqual(
      expect.arrayContaining(['setuju', 'tolak', 'kembalikan']),
    );
  });

  it('notifikasi legal_drafting yang sudah dikirim ditujukan ke approver aktif', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.find.mockResolvedValue([
      {
        naskahId: 'n-legal',
        tahap: 'legal_drafting',
        positionId: 'POS_ATASAN',
        urutan: 1,
        status: 'waiting',
      },
    ]);
    const notificationService = ((await svc) as any).notificationService;

    await (svc as any).notifyCurrentQueue({
      id: 'n-legal',
      jenis: 'PER',
      nomor: 'PER.2',
      perihal: 'Approval legal',
      tahapan: 'legal_drafting',
    });

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        positionId: 'POS_ATASAN',
        data: expect.objectContaining({
          action: 'OPEN_NASKAH_LAINNYA_PERSETUJUAN',
        }),
      }),
    );
  });

  it('createDraft menyimpan naskah tahapan=konsep', async () => {
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.save.mockResolvedValue({ id: 'n9', tahapan: 'konsep' });
    const res = await svc.createDraft(
      {
        jenis: 'PER',
        butuhLegal: true,
        penandatangan: { nama: 'Ir. Ahmad Rizal', jabatan: 'Direktur Utama' },
      } as any,
      {
        persnum: '123',
        nama: 'M Fakhri A',
        positionText: 'Kabag Hukum',
      } as any,
    );
    expect(res.data.id).toBe('n9');
    expect(naskahRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tahapan: 'konsep', butuhLegal: true }),
    );
  });

  it('createDraft menyimpan calon nomor manual TTD fisik agar tetap dapat dikoreksi', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.save.mockImplementation(async (entity: any) => entity);

    await svc.createDraft(
      {
        jenis: 'PER',
        nomor: 'PER.123/LPPNPI/VIII/2026',
        signOption: 'ttd_basah',
        butuhLegal: false,
        penandatangan: { nama: 'Direktur', jabatan: 'Direktur' },
      } as any,
      { persnum: '123', nama: 'Pemrakarsa', positionText: 'Staf' } as any,
    );

    expect(naskahRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ nomor: 'PER.123/LPPNPI/VIII/2026' }),
    );
  });

  it('createDraft mengambil jabatan penandatangan dari positionText org-data bila persnum tersedia', async () => {
    const naskahRepo = ((await svc) as any).naskahRepo;
    orgDataMock.findByPersnum.mockResolvedValueOnce({
      persnum: 1001,
      nama: 'Budi Santoso',
      position: 'POS_SIGNER',
      positionText: 'VP of Network Planning',
    });
    naskahRepo.save.mockResolvedValue({ id: 'n-org', tahapan: 'konsep' });
    await svc.createDraft(
      {
        jenis: 'PER',
        butuhLegal: false,
        penandatangan: {
          nama: 'Budi Payload',
          jabatan: 'Jabatan Payload',
          persnum: 1001,
        },
      } as any,
      {
        persnum: '123',
        nama: 'M Fakhri A',
        positionText: 'Kabag Hukum',
      } as any,
    );
    expect(naskahRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        penandatanganChain: [
          {
            positionId: 'POS_SIGNER',
            persnum: 1001,
            nama: 'Budi Santoso',
            jabatan: 'VP of Network Planning',
          },
        ],
        penandatanganJabatan: 'VP of Network Planning',
      }),
    );
  });

  it('updateDraft: WHEN tanggal berubah, WHERE pakai tanggal ASLI + patch tanggal baru & penandatangan (regresi PK)', async () => {
    // Bug lama: n.tanggal dimutasi ke tanggal baru LALU dipakai di WHERE → 0 row
    // ter-update → penandatangan/tanggal tidak tersimpan. tanggal bagian PK (id, tanggal).
    const naskahRepo = ((await svc) as any).naskahRepo;
    const tOld = new Date('2026-08-01');
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      tahapan: 'konsep',
      tanggal: tOld,
      createdAt: new Date('2026-08-01'),
    });
    naskahRepo.update.mockResolvedValue({});
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
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
    expect(patch.penandatanganChain).toEqual([
      {
        positionId: undefined,
        persnum: undefined,
        nama: 'Budi',
        jabatan: 'Direktur',
      },
    ]);
    expect(patch.atasNama).toBe('Budi');
  });

  it('uploadDokumen mengembalikan parameter hasil baca', async () => {
    ((await svc) as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      tanggal: new Date('2026-08-11'),
      perihal: 'X',
    });
    const res = await svc.uploadDokumen(
      'n1',
      { buffer: Buffer.from('x'), originalname: 'a.docx' } as any,
      { persnum: 123, nama: 'Test' },
    );
    expect(res.data.parameter).toEqual({ perihal: 'X', tanggal: '2026-08-11' });
  });

  it('uploadRevisiDokumen mewajibkan DOCX dan PDF sebagai satu pasangan', async () => {
    const docx = {
      originalname: 'revisi.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx'),
      size: 4,
    } as any;
    await expect(
      svc.uploadRevisiDokumen('n1', docx, undefined, {
        persnum: 1,
        nama: 'Legal',
      }),
    ).rejects.toThrow('pasangan file DOCX dan PDF');
  });

  it('uploadRevisiDokumen menyimpan DOCX utama dan PDF preview pada versi yang sama', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    const dokumenRepo = (svc as any).dokumenRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      tahapan: 'legal_drafting',
      tanggal: new Date('2026-08-11'),
      perihal: 'X',
    });
    storageMock.uploadBuffer
      .mockResolvedValueOnce({
        key: 'revision.docx',
        url: 'https://s3/revision.docx',
        bucket: 'b',
      })
      .mockResolvedValueOnce({
        key: 'revision.pdf',
        url: 'https://s3/revision.pdf',
        bucket: 'b',
      });
    const docx = {
      originalname: 'revisi.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx'),
      size: 4,
    } as any;
    const pdf = {
      originalname: 'revisi.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
      size: 3,
    } as any;

    await svc.uploadRevisiDokumen('n1', docx, pdf, {
      persnum: 1,
      nama: 'Legal',
      positionText: 'Kabag Hukum',
    });

    expect(naskahRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1' }),
      expect.objectContaining({ lampiran: 'revision.docx' }),
    );
    expect(dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        minioKey: 'revision.docx',
        previewMinioKey: 'revision.pdf',
        previewMimetype: 'application/pdf',
      }),
    );
  });

  it('ubahNomorFinalManual: pemrakarsa dapat mengoreksi nomor naskah TTD fisik yang selesai', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n-fisik',
      jenis: 'PER',
      nomor: 'PER.001/LPPNPI/I/2026',
      tanggal: new Date('2026-08-27'),
      tahapan: 'selesai',
      signOption: 'ttd_basah',
      dikirimOleh: { persnum: '1001' },
    });
    const numberQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const manager = {
      update: jest.fn(),
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
          formatPenomoran: '{TIPE}.{NO_URUT}/LPPNPI/I/2026',
        }),
        createQueryBuilder: jest.fn().mockReturnValue(numberQb),
      })),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(manager),
    );
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValue({ success: true, data: {} } as any);

    await svc.ubahNomorFinalManual('n-fisik', 'PER.123/LPPNPI/I/2026', {
      persnum: 1001,
      nama: 'Pemrakarsa',
      positionText: 'Staf',
    } as any);

    expect(manager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.objectContaining({ id: 'n-fisik' }),
      { nomor: 'PER.123/LPPNPI/I/2026' },
    );
    expect((svc as any).riwayatRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'ubah-nomor-final-manual' }),
    );
  });

  it('tandaTangan TTD fisik menyetujui draft dan menerbitkan nomor pada penandatangan terakhir', async () => {
    const naskah = {
      id: 'n-fisik-approval',
      jenis: 'PER',
      tahapan: 'tanda_tangan',
      signOption: 'ttd_basah',
      signingIndex: 1,
      lampiran: 'draft.docx',
      tanggal: new Date('2026-08-31'),
      penandatanganChain: [
        {
          positionId: 'POS_SIGNER',
          persnum: 123,
          nama: 'Penandatangan',
          jabatan: 'Direktur',
        },
      ],
    } as NaskahEntity;
    (svc as any).naskahRepo.findOne.mockResolvedValue(naskah);
    const ensureNomor = jest
      .spyOn(svc as any, 'ensureNomorFinal')
      .mockResolvedValue('PER.001/LPPNPI/VIII/2026');
    jest.spyOn(svc, 'getDetail').mockResolvedValue({ success: true } as any);
    workflowMock.transisiTandaTangan.mockImplementationOnce((row: any) => {
      row.tahapan = 'selesai';
      row.signingIndex = null;
    });
    storageMock.getFile.mockClear();
    storageMock.uploadBuffer.mockClear();

    await svc.tandaTangan('n-fisik-approval', undefined, {
      persnum: 123,
      nama: 'Penandatangan',
      positionId: 'POS_SIGNER',
      positionText: 'Direktur',
    } as any);

    expect(ensureNomor).toHaveBeenCalledWith(naskah);
    expect(workflowMock.transisiTandaTangan).toHaveBeenCalled();
    expect(storageMock.getFile).not.toHaveBeenCalled();
    expect(storageMock.uploadBuffer).not.toHaveBeenCalled();
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
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n1',
        nomor: 'PER.1',
        jenis: 'PER',
        tahapan: 'legal_drafting',
        butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa A' },
        perihal: 'Perihal',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
      {
        id: 'n2',
        nomor: 'BA.1',
        jenis: 'BA',
        tahapan: 'blanko_verbal',
        butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa B' },
        perihal: 'BA',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    const res = await svc.getLegalDrafting({
      positionId: 'POS_LEGAL',
      nama: 'Legal',
    } as any);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data.map((d: any) => d.tahapan)).toEqual(
      expect.arrayContaining(['legal_drafting', 'blanko_verbal']),
    );
    // Base clause memasukkan persetujuan_direksi & blanko_verbal.
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(':bv'),
      expect.objectContaining({
        bv: 'blanko_verbal',
        pd: 'persetujuan_direksi',
      }),
    );
    // Tidak ada sub-filter NOT EXISTS (filter statusLegal client-side).
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=menunggu → base query, tanpa sub-filter EXISTS waiting', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'menunggu',
    );
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    // Base query tetap (mencakup PD & BV), tanpa sub-filter EXISTS waiting.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(
      true,
    );
    expect(calls.some((s) => s.includes("status = 'waiting'"))).toBe(false);
  });

  it('getLegalDrafting: status=revisi → base query, tanpa sub-filter EXISTS rejected', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'revisi',
    );
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    // Base query tetap, tanpa sub-filter EXISTS rejected / NOT EXISTS waiting.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(
      true,
    );
    expect(calls.some((s) => s.includes("'rejected'"))).toBe(false);
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=semua → base clause saja, tanpa sub-filter waiting/rejected', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    // base clause (legal_drafting OR blanko_verbal) tetap dipakai.
    expect(calls.some((s) => s.includes(':bv'))).toBe(true);
    // tidak ada sub-filter status (waiting/rejected/NOT EXISTS legal_drafting row).
    expect(
      calls.some((s) => s.includes("'waiting'") || s.includes("'rejected'")),
    ).toBe(false);
  });

  it('getLegalDrafting: statusLegal per-row — legal_drafting no rows → belum_dikirim, blanko_verbal (no BOD rows) → belum_dikirim', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n1',
        nomor: 'PER.1',
        jenis: 'PER',
        tahapan: 'legal_drafting',
        butuhLegal: true,
        pemrakarsa: { nama: 'A' },
        perihal: 'p',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
      {
        id: 'n2',
        nomor: 'BA.1',
        jenis: 'BA',
        tahapan: 'blanko_verbal',
        butuhLegal: true,
        pemrakarsa: { nama: 'B' },
        perihal: 'b',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]);
    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    const byId = Object.fromEntries(
      res.data.map((d: any) => [d.id, d.statusLegal]),
    );
    expect(byId['n1']).toBe('belum_dikirim');
    expect(byId['n2']).toBe('belum_dikirim');
  });

  it('getLegalDrafting: approval legal waiting berarti pekerjaan drafter sudah_dikerjakan', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n-waiting-legal',
          nomor: 'PER.2',
          jenis: 'PER',
          tahapan: 'legal_drafting',
          butuhLegal: true,
          perihal: 'Approval legal',
          tanggal: new Date('2026-08-26'),
          createdAt: new Date('2026-08-26'),
        },
      ]),
    );
    ((await svc) as any).approvalRepo.find.mockResolvedValue([
      {
        naskahId: 'n-waiting-legal',
        tahap: 'legal_drafting',
        status: 'waiting',
      },
    ]);

    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Drafter Legal' } as any,
      'semua',
    );

    expect(res.data[0].statusLegal).toBe('sudah_dikerjakan');
  });

  it('getLegalDrafting: blanko_verbal dengan baris BOD waiting → menunggu_persetujuan, all verified → sudah_dikerjakan', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n3',
        nomor: 'BA.2',
        jenis: 'BA',
        tahapan: 'blanko_verbal',
        butuhLegal: true,
        pemrakarsa: { nama: 'C' },
        perihal: 'c',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
      {
        id: 'n4',
        nomor: 'BA.3',
        jenis: 'BA',
        tahapan: 'blanko_verbal',
        butuhLegal: true,
        pemrakarsa: { nama: 'D' },
        perihal: 'd',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    ((await svc) as any).approvalRepo.find.mockResolvedValue([
      { naskahId: 'n3', tahap: 'blanko_verbal', status: 'waiting' },
      { naskahId: 'n4', tahap: 'blanko_verbal', status: 'verified' },
    ]);
    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    const byId = Object.fromEntries(
      res.data.map((d: any) => [d.id, d.statusLegal]),
    );
    expect(byId['n3']).toBe('menunggu_persetujuan');
    expect(byId['n4']).toBe('sudah_dikerjakan');
  });

  it('getLegalDrafting: persetujuan_direksi (aksi-saya) dengan waiting → menunggu_persetujuan', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n5',
        nomor: 'PER.2',
        jenis: 'PER',
        tahapan: 'persetujuan_direksi',
        butuhLegal: true,
        pemrakarsa: { nama: 'E' },
        perihal: 'e',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    ((await svc) as any).approvalRepo.find.mockResolvedValue([
      { naskahId: 'n5', tahap: 'persetujuan_direksi', status: 'waiting' },
    ]);
    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    expect(res.data[0].statusLegal).toBe('menunggu_persetujuan');
  });

  it('getLegalDrafting: persetujuan_direksi tanpa baris BOD (belum kirim lembar) → belum_dikirim', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n6',
        nomor: 'PER.3',
        jenis: 'PER',
        tahapan: 'persetujuan_direksi',
        butuhLegal: true,
        pemrakarsa: { nama: 'F' },
        perihal: 'f',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]);
    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    expect(res.data[0].statusLegal).toBe('belum_dikirim');
  });

  it('getLegalDrafting: dikembalikan dari evaluasi (legal_drafting, no rows, riwayat terakhir kembalikan-evaluasi) → statusLegal revisi', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n1',
        nomor: 'PER.1',
        jenis: 'PER',
        tahapan: 'legal_drafting',
        butuhLegal: true,
        pemrakarsa: { nama: 'A' },
        perihal: 'p',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]); // baris legal dihapus
    // Riwayat terbaru = kembalikan-evaluasi (order DESC → elemen pertama = terbaru).
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([
      {
        naskahId: 'n1',
        aksi: 'kembalikan-evaluasi',
        createdAt: new Date('2026-08-19'),
      },
      {
        naskahId: 'n1',
        aksi: 'kirim-approval-legal',
        createdAt: new Date('2026-08-18'),
      },
    ]);
    const res = await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'semua',
    );
    expect(res.data[0].statusLegal).toBe('revisi');
  });

  it('getLegalDrafting: status=revisi → base query mencakup persetujuan_direksi & blanko_verbal (sub-filter client-side)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'revisi',
    );
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    // Base query tahapan mencakup legal_drafting, persetujuan_direksi, blanko_verbal.
    const baseClause = calls.find(
      (s) => s.includes(':pd') && s.includes(':bv'),
    );
    expect(baseClause).toBeDefined();
    // Tidak ada sub-filter NOT EXISTS / kembalikan-evaluasi (filter statusLegal client-side).
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
    expect(calls.some((s) => s.includes("'kembalikan-evaluasi'"))).toBe(false);
  });

  it('getLegalDrafting: status invalid → fallback base query (tanpa sub-filter NOT EXISTS)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Legal' } as any,
      'nonsense',
    );
    const calls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string');
    // Fallback ke base query (legal_drafting/persetujuan_direksi/blanko_verbal), tanpa NOT EXISTS.
    expect(calls.some((s) => s.includes(':pd') && s.includes(':bv'))).toBe(
      true,
    );
    expect(calls.some((s) => s.includes('NOT EXISTS'))).toBe(false);
  });

  it('getLegalDrafting: status=aksi-saya → EXISTS riwayat aktor=me, aksi IN legal-drafter actions, tanpa filter tahapan', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getLegalDrafting(
      { positionId: 'POS_LEGAL', nama: 'Andi Legal' } as any,
      'aksi-saya',
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringMatching(
        /EXISTS[\s\S]*naskah_lainnya_riwayat[\s\S]*r\.aktor = :aktor[\s\S]*r\.aksi IN \(:\.\.\.aksiSaya\)/,
      ),
      expect.objectContaining({
        aktor: 'Andi Legal',
        aksiSaya: [
          'mulai-legal',
          'kirim-approval-legal',
          'kembalikan-legal',
          'kirim-approval-blanko',
        ],
      }),
    );
    // aksi-saya tidak memakai filter tahapan legal_drafting/blanko_verbal (naskah bisa sudah lanjut).
    const tahapanCalls = (qb.andWhere as jest.Mock).mock.calls
      .map((c: any[]) => c[0])
      .filter((s): s is string => typeof s === 'string' && s.includes(':bv'));
    expect(tahapanCalls).toHaveLength(0);
  });

  it('getLegalDrafting: non-legal user → throws Forbidden', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    await expect(
      svc.getLegalDrafting({ positionId: 'POS_OTHER', nama: 'X' } as any),
    ).rejects.toThrow();
  });

  it('getPersetujuan: tidak lagi memanggil legalRoleService (block legal_drafting dihapus)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const res = await svc.getPersetujuan({
      positionId: 'POS_LEGAL',
      nama: 'Legal',
    } as any);
    expect(legalRole.getActivePositionIds).not.toHaveBeenCalled();
    expect(res.data).toEqual([]);
  });

  it('getPersetujuan: memasukkan approval waiting tahap legal_drafting', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest
      .fn()
      .mockReturnValue(makeQb([], [{ naskahId: 'n-legal' }]));
    const naskahRepo = ((await svc) as any).naskahRepo;
    const naskahQb = makeQb([
      {
        id: 'n-legal',
        nomor: 'PER.2',
        jenis: 'PER',
        tahapan: 'legal_drafting',
        butuhLegal: true,
        perihal: 'Approval legal',
        tanggal: new Date('2026-08-26'),
        createdAt: new Date('2026-08-26'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(naskahQb);

    const res = await svc.getPersetujuan(
      { positionId: 'POS_ATASAN', nama: 'Atasan Legal' } as any,
      'menunggu',
    );

    expect(res.data).toHaveLength(1);
    expect(naskahQb.andWhere).toHaveBeenCalledWith(
      'n.tahapan IN (:...t)',
      expect.objectContaining({
        t: expect.arrayContaining(['legal_drafting']),
      }),
    );
  });

  it('getPersetujuan(status=disetujui): returns naskah where user approval = verified', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n1' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n1',
          nomor: 'PER.1',
          jenis: 'PER',
          tahapan: 'selesai',
          butuhLegal: false,
          pemrakarsa: { nama: 'A' },
          perihal: 'p',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'X' } as any,
      'disetujui',
    );
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n1' });
    expect(aqb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' }),
    );
  });

  it('getPersetujuan(disetujui): mencocokkan nama approver tanpa membedakan kapitalisasi/spasi', async () => {
    const approvalRepo = (svc as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n1' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n1',
          nomor: 'PER.1',
          jenis: 'PER',
          tahapan: 'evaluasi',
          butuhLegal: true,
          pemrakarsa: { nama: 'A' },
          perihal: 'p',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );

    await svc.getPersetujuan({ nama: '  made gede  ' } as any, 'disetujui');

    expect(aqb.where).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(TRIM(a.nama)) = LOWER(TRIM(:nama))'),
    );
  });

  it('getPersetujuan(disetujui): termasuk naskah selesai yang user tandatangani (penandatangan, bukan approver)', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    // User bukan approver → tidak ada baris approval setuju (riwayat query kosong).
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n-ttd',
          nomor: 'PER.TTD',
          jenis: 'PER',
          tahapan: 'selesai',
          butuhLegal: false,
          pemrakarsa: { nama: 'Pem' },
          perihal: 'ditandatangani',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_SIGNER', nama: 'Signer' } as any,
      'disetujui',
    );
    // Naskah selesai muncul di "Disetujui" walau user tidak punya baris approval
    // (penandatangan disimpan di penandatangan_chain, bukan tabel approval).
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-ttd', tahapan: 'selesai' });
  });

  it('getPersetujuan(status=ditolak): maps filter ke approval status rejected', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n2' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n2',
          nomor: 'KEP.1',
          jenis: 'KEP',
          tahapan: 'perlu_perbaikan',
          butuhLegal: false,
          pemrakarsa: { nama: 'B' },
          perihal: 'p2',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'X' } as any,
      'ditolak',
    );
    expect(res.data).toHaveLength(1);
    expect(aqb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    );
  });

  it('getPersetujuan(status=semua): gabung waiting + verified + rejected (dedupe by id)', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n1' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n1',
          nomor: 'PER.1',
          jenis: 'PER',
          tahapan: 'persetujuan',
          butuhLegal: false,
          pemrakarsa: { nama: 'A' },
          perihal: 'p',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'X' } as any,
      'semua',
    );
    // 'semua' memanggil getNaskahIdsForApproverStatus untuk waiting (antrian) + verified + rejected (riwayat).
    const statusArgs = (aqb.setParameters as jest.Mock).mock.calls.map(
      (c) => c[0]?.status,
    );
    expect(statusArgs).toEqual(
      expect.arrayContaining(['waiting', 'verified', 'rejected']),
    );
    // Dedupe by id → satu baris n1 meski ketiga himpunan overlap di mock.
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n1' });
  });

  it('getPersetujuan(status tak dikenal) → fallback menunggu', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], []);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], []));
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'X' } as any,
      'nonsense',
    );
    expect(res.data).toEqual([]);
    expect(aqb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'waiting' }),
    );
  });

  it('getPersetujuan(menunggu): berjenjang — query approval menambah gate urutan MIN', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n3' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n3',
          nomor: 'PER.3',
          jenis: 'PER',
          tahapan: 'persetujuan',
          butuhLegal: false,
          pemrakarsa: { nama: 'C' },
          perihal: 'p3',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    await svc.getPersetujuan({ positionId: 'POS_X', nama: 'X' } as any);
    const andWhereCalls = (aqb.andWhere as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(andWhereCalls.some((s) => s.includes('MIN(a2.urutan)'))).toBe(true);
  });

  it('getPersetujuan(menunggu): persetujuan_direksi & blanko_verbal masuk antrian paraf direksi', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n-pd' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const nqb = makeQb([
      {
        id: 'n-pd',
        nomor: 'PER.PD',
        jenis: 'PER',
        tahapan: 'persetujuan_direksi',
        butuhLegal: false,
        pemrakarsa: { nama: 'Dir' },
        perihal: 'pd',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(nqb);
    const res = await svc.getPersetujuan({
      positionId: 'POS_DIR',
      nama: 'Direktur Satu',
    } as any);
    // Naskah PD muncul di antrian "Menunggu" untuk direksi (baris waiting).
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-pd' });
    // Filter tahapan part 1 kini termasuk paraf direksi (parallel, urutan=1 lolos gate berjenjang).
    const tParam = (nqb.andWhere as jest.Mock).mock.calls
      .map((c) => c[1])
      .find((p) => p && Array.isArray(p.t));
    expect(tParam.t).toEqual(
      expect.arrayContaining(['persetujuan_direksi', 'blanko_verbal']),
    );
  });

  it('getPersetujuan(menunggu): naskah tanda_tangan di mana user adalah signer AKTIF muncul di antrian', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], [])); // user bukan approver
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n-ttd',
          nomor: 'PER.TTD',
          jenis: 'PER',
          tahapan: 'tanda_tangan',
          butuhLegal: false,
          pemrakarsa: { nama: 'Pem' },
          perihal: 'multi-signer',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
          signingIndex: 2,
          penandatanganChain: [
            { positionId: 'POS_OTHER', nama: 'Signer 1', jabatan: 'Dir 1' },
            { positionId: 'POS_X', nama: 'User', jabatan: 'Dir 2' }, // user = signer ke-2, giliran-nya sekarang
          ],
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'User' } as any,
      'menunggu',
    );
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: 'n-ttd' });
  });

  it('getPersetujuan(menunggu): naskah tanda_tangan yang SUDAH ditandatangani user (bukan signer aktif) TIDAK muncul', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(makeQb([], [])); // user bukan approver
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n-ttd',
          nomor: 'PER.TTD',
          jenis: 'PER',
          tahapan: 'tanda_tangan',
          butuhLegal: false,
          pemrakarsa: { nama: 'Pem' },
          perihal: 'multi-signer',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
          // user = signer ke-2, tapi giliran masih signer ke-1 → user sudah/belum giliran? di sini
          // signingIndex=1 menunjuk signer 1, user (POS_X) bukan signer aktif.
          signingIndex: 1,
          penandatanganChain: [
            { positionId: 'POS_OTHER', nama: 'Signer 1', jabatan: 'Dir 1' },
            { positionId: 'POS_X', nama: 'User', jabatan: 'Dir 2' },
          ],
        },
      ]),
    );
    const res = await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'User' } as any,
      'menunggu',
    );
    // User belum giliran (signingIndex=1 → signer 1) → tidak muncul di "Menunggu".
    expect(res.data).toEqual([]);
  });

  it('getPersetujuan(disetujui): berjenjang — query riwayat TIDAK menambah gate urutan', async () => {
    const approvalRepo = ((await svc) as any).approvalRepo;
    const aqb = makeQb([], [{ naskahId: 'n4' }]);
    approvalRepo.createQueryBuilder = jest.fn().mockReturnValue(aqb);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(
      makeQb([
        {
          id: 'n4',
          nomor: 'PER.4',
          jenis: 'PER',
          tahapan: 'selesai',
          butuhLegal: false,
          pemrakarsa: { nama: 'D' },
          perihal: 'p4',
          tanggal: new Date('2026-08-18'),
          createdAt: new Date('2026-08-18'),
        },
      ]),
    );
    await svc.getPersetujuan(
      { positionId: 'POS_X', nama: 'X' } as any,
      'disetujui',
    );
    const andWhereCalls = (aqb.andWhere as jest.Mock).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(andWhereCalls.some((s) => s.includes('MIN(a2.urutan)'))).toBe(false);
  });

  it('getList: legal-role user → exclude legal_drafting & blanko_verbal dari Daftar', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([
      {
        id: 'n1',
        nomor: 'PER.1',
        jenis: 'PER',
        tahapan: 'persetujuan',
        butuhLegal: true,
        pemrakarsa: { nama: 'Pemrakarsa A' },
        perihal: 'Perihal',
        tanggal: new Date('2026-08-18'),
        createdAt: new Date('2026-08-18'),
      },
    ]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        naskahId: 'n1',
        tahap: 'persetujuan',
        positionId: 'POS_VP',
        nama: 'VP Pemrakarsa',
        jabatan: 'Vice President',
        urutan: 2,
      },
      {
        naskahId: 'n1',
        tahap: 'persetujuan',
        positionId: 'POS_AVP',
        nama: 'AVP Pemrakarsa',
        jabatan: 'Assistant Vice President',
        urutan: 1,
      },
    ]);
    const res = await svc.getList({}, {
      positionId: 'POS_LEGAL',
      nama: 'Legal',
      positionText: 'Legal',
    } as any);
    expect(res.success).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'n.tahapan NOT IN (:...ex)',
      expect.objectContaining({ ex: ['legal_drafting', 'blanko_verbal'] }),
    );
    expect(res.data[0].pemrakarsaPejabat).toEqual({
      positionId: 'POS_VP',
      nama: 'VP Pemrakarsa',
      jabatan: 'Vice President',
    });
  });

  it('getList: non-legal user → tidak exclude legal_drafting/blanko_verbal (tetap lihat naskahnya di Daftar)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getList({}, {
      positionId: 'POS_OTHER',
      nama: 'X',
      positionText: 'Other',
    } as any);
    const notInCalls = (qb.andWhere as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === 'n.tahapan NOT IN (:...ex)',
    );
    expect(notInCalls).toHaveLength(0);
  });

  it('getList: filter pemrakarsa pakai position_id/persnum, BUKAN created_by_position (anti-leak antar user dengan jabatan sama)', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.getActivePositionIds.mockResolvedValue(['POS_LEGAL']);
    const naskahRepo = ((await svc) as any).naskahRepo;
    const qb = makeQb([]);
    naskahRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    await svc.getList({}, {
      positionId: 'POS_LEGAL',
      persnum: 10011066,
      nama: 'Legal',
      positionText: 'Staf Administrasi',
    } as any);
    const pemrakarsaCalls = (qb.andWhere as jest.Mock).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('dikirim_oleh'),
    );
    expect(pemrakarsaCalls.length).toBeGreaterThan(0);
    const sql = pemrakarsaCalls[0][0] as string;
    expect(sql).not.toContain('created_by_position'); // jangan match by jabatan text (bocor)
    expect(sql).toContain(':persnum');
    expect(pemrakarsaCalls[0][1]).toEqual(
      expect.objectContaining({ persnum: 10011066 }),
    );
  });

  it('kirimApprovalLegal: pekerja mengirim hasil ke pejabat pengesah', async () => {
    workflowMock.transisi.mockClear();
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.findAll.mockResolvedValue([
      {
        positionId: 'POS_LEGAL',
        nama: 'Drafter',
        jabatan: 'Staf Legal',
        chief: false,
        isActive: true,
      },
      {
        positionId: 'P2',
        nama: 'Legal B',
        jabatan: 'EVP Legal',
        chief: true,
        isActive: true,
      },
    ]);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      nomor: 'PER.1',
      perihal: 'p',
      tahapan: 'legal_drafting',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    });
    ((await svc) as any).approvalRepo.find.mockResolvedValue([]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
    const approval = [
      { positionId: 'P2', nama: 'Legal B', jabatan: 'EVP Legal' },
    ];
    const res = await svc.kirimApprovalLegal('n1', approval, {
      positionId: 'POS_LEGAL',
      nama: 'Drafter',
      positionText: 'Kabag Hukum',
    } as any);
    expect(workflowMock.transisi).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('kirimApprovalLegal: pengesah yang mengerjakan sendiri langsung memfinalkan tahap', async () => {
    workflowMock.transisi.mockClear();
    const legalRole = (svc as any).legalRoleService as any;
    legalRole.findAll.mockResolvedValue([
      {
        positionId: 'POS_EVP',
        nama: 'EVP Legal',
        jabatan: 'EVP Legal',
        chief: true,
        isActive: true,
      },
    ]);
    const naskah = {
      id: 'n-self',
      jenis: 'PER',
      tahapan: 'legal_drafting',
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    };
    (svc as any).naskahRepo.findOne.mockResolvedValue(naskah);
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);

    await svc.kirimApprovalLegal(
      naskah.id,
      [{ positionId: 'POS_EVP', nama: 'EVP Legal', jabatan: 'EVP Legal' }],
      {
        positionId: 'POS_EVP',
        nama: 'EVP Legal',
        positionText: 'EVP Legal',
      } as any,
    );

    expect(workflowMock.transisi).toHaveBeenCalledWith(
      naskah,
      'kirim-approval-legal',
      expect.objectContaining({ aktor: 'EVP Legal' }),
    );
  });

  it('kirimApprovalLegal: non-legal user → Forbidden', async () => {
    (workflowMock.buatApprovalLegalDrafting as jest.Mock).mockClear();
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.findAll.mockResolvedValue([
      {
        positionId: 'POS_LEGAL',
        nama: 'Legal',
        jabatan: 'Legal',
        chief: true,
        isActive: true,
      },
    ]);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      nomor: 'PER.1',
      perihal: 'p',
      tahapan: 'legal_drafting',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    });
    await expect(
      svc.kirimApprovalLegal(
        'n1',
        [{ positionId: 'P2', nama: 'X', jabatan: 'Y' }],
        { positionId: 'POS_OTHER', nama: 'Z' } as any,
      ),
    ).rejects.toThrow();
    expect(workflowMock.buatApprovalLegalDrafting).not.toHaveBeenCalled();
  });

  it('kirimApprovalLegal: approval kosong → BadRequest', async () => {
    const legalRole = ((await svc) as any).legalRoleService as any;
    legalRole.findAll.mockResolvedValue([
      {
        positionId: 'POS_LEGAL',
        nama: 'Drafter',
        jabatan: 'Legal',
        chief: false,
        isActive: true,
      },
    ]);
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      nomor: 'PER.1',
      perihal: 'p',
      tahapan: 'legal_drafting',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    });
    await expect(
      svc.kirimApprovalLegal('n1', [], {
        positionId: 'POS_LEGAL',
        nama: 'Drafter',
      } as any),
    ).rejects.toThrow();
  });

  it('getDetail: hasWaitingLegalRows diteruskan ke buildAvailableActions (sembunyikan kirim-approval-legal)', async () => {
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      nomor: 'PER.1',
      perihal: 'p',
      tahapan: 'legal_drafting',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    });
    const approvalRepo = ((await svc) as any).approvalRepo;
    approvalRepo.find.mockResolvedValue([
      {
        id: 'la1',
        tahap: 'legal_drafting',
        urutan: 1,
        status: 'waiting',
        nama: 'Legal A',
        jabatan: 'X',
        catatan: null,
        tanggal: null,
      },
    ]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);
    await svc.getDetail('n1', {
      positionId: 'POS_LEGAL',
      nama: 'Drafter',
      positionText: 'Kabag Hukum',
    } as any);
    const args = (
      workflowMock.buildAvailableActions as jest.Mock
    ).mock.calls.at(-1);
    expect(args?.[3]).toBe(true); // hasWaitingLegalRows
  });

  it('getDetail blanko_verbal: approval Persetujuan Direksi legacy tidak menyembunyikan aksi pembuatan blanko', async () => {
    const naskahRepo = ((await svc) as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n-blanko-legacy',
      jenis: 'PER',
      nomor: 'PER.1',
      perihal: 'p',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
      createdAt: new Date('2026-08-18'),
      penandatanganChain: [],
    });
    ((await svc) as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'pd-legacy',
        tahap: 'persetujuan_direksi',
        urutan: 1,
        status: 'verified',
        nama: 'Direktur Lama',
        jabatan: 'Direktur',
      },
    ]);
    ((await svc) as any).riwayatRepo.find.mockResolvedValue([]);
    ((await svc) as any).blankoRepo.find.mockResolvedValue([]);
    ((await svc) as any).dokumenRepo.find.mockResolvedValue([]);

    await svc.getDetail('n-blanko-legacy', {
      positionText: 'Kabag Hukum',
      nama: 'Legal Drafter',
    } as any);

    const args = (
      workflowMock.buildAvailableActions as jest.Mock
    ).mock.calls.at(-1);
    expect(args?.[4]).toBe(false); // hasDireksiRows khusus blanko aktif
  });

  it('catatVersiNaskah menyimpan baris history dengan status sesuai tahapan', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    dokumenRepo.save.mockResolvedValue({});
    await (svc as any).catatVersiNaskah(
      'n1',
      'perlu_perbaikan',
      'k1',
      'rev.docx',
      'application/x',
      10,
      { persnum: 5, nama: 'Sari', positionText: 'Legal' } as any,
    );
    expect(dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        naskahId: 'n1',
        tipe: 'naskah',
        minioKey: 'k1',
        nama: 'rev.docx',
        tahapan: 'perlu_perbaikan',
        status: 'revisi',
        uploaderNama: 'Sari',
        uploaderJabatan: 'Legal',
        uploaderPersnum: 5,
      }),
    );
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
      id: 'n1',
      jenis: 'PER',
      tahapan: 'konsep',
      tanggal: new Date('2026-08-11'),
    });
    naskahRepo.update.mockResolvedValue({});
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    dokumenRepo.save.mockResolvedValue({});
    const file = {
      originalname: 'draft.docx',
      buffer: Buffer.from('x'),
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 10,
    } as any;
    await svc.uploadDokumen('n1', file, {
      persnum: 1,
      nama: 'Budi',
      positionText: 'Kabag',
    } as any);
    expect(dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        // nama kanonik dari buildNaskahFileName(perihal, jenis, naskahId) — bukan originalname.
        naskahId: 'n1',
        tipe: 'naskah',
        nama: 'x-n1.docx',
        tahapan: 'konsep',
        status: 'draf',
        uploaderNama: 'Budi',
        uploaderJabatan: 'Kabag',
        uploaderPersnum: 1,
      }),
    );
  });

  it('getDetail menampilkan versi naskah dari baris tipe=naskah urut DESC', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      tahapan: 'selesai',
      lampiran: 'k1',
      signedLampiran: 's1',
      tanggal: new Date('2026-08-11'),
      createdAt: new Date('2026-08-11'),
    });
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockReset();
    dokumenRepo.find
      .mockResolvedValueOnce([
        {
          id: 'v2',
          naskahId: 'n1',
          tipe: 'naskah',
          nama: 'v2.docx',
          minioKey: 'k2',
          mimetype: 'x',
          ukuran: 10,
          tahapan: 'legal_drafting',
          status: 'draf',
          uploaderNama: 'Sari',
          uploaderJabatan: 'Legal',
          uploaderPersnum: 9,
          createdAt: new Date('2026-08-12'),
        },
        {
          id: 'v1',
          naskahId: 'n1',
          tipe: 'naskah',
          nama: 'v1.docx',
          minioKey: 'k1',
          mimetype: 'x',
          ukuran: 8,
          tahapan: 'konsep',
          status: 'draf',
          uploaderNama: 'Budi',
          uploaderJabatan: 'Kabag',
          uploaderPersnum: 1,
          createdAt: new Date('2026-08-11'),
        },
      ])
      .mockResolvedValueOnce([]); // fisik/pendukung
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);

    const res = await svc.getDetail('n1', { positionText: 'X' } as any);
    const naskahDocs = res.data.dokumen.filter((d: any) => d.tipe === 'naskah');
    expect(naskahDocs).toHaveLength(2);
    expect(naskahDocs[0].id).toBe('v2'); // DESC: v2 (Aug 12) dulu
    expect(naskahDocs[0]).toMatchObject({
      uploaderNama: 'Sari',
      fase: 'legal_drafting',
      status: 'draf',
    });
  });

  it('getDetail: revisi legal — hanya naskah legal_drafting TERAKHIR yang tampil, versi legal_drafting sebelumnya disembunyikan', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      jenis: 'PER',
      tahapan: 'legal_drafting',
      lampiran: 'k3',
      tanggal: new Date('2026-08-11'),
      createdAt: new Date('2026-08-11'),
    });
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.find.mockReset();
    dokumenRepo.find
      .mockResolvedValueOnce([
        {
          id: 'v3',
          naskahId: 'n1',
          tipe: 'naskah',
          nama: 'rev2.docx',
          minioKey: 'k3',
          mimetype: 'x',
          ukuran: 12,
          tahapan: 'legal_drafting',
          status: 'draf',
          uploaderNama: 'Sari',
          uploaderJabatan: 'Legal',
          uploaderPersnum: 9,
          createdAt: new Date('2026-08-13'),
        },
        {
          id: 'v2',
          naskahId: 'n1',
          tipe: 'naskah',
          nama: 'rev1.docx',
          minioKey: 'k2',
          mimetype: 'x',
          ukuran: 10,
          tahapan: 'legal_drafting',
          status: 'draf',
          uploaderNama: 'Sari',
          uploaderJabatan: 'Legal',
          uploaderPersnum: 9,
          createdAt: new Date('2026-08-12'),
        },
        {
          id: 'v1',
          naskahId: 'n1',
          tipe: 'naskah',
          nama: 'konsep.docx',
          minioKey: 'k1',
          mimetype: 'x',
          ukuran: 8,
          tahapan: 'konsep',
          status: 'draf',
          uploaderNama: 'Budi',
          uploaderJabatan: 'Kabag',
          uploaderPersnum: 1,
          createdAt: new Date('2026-08-11'),
        },
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
      id: 'n1',
      jenis: 'PER',
      tahapan: 'selesai',
      lampiran: 'naskah-lainnya/PER/n1/naskah/legacy.docx',
      signedLampiran: null,
      tanggal: new Date('2026-08-11'),
      createdAt: new Date('2026-08-11'),
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
    dokumenRepo.findOne.mockResolvedValue({
      id: 'd1',
      naskahId: 'n1',
      tipe: 'naskah',
      minioKey: 'k1',
    });
    await expect(svc.deleteDokumenTambahan('n1', 'd1')).rejects.toThrow(
      'Riwayat naskah tidak dapat dihapus per versi',
    );
  });

  it('downloadDokumenTambahan memilih PDF untuk preview dan DOCX untuk unduh revisi', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.findOne.mockResolvedValue({
      id: 'd-pair',
      naskahId: 'n1',
      tipe: 'naskah',
      status: 'revisi',
      nama: 'revisi.docx',
      minioKey: 'revision.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      previewNama: 'revisi.pdf',
      previewMinioKey: 'revision.pdf',
      previewMimetype: 'application/pdf',
    });

    const preview = await svc.downloadDokumenTambahan('n1', 'd-pair', true);
    expect(storageMock.getFile).toHaveBeenLastCalledWith('revision.pdf');
    expect(preview).toEqual(
      expect.objectContaining({
        mimetype: 'application/pdf',
        nama: 'revisi.pdf',
      }),
    );

    const download = await svc.downloadDokumenTambahan('n1', 'd-pair', false);
    expect(storageMock.getFile).toHaveBeenLastCalledWith('revision.docx');
    expect(download.nama).toBe('revisi.docx');
  });

  it('downloadDokumenTambahan artifact dittd sajikan signed.docx sendiri (abaikan preview PDF warisan)', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.findOne.mockResolvedValue({
      id: 'd-final',
      naskahId: 'n1',
      tipe: 'naskah',
      status: 'dittd',
      nama: 'signed.docx',
      minioKey: 'signed.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      previewNama: 'final.pdf',
      previewMinioKey: 'final.pdf',
      previewMimetype: 'application/pdf',
    });

    // Unduh: docx signed, BUKAN previewMinioKey warisan (PDF belum berttd).
    const download = await svc.downloadDokumenTambahan('n1', 'd-final', false);
    expect(storageMock.getFile).toHaveBeenLastCalledWith('signed.docx');
    expect(download.mimetype).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(download.nama).toBe('signed.docx');

    // Preview pun docx signed — FE merender inline via docx-preview.
    const preview = await svc.downloadDokumenTambahan('n1', 'd-final', true);
    expect(storageMock.getFile).toHaveBeenLastCalledWith('signed.docx');
    expect(preview.nama).toBe('signed.docx');
  });

  it('upsertDittdRow insert bila belum ada row dittd, update bila sudah ada', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    // case 1: no existing → insert (save dipanggil)
    dokumenRepo.findOne.mockResolvedValueOnce(null);
    dokumenRepo.save.mockResolvedValue({});
    await (svc as any).upsertDittdRow('n1', 'signed-1', {
      persnum: 2,
      nama: 'Andi',
      positionText: 'Dir',
    } as any);
    expect(dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        naskahId: 'n1',
        tipe: 'naskah',
        status: 'dittd',
        minioKey: 'signed-1',
        uploaderNama: 'Andi',
      }),
    );
    // case 2: existing → update (update dipanggil, save tidak)
    dokumenRepo.findOne.mockResolvedValueOnce({
      id: 'row1',
      naskahId: 'n1',
      tipe: 'naskah',
      status: 'dittd',
    });
    dokumenRepo.update.mockResolvedValue({});
    await (svc as any).upsertDittdRow('n1', 'signed-2', {
      persnum: 3,
      nama: 'Budi',
      positionText: 'Dir2',
    } as any);
    expect(dokumenRepo.update).toHaveBeenCalledWith(
      'row1',
      expect.objectContaining({
        minioKey: 'signed-2',
        uploaderNama: 'Budi',
      }),
    );
  });

  it('upsertDittdRow final=false → status proses_ttd (signer 1..N-1, belum final); final=true → dittd', async () => {
    const dokumenRepo = (svc as any).dokumenRepo;
    dokumenRepo.create.mockImplementation((e: any) => e);
    // signer 1 (intermediate): insert dengan status 'proses_ttd'
    dokumenRepo.findOne.mockResolvedValueOnce(null);
    dokumenRepo.save.mockResolvedValue({});
    await (svc as any).upsertDittdRow(
      'n1',
      'signed-a',
      {
        nama: 'A',
        positionText: 'Dir',
      } as any,
      false,
    );
    expect(dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        naskahId: 'n1',
        tipe: 'naskah',
        status: 'proses_ttd',
        tahapan: 'tanda_tangan',
        minioKey: 'signed-a',
      }),
    );
    // signer terakhir: update row proses_ttd yang sudah ada → status berubah jadi 'dittd'
    dokumenRepo.findOne.mockResolvedValueOnce({
      id: 'row1',
      naskahId: 'n1',
      tipe: 'naskah',
      status: 'proses_ttd',
    });
    dokumenRepo.update.mockResolvedValue({});
    await (svc as any).upsertDittdRow(
      'n1',
      'signed-b',
      {
        nama: 'B',
        positionText: 'Dir2',
      } as any,
      true,
    );
    expect(dokumenRepo.update).toHaveBeenCalledWith(
      'row1',
      expect.objectContaining({
        minioKey: 'signed-b',
        status: 'dittd',
        tahapan: 'selesai',
      }),
    );
  });

  it('signCombinedFinalNaskah membubuhkan pihak Ditetapkan ke naskah tanpa upload manual', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.update.mockResolvedValue({});
    (svc as any).docxQrInline.injectQrSigners = jest
      .fn()
      .mockResolvedValue(Buffer.from('signed'));
    storageMock.getFile.mockResolvedValueOnce(Buffer.from('original'));
    storageMock.uploadBuffer.mockResolvedValueOnce({
      key: 'naskah-lainnya/PER/n-combined/signed/signed.docx',
      url: 'https://s3/signed.docx',
      bucket: 'b',
    });
    jest.spyOn(svc as any, 'upsertDittdRow').mockResolvedValueOnce(undefined);
    const naskah = {
      id: 'n-combined',
      jenis: 'PER',
      nomor: null,
      tanggal: new Date('2026-08-30'),
      lampiran: 'original.docx',
      signedLampiran: null,
    } as any;
    const rows = [
      {
        id: 'est-1',
        nama: 'Direktur Utama',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
      },
      {
        id: 'est-2',
        nama: 'Direktur Lain',
        jabatan: 'Direktur',
        urutan: 2,
        status: 'waiting',
      },
    ];

    await (svc as any).signCombinedFinalNaskah(
      naskah,
      rows,
      'est-1',
      { nama: 'Direktur Utama', positionText: 'Direktur Utama' },
      false,
    );

    expect((svc as any).docxQrInline.injectQrSigners).toHaveBeenCalledWith(
      Buffer.from('original'),
      [
        expect.objectContaining({
          index: 1,
          nama: 'Direktur Utama',
        }),
      ],
      { nomor: '' },
    );
    expect(naskahRepo.update).toHaveBeenCalledWith(expect.anything(), {
      signedLampiran: 'naskah-lainnya/PER/n-combined/signed/signed.docx',
    });
  });

  it('deleteDraft menghapus MinIO key semua baris naskah + dokumenRepo.delete', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue({
      id: 'n1',
      tahapan: 'konsep',
      tanggal: new Date('2026-08-11'),
      lampiran: 'k-main',
      signedLampiran: null,
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
    id: 'n-sheet',
    jenis: 'PER',
    nomor: 'PER.1',
    perihal: 'p',
    tanggal: new Date('2026-08-18'),
    createdAt: new Date('2026-08-18'),
    tahapan: 'evaluasi',
    butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  const sheetNaskahPersetujuanDireksi = {
    id: 'n-sheet',
    jenis: 'PER',
    nomor: 'PER.1',
    perihal: 'p',
    tanggal: new Date('2026-08-18'),
    createdAt: new Date('2026-08-18'),
    tahapan: 'persetujuan_direksi',
    butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  const sheetNaskahBlankoVerbal = {
    id: 'n-sheet',
    jenis: 'PER',
    nomor: 'PER.1',
    perihal: 'p',
    tanggal: new Date('2026-08-18'),
    createdAt: new Date('2026-08-18'),
    tahapan: 'blanko_verbal',
    butuhLegal: true,
    dikirimOleh: { company: 'CO' },
  };

  function setupDetailMocks() {
    (svc as any).approvalRepo.find.mockResolvedValue([]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);
  }

  it('kirimLembarPersetujuanDireksi legacy: seed approval dan simpan PDF LPD lama', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    const res = await svc.kirimLembarPersetujuanDireksi(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      { nama: 'Pemrakarsa', positionText: 'Kabag' } as any,
    );

    expect((svc as any).lpdService.render).toHaveBeenCalledTimes(1);
    expect((svc as any).dokumenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tipe: 'lembar_persetujuan_direksi_pdf',
        nama: 'lembar-persetujuan-direksi-n-sheet.pdf',
      }),
    );
    const savedApprovals = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'persetujuan_direksi');
    const savedDitetapkan = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'persetujuan_direksi_ditetapkan');
    expect(savedApprovals).toHaveLength(2);
    expect(savedDitetapkan).toHaveLength(1);
    expect(savedApprovals.map((a: any) => a.urutan)).toEqual([1, 2]);
    expect(savedApprovals.every((a: any) => a.status === 'waiting')).toBe(true);
    expect(workflowMock.transisi).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('kirimLembarPersetujuanDireksi legacy: seed sesuai direksi yang dipilih', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    await svc.kirimLembarPersetujuanDireksi(
      'n-sheet',
      {
        perihal: 'p',
        diketahuiOleh: [
          {
            positionId: 'POS_DIR1',
            nama: 'Delegasi Operasi',
            jabatan: 'Direktur Operasi',
          },
        ],
        ditetapkanOleh: [
          {
            positionId: 'POS_DIR2',
            nama: 'Direktur Dua',
            jabatan: 'Direktur Utama',
          },
        ],
      } as any,
      { nama: 'Pemrakarsa', positionText: 'Kabag' } as any,
    );

    const savedApprovals = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'persetujuan_direksi');
    const savedDitetapkan = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'persetujuan_direksi_ditetapkan');
    expect(savedApprovals).toHaveLength(1);
    expect(savedApprovals[0]).toEqual(
      expect.objectContaining({
        positionId: 'POS_DIR1',
        nama: 'Delegasi Operasi',
        jabatan: 'Direktur Operasi',
        status: 'waiting',
      }),
    );
    expect(savedDitetapkan).toHaveLength(1);
    expect(savedDitetapkan[0]).toEqual(
      expect.objectContaining({
        positionId: 'POS_DIR2',
        status: 'waiting',
        urutan: 1,
      }),
    );
  });

  it('parafLembarPersetujuanDireksi: verifikasi baris waiting dan re-generate PDF', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahPersetujuanDireksi);
    const approvalRows = [
      {
        id: 'pd1',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR1',
        nama: 'Direktur Satu',
        jabatan: 'Direktur Operasi',
        urutan: 1,
        status: 'waiting',
      },
      {
        id: 'pd2',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR2',
        nama: 'Direktur Dua',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
      },
    ];
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    workflowMock.applyApproval.mockResolvedValueOnce('blanko_verbal');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).lpdService.render.mockClear();

    const res = await svc.parafLembarPersetujuanDireksi(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      {
        nama: 'Direktur Satu',
        positionId: 'POS_DIR1',
        positionText: 'Direktur Operasi',
      } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(),
      approvalRows,
      'pd1',
      'setuju',
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
      {
        id: 'pd1',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR1',
        nama: 'Direktur Satu',
        jabatan: 'Direktur Operasi',
        urutan: 1,
        status: 'verified',
      },
      {
        id: 'pd2',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR2',
        nama: 'Direktur Dua',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
      },
    ];
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    workflowMock.applyApproval.mockResolvedValueOnce('persetujuan_direksi');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).lpdService.render.mockClear();

    const res = await svc.parafLembarPersetujuanDireksi(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>LPD</p>' } as any,
      {
        nama: 'Direktur Dua',
        positionId: 'POS_DIR2',
        positionText: 'Direktur Utama',
      } as any,
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
      {
        id: 'pd1',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR1',
        nama: 'Direktur Satu',
        jabatan: 'Direktur Operasi',
        urutan: 1,
        status: 'waiting',
      },
      {
        id: 'pd2',
        naskahId: 'n-sheet',
        tahap: 'persetujuan_direksi',
        positionId: 'POS_DIR2',
        nama: 'Direktur Dua',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
      },
    ];
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    workflowMock.applyApproval.mockResolvedValueOnce('legal_drafting');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);

    const res = await svc.tolakLembarPersetujuanDireksi(
      'n-sheet',
      'tidak setuju pasal 5',
      {
        nama: 'Direktur Satu',
        positionId: 'POS_DIR1',
        positionText: 'Direktur Operasi',
      } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(),
      approvalRows,
      'pd1',
      'tolak',
      expect.objectContaining({
        catatan: 'tidak setuju pasal 5',
        manager: txManager,
      }),
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
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    const res = await svc.kirimBlankoVerbal(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>Blanko</p>' } as any,
      {
        nama: 'Legal',
        positionId: 'POS_LEGAL',
        positionText: 'Kabag Hukum',
      } as any,
    );

    expect((svc as any).blankoService.render).toHaveBeenCalledTimes(1);
    const savedApprovals = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'blanko_verbal');
    const savedDitetapkan = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'blanko_verbal_ditetapkan');
    expect(savedApprovals).toHaveLength(2);
    expect(savedDitetapkan).toHaveLength(1);
    expect(savedApprovals.map((a: any) => a.urutan)).toEqual([1, 2]);
    expect(savedApprovals.every((a: any) => a.status === 'waiting')).toBe(true);
    expect(savedDitetapkan.every((a: any) => a.status === 'pending')).toBe(
      true,
    );
    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(),
      'kirim-blanko',
      expect.objectContaining({ manager: txManager }),
    );
    expect(res.success).toBe(true);
  });

  it('kirimApprovalBlanko manual ditutup karena penyelesaian kini otomatis', async () => {
    await expect(
      svc.kirimApprovalBlanko('n-sheet', { nama: 'Legal' } as any),
    ).rejects.toThrow('selesai otomatis');
  });

  it('kirimBlankoVerbal: direksi delegasi (PT) seeding approval ke pengganti, nama row tetap ybs', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahBlankoVerbal);
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    setupDetailMocks();
    workflowMock.transisi.mockClear();

    const res = await svc.kirimBlankoVerbal(
      'n-sheet',
      {
        perihal: 'p',
        bodyHtml: '<p>Blanko</p>',
        ditetapkanOleh: [{ positionId: 'POS_DIR2', nama: 'Direktur Dua' }],
        diketahuiOleh: [
          { positionId: 'POS_DIR1', nama: 'Direktur Satu', delegator: 'ybs' },
          {
            positionId: 'POS_DIR2',
            nama: 'EVP Pengganti',
            delegator: 'PT',
            delegatePersnum: 777,
            delegateName: 'EVP Pengganti',
            delegatePositionStatus: 'PT',
          },
        ],
      } as any,
      {
        nama: 'Legal',
        positionId: 'POS_LEGAL',
        positionText: 'Kabag Hukum',
      } as any,
    );

    const savedApprovals = (txManager.save as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((e: any) => e.tahap === 'blanko_verbal');
    expect(savedApprovals).toHaveLength(2);
    const ybsRow = savedApprovals.find(
      (a: any) => a.positionId === 'POS_DIR1',
    );
    const delegatedRow = savedApprovals.find(
      (a: any) => a.positionId === 'POS_DIR2',
    );
    expect(ybsRow.delegatePersnum ?? null).toBeNull();
    expect(ybsRow.nama).toBe('Direktur Satu');
    // Task paraf diroute ke pengganti (delegatePersnum); nama row tetap
    // ybs direksi, nama pengganti di kolom delegasi.
    expect(delegatedRow.nama).toBe('Direktur Dua');
    expect(delegatedRow.delegatePersnum).toBe(777);
    expect(delegatedRow.delegateName).toBe('EVP Pengganti');
    expect(delegatedRow.delegatePositionStatus).toBe('PT');
    expect(res.success).toBe(true);
  });

  it('parafBlankoVerbal: verifikasi baris waiting dan re-generate PDF', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahBlankoVerbal);
    const approvalRows = [
      {
        id: 'bv1',
        naskahId: 'n-sheet',
        tahap: 'blanko_verbal',
        positionId: 'POS_DIR1',
        nama: 'Direktur Satu',
        jabatan: 'Direktur Operasi',
        urutan: 1,
        status: 'waiting',
      },
      {
        id: 'bv2',
        naskahId: 'n-sheet',
        tahap: 'blanko_verbal',
        positionId: 'POS_DIR2',
        nama: 'Direktur Dua',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
      },
    ];
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    workflowMock.applyApproval.mockResolvedValueOnce('blanko_verbal');
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).blankoService.render.mockClear();

    const res = await svc.parafBlankoVerbal(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>Blanko</p>' } as any,
      {
        nama: 'Direktur Dua',
        positionId: 'POS_DIR2',
        positionText: 'Direktur Utama',
      } as any,
    );

    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(),
      approvalRows,
      'bv2',
      'setuju',
      expect.objectContaining({ aktor: 'Direktur Dua', manager: txManager }),
    );
    expect((svc as any).blankoService.render).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  // ── Delegasi direksi (assign/remove oleh legal role) ──
  it('assignDelegasiDireksi mengisi 5 kolom bila row waiting', async () => {
    const approvalRepo = (svc as any).approvalRepo;
    const legalRole = (svc as any).legalRoleService;
    const row: any = {
      id: 'a1',
      naskahId: 'n1',
      tahap: 'blanko_verbal',
      status: 'waiting',
      delegatePersnum: null,
      delegateName: null,
      delegatePositionStatus: null,
      assignedByPersnum: null,
      assignedAt: null,
    };
    approvalRepo.findOne.mockResolvedValue(row);
    approvalRepo.save.mockImplementation((e: any) => Promise.resolve(e));
    legalRole.getActivePositionIds.mockResolvedValue(['pos-legal']);
    const saved = await svc.assignDelegasiDireksi(
      'n1',
      'a1',
      { delegatePersnum: 12345, delegateName: 'Andi', positionStatus: 'PT' },
      { persnum: 99, nama: 'Legal', positionId: 'pos-legal' } as any,
    );
    expect(saved.delegatePersnum).toBe(12345);
    expect(saved.delegateName).toBe('Andi');
    expect(saved.delegatePositionStatus).toBe('PT');
    expect(saved.status).toBe('waiting');
    expect(row.assignedByPersnum).toBe(99);
    expect(row.assignedAt).toBeInstanceOf(Date);
  });

  it('assignDelegasiDireksi menolak bila baris sudah diparaf (409)', async () => {
    const approvalRepo = (svc as any).approvalRepo;
    const legalRole = (svc as any).legalRoleService;
    approvalRepo.findOne.mockResolvedValue({
      id: 'a1',
      naskahId: 'n1',
      tahap: 'blanko_verbal',
      status: 'verified',
    } as any);
    legalRole.getActivePositionIds.mockResolvedValue(['pos-legal']);
    await expect(
      svc.assignDelegasiDireksi(
        'n1',
        'a1',
        { delegatePersnum: 1, delegateName: 'X', positionStatus: 'PT' },
        { persnum: 99, positionId: 'pos-legal' } as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removeDelegasiDireksi meng-null-kan 5 kolom bila waiting', async () => {
    const approvalRepo = (svc as any).approvalRepo;
    const legalRole = (svc as any).legalRoleService;
    const row: any = {
      id: 'a1',
      naskahId: 'n1',
      tahap: 'blanko_verbal',
      status: 'waiting',
      delegatePersnum: 12345,
      delegateName: 'Andi',
      delegatePositionStatus: 'PT',
      assignedByPersnum: 99,
      assignedAt: new Date(),
    };
    approvalRepo.findOne.mockResolvedValue(row);
    approvalRepo.save.mockResolvedValue(row);
    legalRole.getActivePositionIds.mockResolvedValue(['pos-legal']);
    await svc.removeDelegasiDireksi('n1', 'a1', {
      persnum: 99,
      positionId: 'pos-legal',
    } as any);
    expect(row.delegatePersnum).toBeNull();
    expect(row.delegateName).toBeNull();
    expect(row.delegatePositionStatus).toBeNull();
    expect(row.assignedByPersnum).toBeNull();
    expect(row.assignedAt).toBeNull();
  });

  it('parafBlankoVerbal oleh delegate: verifikasi baris waiting dan aktor a.n. delegasi', async () => {
    const naskahRepo = (svc as any).naskahRepo;
    naskahRepo.findOne.mockResolvedValue(sheetNaskahBlankoVerbal);
    const approvalRows = [
      {
        id: 'bv1',
        naskahId: 'n-sheet',
        tahap: 'blanko_verbal',
        positionId: 'POS_DIR1',
        nama: 'Direktur Satu',
        jabatan: 'Direktur Operasi',
        urutan: 1,
        status: 'waiting',
      },
      {
        id: 'bv2',
        naskahId: 'n-sheet',
        tahap: 'blanko_verbal',
        positionId: 'POS_DIR2',
        nama: 'Direktur Dua',
        jabatan: 'Direktur Utama',
        urutan: 1,
        status: 'waiting',
        delegatePersnum: 5555,
        delegateName: 'Staf Khusus',
        delegatePositionStatus: 'PT',
      },
    ];
    const txManager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementation(async (cb: any) =>
      cb(txManager),
    );
    workflowMock.applyApproval.mockImplementationOnce(
      async (_n, rows, rowId) => {
        const target = rows.find((r: any) => r.id === rowId);
        if (target) target.status = 'verified';
        return 'blanko_verbal';
      },
    );
    setupDetailMocks();
    (svc as any).approvalRepo.find.mockResolvedValueOnce(approvalRows);
    (svc as any).blankoService.render.mockClear();

    const res = await svc.parafBlankoVerbal(
      'n-sheet',
      { perihal: 'p', bodyHtml: '<p>Blanko</p>' } as any,
      {
        nama: 'Staf Khusus',
        persnum: 5555,
        positionId: 'POS_DELEGATE',
        positionText: 'Staf Khusus',
      } as any,
    );

    const targetRow = approvalRows.find((r) => r.id === 'bv2');
    expect(targetRow!.status).toBe('verified');
    expect(workflowMock.applyApproval).toHaveBeenCalledWith(
      expect.anything(),
      approvalRows,
      'bv2',
      'setuju',
      expect.objectContaining({
        aktor: 'Direktur Dua (a.n. PT. Staf Khusus)',
        manager: txManager,
      }),
    );
    expect((svc as any).blankoService.render).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it('kirimEvaluasi sudah tidak digunakan — tugas evaluasi otomatis jatuh ke EVP', async () => {
    await expect(
      svc.kirimEvaluasi('n-eval', { checklist: [] }, { nama: 'X' } as any),
    ).rejects.toThrow('Evaluasi otomatis diteruskan ke EVP');
  });

  it('kirimApprovalLegal finalisasi Legal Drafting → seed tugas evaluasi ke pejabat pemrakarsa (EVP), bukan konseptor', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-eval',
      tanggal: new Date('2026-08-30'),
      tahapan: 'legal_drafting',
      butuhLegal: true,
      dikirimOleh: { position_id: 'POS_INIT' },
    });
    (svc as any).legalRoleService.findAll.mockResolvedValue([
      { positionId: 'POS_LEGAL', nama: 'Legal', isActive: true, chief: true },
    ]);
    (svc as any).approvalRepo.find.mockImplementation(async ({ tahap }: any) =>
      tahap === 'legal_drafting'
        ? [
            {
              id: 'ld-1',
              tahap: 'legal_drafting',
              positionId: 'POS_LEGAL',
              nama: 'Legal',
              jabatan: 'Kepala Unit Legal',
              urutan: 1,
              status: 'waiting',
            },
          ]
        : [],
    );
    workflowMock.transisi.mockImplementationOnce((naskah: any) => {
      naskah.tahapan = 'evaluasi';
    });
    const txManager = {
      find: jest.fn(async () => [
        {
          id: 'p-1',
          tahap: 'persetujuan',
          positionId: 'POS_MANAGER',
          nama: 'Manager',
          jabatan: 'Manager',
          urutan: 1,
          status: 'verified',
        },
        {
          id: 'p-2',
          tahap: 'persetujuan',
          positionId: 'POS_EVP',
          nama: 'EVP Awal',
          jabatan: 'EVP Operasi',
          urutan: 2,
          status: 'verified',
        },
      ]),
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.kirimApprovalLegal(
      'n-eval',
      [{ positionId: 'POS_LEGAL', nama: 'Legal', jabatan: 'Kepala Unit Legal' }],
      { nama: 'Legal', positionId: 'POS_LEGAL' } as any,
    );

    expect(workflowMock.transisi).toHaveBeenCalledWith(
      expect.anything(),
      'kirim-approval-legal',
      expect.objectContaining({ manager: txManager }),
    );
    // Baris lama dihapus dulu (idempotent), lalu seed EVP = simpul terakhir
    // rantai persetujuan awal.
    expect(txManager.delete).toHaveBeenCalledWith(
      NaskahLainnyaApprovalEntity,
      { naskahId: 'n-eval', tahap: 'evaluasi' },
    );
    expect(txManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tahap: 'evaluasi',
        positionId: 'POS_EVP',
        nama: 'EVP Awal',
        jabatan: 'EVP Operasi',
        urutan: 1,
        status: 'waiting',
      }),
    );
  });

  it('keputusanEvaluasi legal_drafting_ulang → perlu_perbaikan (balik ke konseptor untuk revisi form awal)', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-eval-ulang',
      tanggal: new Date('2026-08-31'),
      tahapan: 'evaluasi',
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'evp-active',
        tahap: 'evaluasi',
        positionId: '200',
        nama: 'EVP Operasi',
        jabatan: 'EVP',
        urutan: 1,
        status: 'waiting',
      },
    ]);
    const txManager = {
      find: jest.fn(async () => []),
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.keputusanEvaluasi(
      'n-eval-ulang',
      { keputusan: 'legal_drafting_ulang', catatan: 'Perlu revisi isi' },
      { nama: 'EVP Operasi', positionId: '200' } as any,
    );

    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      { tahapan: 'perlu_perbaikan' },
    );
  });

  it('getDetail pada evaluasi tanpa baris evaluasi → recovery seed tugas EVP; tanpa aksi kirim-evaluasi', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-eval-stuck',
      nomor: 'PER.1',
      jenis: 'PER',
      perihal: 'X',
      tanggal: new Date('2026-08-31'),
      createdAt: new Date('2026-08-31'),
      tahapan: 'evaluasi',
      butuhLegal: true,
      penandatanganChain: [],
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'p-1',
        tahap: 'persetujuan',
        positionId: 'POS_MANAGER',
        nama: 'Manager',
        jabatan: 'Manager',
        urutan: 1,
        status: 'verified',
      },
      {
        id: 'p-2',
        tahap: 'persetujuan',
        positionId: 'POS_EVP',
        nama: 'EVP Awal',
        jabatan: 'EVP Operasi',
        urutan: 2,
        status: 'verified',
      },
    ]);
    (svc as any).riwayatRepo.find.mockResolvedValue([]);
    (svc as any).dokumenRepo.find.mockResolvedValue([]);
    (svc as any).blankoRepo.find.mockResolvedValue([]);
    const txManager = {
      find: jest.fn(async () => [
        {
          id: 'p-2',
          tahap: 'persetujuan',
          positionId: 'POS_EVP',
          nama: 'EVP Awal',
          jabatan: 'EVP Operasi',
          urutan: 2,
          status: 'verified',
        },
      ]),
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );

    const res = await svc.getDetail('n-eval-stuck', {
      nama: 'EVP Awal',
      positionId: 'POS_EVP',
    } as any);

    expect(txManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tahap: 'evaluasi',
        positionId: 'POS_EVP',
        status: 'waiting',
      }),
    );
    // Konseptor tidak lagi menerima naskah evaluasi: satu-satunya aksi adalah
    // keputusan EVP.
    expect(res.data.availableActions).toEqual([
      'lanjut-persetujuan',
      'legal-drafting-ulang',
      'batalkan-evaluasi',
    ]);
  });

  it('keputusanEvaluasi tanpa penerima langsung menuju blanko verbal untuk unit legal', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-eval-direct-blanko',
      tanggal: new Date('2026-08-31'),
      tahapan: 'evaluasi',
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'evp-active',
        tahap: 'evaluasi',
        positionId: '200',
        nama: 'EVP Operasi',
        jabatan: 'EVP',
        urutan: 1,
        status: 'waiting',
      },
    ]);
    orgDataMock.getManagerialSameUnit.mockClear();
    const txManager = {
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.keputusanEvaluasi(
      'n-eval-direct-blanko',
      { keputusan: 'lanjut_persetujuan' },
      { nama: 'EVP Operasi', positionId: '200' } as any,
    );

    expect(orgDataMock.getManagerialSameUnit).not.toHaveBeenCalled();
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      { tahapan: 'blanko_verbal' },
    );
    expect(txManager.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ tahap: 'persetujuan_lanjutan' }),
    );
  });

  it('keputusanEvaluasi mewajibkan alasan untuk kedua opsi penolakan', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-eval-reject',
      tanggal: new Date('2026-08-31'),
      tahapan: 'evaluasi',
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'evp-active',
        tahap: 'evaluasi',
        positionId: '200',
        nama: 'EVP Operasi',
        jabatan: 'EVP',
        urutan: 1,
        status: 'waiting',
      },
    ]);

    await expect(
      svc.keputusanEvaluasi(
        'n-eval-reject',
        { keputusan: 'legal_drafting_ulang' },
        { nama: 'EVP Operasi', positionId: '200' } as any,
      ),
    ).rejects.toThrow('Alasan penolakan wajib diisi');

    await expect(
      svc.keputusanEvaluasi('n-eval-reject', { keputusan: 'batalkan' }, {
        nama: 'EVP Operasi',
        positionId: '200',
      } as any),
    ).rejects.toThrow('Alasan penolakan wajib diisi');
  });

  it('selesaiPersetujuan mengembalikan tugas final kepada EVP awal', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-lanjut',
      tanggal: new Date('2026-08-30'),
      tahapan: 'persetujuan_lanjutan',
    });
    (svc as any).approvalRepo.find.mockResolvedValue([
      {
        id: 'evp-awal',
        tahap: 'evaluasi',
        positionId: 'POS_EVP',
        nama: 'EVP Awal',
        jabatan: 'EVP Operasi',
        urutan: 1,
        status: 'verified',
      },
      {
        id: 'penerima-aktif',
        tahap: 'persetujuan_lanjutan',
        positionId: 'POS_PENERIMA',
        nama: 'Penerima',
        jabatan: 'VP Operasi',
        urutan: 1,
        status: 'waiting',
      },
    ]);
    const txManager = {
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.selesaiPersetujuan('n-lanjut', 'selesai', {
      nama: 'Penerima',
      positionId: 'POS_PENERIMA',
    } as any);

    expect(txManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tahap: 'evaluasi_final',
        positionId: 'POS_EVP',
        nama: 'EVP Awal',
        status: 'waiting',
      }),
    );
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      { tahapan: 'evaluasi_final' },
    );
  });

  it('tolakTandaTangan mengembalikan naskah ke legal dan mereset proses signing', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-sign',
      tanggal: new Date('2026-08-30'),
      tahapan: 'tanda_tangan',
      signingIndex: 2,
      signedLampiran: 'signed/signed.docx',
      butuhLegal: true,
      penandatanganChain: [
        { positionId: 'POS_1', nama: 'Signer 1', jabatan: 'Direktur' },
        { positionId: 'POS_2', nama: 'Signer 2', jabatan: 'Direktur Utama' },
      ],
    });
    const txManager = {
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.tolakTandaTangan('n-sign', 'Pasal perlu diperbaiki', {
      nama: 'Signer 2',
      positionId: 'POS_2',
      positionText: 'Direktur Utama',
    } as any);

    expect(txManager.delete).toHaveBeenCalledWith(NaskahLainnyaApprovalEntity, {
      naskahId: 'n-sign',
      tahap: 'legal_drafting',
    });
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      expect.objectContaining({
        tahapan: 'legal_drafting',
        signingIndex: null,
        signedLampiran: null,
        butuhLegal: true,
      }),
    );
    expect(txManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'tolak-tanda-tangan',
        tahap: 'tanda_tangan',
        status: 'legal_drafting',
        catatan: 'Pasal perlu diperbaiki',
      }),
    );
  });

  it('tolakTandaTangan TTD fisik mengembalikan Naskah Draft ke pemrakarsa tanpa unit legal', async () => {
    (svc as any).naskahRepo.findOne.mockResolvedValue({
      id: 'n-sign-fisik',
      tanggal: new Date('2026-08-31'),
      tahapan: 'tanda_tangan',
      signOption: 'ttd_basah',
      signingIndex: 1,
      nomor: null,
      butuhLegal: false,
      penandatanganChain: [
        { positionId: 'POS_1', nama: 'Signer 1', jabatan: 'Direktur' },
      ],
    });
    const txManager = {
      save: jest.fn((entity) => entity),
      update: jest.fn(),
      delete: jest.fn(),
    };
    (svc as any).dataSource.transaction.mockImplementationOnce((cb: any) =>
      cb(txManager),
    );
    jest
      .spyOn(svc as any, 'publishWorkflowUpdate')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(svc, 'getDetail')
      .mockResolvedValueOnce({ success: true } as any);

    await svc.tolakTandaTangan('n-sign-fisik', 'Draft perlu diperbaiki', {
      nama: 'Signer 1',
      positionId: 'POS_1',
      positionText: 'Direktur',
    } as any);

    expect(txManager.delete).not.toHaveBeenCalledWith(
      NaskahLainnyaApprovalEntity,
      expect.objectContaining({ tahap: 'legal_drafting' }),
    );
    expect(txManager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.anything(),
      expect.objectContaining({
        tahapan: 'perlu_perbaikan',
        signingIndex: null,
        signedLampiran: null,
      }),
    );
    expect(txManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'tolak-tanda-tangan',
        tahap: 'tanda_tangan',
        status: 'perlu_perbaikan',
        catatan: 'Draft perlu diperbaiki',
      }),
    );
  });
});
