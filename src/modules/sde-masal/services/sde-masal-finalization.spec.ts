import { SdeMasalService } from './sde-masal.service';
import { SuratDinasEksternalService } from '../../surat-dinas-eksternal/services/surat-dinas-eksternal.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { getBrowser } from '../../generate_pdf/puppeteer.provider';

jest.mock('../../generate_pdf/pdf.queue', () => ({
  pdfQueue: { add: jest.fn((task: () => Promise<Buffer>) => task()) },
}));
jest.mock('../../generate_pdf/puppeteer.provider', () => ({
  getBrowser: jest.fn(),
  resetBrowser: jest.fn(),
}));
jest.mock('../../digsig/services/digsig.service', () => ({
  DigsigService: jest.fn(),
}));
jest.mock('../../digsig/services/qrcode.service', () => ({
  QRCodeService: jest.fn(),
}));

describe('SDE Massal recipient in finalized PDF', () => {
  const sender = {
    position: 70016786,
    chief: 1,
    position_text: 'EVP of Technology Solution',
    persnum_person_text: 'Nama Pengirim',
  };
  const employee = {
    position: 70016579,
    persnum_person: 10099169,
    persnum_person_text: 'AVIRIANTO SURATNO',
    position_text: 'Direktur Utama',
    organization_text: 'Direktorat Utama',
    position_status: 'ybs',
  };
  const external = {
    id: '6d3645c3-84ac-4d5c-b227-885d63e83a99',
    kode: 'SHMEG',
    nama: 'PT KORESPONDENSI INDONESIA',
    aktif: true,
  };
  let renderedHtml: string;

  beforeEach(() => {
    renderedHtml = '';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    (getBrowser as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setDefaultTimeout: jest.fn(),
        setJavaScriptEnabled: jest.fn(),
        setRequestInterception: jest.fn(),
        on: jest.fn(),
        setContent: jest.fn(async (html: string) => {
          renderedHtml = html;
        }),
        pdf: jest.fn(async () => Buffer.from(renderedHtml)),
        isClosed: jest.fn().mockReturnValue(false),
        close: jest.fn(),
      }),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  function createFixture(recipient: Record<string, unknown>) {
    const orgDataService = {
      findOrg: jest
        .fn()
        .mockResolvedValue({ position_json: [sender, employee] }),
      findLatestOrg: jest
        .fn()
        .mockResolvedValue({ position_json: [sender, employee] }),
    };
    const eksternalRepository = {
      find: jest.fn(async ({ where }) =>
        where.kode === external.kode ? [external] : [],
      ),
      findOne: jest.fn(async ({ where }) =>
        where.id === external.id ? external : null,
      ),
    };
    const queryBuilder: any = {};
    for (const method of ['update', 'set', 'where', 'andWhere']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.execute = jest.fn().mockResolvedValue({});
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(async (value) => value),
        update: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        getRepository: jest
          .fn()
          .mockReturnValue({
            findOne: jest.fn().mockResolvedValue({ status: 'final' }),
          }),
      },
    };
    const uploadBuffer = jest.fn().mockResolvedValue({ key: 'final/test.pdf' });
    const sde = Object.assign(
      Object.create(SuratDinasEksternalService.prototype),
      {
        orgDataService,
        eksternalRepository,
        dataSource: {
          createQueryRunner: jest.fn().mockReturnValue(queryRunner),
        },
        naskahRepository: { create: jest.fn((value) => value) },
        createSirkulasiFromOrgData: jest.fn().mockResolvedValue({}),
        createSirkulasiFromEksternal: jest.fn().mockResolvedValue({}),
        getHeaderInfoByUser: jest.fn().mockResolvedValue(null),
        generatePdfSudinService: new GeneratePdfSudinService(),
        qrCodeService: {
          generateQRCodeBase64: jest
            .fn()
            .mockResolvedValue('data:image/png;base64,cXI='),
        },
        storageService: { uploadBuffer },
        createFinalPdfFileName: jest.fn().mockResolvedValue('test.pdf'),
        meilisearchSyncService: {
          syncNaskah: jest.fn().mockResolvedValue(undefined),
        },
      },
    );
    const item = {
      id: 'test-item',
      folderId: 'test-folder',
      naskahId: null as string | null,
      recipientData: JSON.stringify({
        ...recipient,
        perihal: 'Pengujian',
        variables: { nama: 'pesta' },
        __sdeMasalReservedNomor: '1342/TT/TNG/LPPNPI/AUD.01/X/2026',
      }),
    };
    const folder = {
      id: item.folderId,
      recipientType: 'EXTERNAL',
      pengirimId: String(sender.position),
      tanggal: new Date('2026-10-13'),
      kontenTemplate: '<p>{{nama}}</p>',
      klasifikasi: 'AUD.01',
    };
    const service = Object.assign(Object.create(SdeMasalService.prototype), {
      repo: {
        findOne: jest.fn().mockResolvedValue(item),
        save: jest.fn(async (value) => value),
      },
      folderRepo: { findOne: jest.fn().mockResolvedValue(folder) },
      orgDataService,
      eksternalRepository,
      sirkulasiRepository: { update: jest.fn() },
      sdeService: sde,
    });
    return { service: service as SdeMasalService, item, uploadBuffer, sde };
  }

  it('keeps the employee name in the final PDF of a mixed folder and preserves the custom nama variable', async () => {
    const { service, item, uploadBuffer } = createFixture({
      recipientType: 'INTERNAL',
      recipientIdInput: '10099169',
      employeeIdInput: '10099169',
      employeeName: employee.persnum_person_text,
      tertuju: employee.persnum_person_text,
    });
    await service.finalizeNaskah(
      item.id,
      'qr_only',
      undefined,
      sender.position,
      undefined,
      false,
    );
    const address = renderedHtml.split('Kepada Yth.')[1]?.split('Di Tempat')[0];
    expect(address).toContain('AVIRIANTO SURATNO');
    expect(address).not.toContain('Direktur Utama');
    expect(address).not.toContain('pesta');
    expect(renderedHtml).toContain('<p>pesta</p>');
    expect(renderedHtml).toContain('alt="QR Code"');
    expect(uploadBuffer.mock.calls[0][0].toString()).toContain(
      'AVIRIANTO SURATNO',
    );
    expect(JSON.parse(item.recipientData).recipientType).toBe('INTERNAL');
    expect(item.naskahId).toBeTruthy();
  });

  it('keeps an external recipient in the final PDF of the same mixed-folder format', async () => {
    const { service, item } = createFixture({
      recipientType: 'EXTERNAL',
      recipientIdInput: external.kode,
      idTertuju: external.id,
      tertuju: external.nama,
    });
    await service.finalizeNaskah(
      item.id,
      'qr_only',
      undefined,
      sender.position,
      undefined,
      false,
    );
    const address = renderedHtml.split('Kepada Yth.')[1]?.split('Di Tempat')[0];
    expect(address).toContain(external.nama);
    expect(address).not.toContain(employee.persnum_person_text);
    expect(JSON.parse(item.recipientData).recipientType).toBe('EXTERNAL');
  });

  it('keeps the employee address when rendering legacy data without a stored final file or inbox circulation', async () => {
    const { service, item, sde } = createFixture({
      recipientType: 'INTERNAL',
      recipientIdInput: '10099169',
      employeeIdInput: '10099169',
      employeeName: employee.persnum_person_text,
      tertuju: employee.persnum_person_text,
    });
    const naskahId = 'signed-internal';
    item.naskahId = naskahId;
    Object.assign(service, {
      naskahRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: naskahId,
          nomor: '1342/TT/TNG/LPPNPI/AUD.01/X/2026',
          signOption: 'qr_only',
          createdAt: new Date('2026-10-13'),
        }),
      },
      sirkulasiRepository: {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest
          .fn()
          .mockResolvedValue({
            namaSirkuler: 'Nama Pengirim',
            positionText: sender.position_text,
          }),
      },
    });
    await service.generateSentNaskahPreviewPdf(naskahId, {});
    expect(
      renderedHtml.split('Kepada Yth.')[1]?.split('Di Tempat')[0],
    ).toContain(employee.persnum_person_text);
    expect(sde.qrCodeService.generateQRCodeBase64).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: naskahId }),
    );
  });

  it.each(['qr_only', 'digsig', 'ttd_basah'])(
    'returns the exact stored final PDF including attachments for %s before internal inbox dispatch',
    async (signOption) => {
      const { service, sde } = createFixture({
        recipientType: 'INTERNAL',
        recipientIdInput: '10099169',
        employeeName: employee.persnum_person_text,
        tertuju: employee.persnum_person_text,
      });
      const finalFile = Buffer.from(
        'PDF final with AVIRIANTO SURATNO, original QR and attachments',
      );
      const getFile = jest.fn().mockResolvedValue(finalFile);
      const findCirculation = jest.fn().mockResolvedValue([]);
      const regenerate = jest.spyOn(sde, 'generatePdfFromHtml');
      Object.assign(service, {
        naskahRepository: {
          findOne: jest.fn().mockResolvedValue({
            id: 'signed-internal',
            final_pdf: 'final/original.pdf',
            signOption,
          }),
        },
        storageService: { getFile },
        sirkulasiRepository: { find: findCirculation },
      });
      const response = await service.generateSentNaskahPreviewPdf(
        'signed-internal',
        {},
      );
      expect(response).toBe(finalFile);
      expect(getFile).toHaveBeenCalledWith('final/original.pdf');
      expect(findCirculation).not.toHaveBeenCalled();
      expect(regenerate).not.toHaveBeenCalled();
    },
  );
});
