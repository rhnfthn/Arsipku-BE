import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NaskahUmumService } from './naskah-umum.service';
import { StorageService } from '../../storage/services/storage.service';
import { DocxFillerService } from './docx-filler.service';
import { NaskahUmumTempEntity } from '../../onlyoffice/entities/naskah-umum-temp.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { OnlyOfficeService } from '../../onlyoffice/services/onlyoffice.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { PdfQrEmbedService } from '../../digsig/services/pdf-qr-embed.service';
import { DataSource } from 'typeorm';

describe('NaskahUmumService', () => {
  let service: NaskahUmumService;
  let storage: {
    getFile: jest.Mock;
    uploadBuffer: jest.Mock;
    getFileUrl: jest.Mock;
  };
  let filler: { fill: jest.Mock };
  let tempRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let onlyOffice: { convertToPdf: jest.Mock };
  let nomorSurat: { generateNomor: jest.Mock };
  let pdfQrEmbed: { embedQRCodeToPdf: jest.Mock };
  let dataSourceMock: { createQueryRunner: jest.Mock };
  let queryRunner: any;

  beforeEach(async () => {
    storage = {
      getFile: jest.fn().mockResolvedValue(Buffer.from('saved-docx')),
      uploadBuffer: jest
        .fn()
        .mockResolvedValue({
          key: 'naskah-umum-final/1234567890-final.docx',
          url: 'http://s3/final.docx',
          bucket: 'arsipku',
        }),
      getFileUrl: jest.fn().mockResolvedValue('http://s3/final.pdf'),
    };
    filler = { fill: jest.fn().mockReturnValue(Buffer.from('filled-docx')) };
    tempRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'temp-id',
        jenis: 'UND',
        fieldsJson: JSON.stringify({
          perihal: 'Test',
          dari: 'Direktur Utama',
          tujuan: ['A'],
          tglsurat: '2026-07-07',
          namapengirim: 'Budi',
          klasifikasi: 'OPS.12',
          sifat: 'biasa',
        }),
        s3KeySaved: 'naskah-umum-temp/temp-id-saved.docx',
        status: 'saved',
      }),
      create: jest.fn().mockReturnValue({ id: 'temp-id' }),
      save: jest.fn().mockResolvedValue({ id: 'temp-id' }),
    };
    onlyOffice = {
      convertToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    };
    nomorSurat = {
      generateNomor: jest.fn().mockResolvedValue({
        nomor: 'ND-001/OPS.12/DIRUT/2026',
        noUrut: '001',
        jabatan: 'DIRUT',
        bulan: 'VII',
        tahun: 2026,
      }),
    };
    pdfQrEmbed = {
      embedQRCodeToPdf: jest.fn().mockResolvedValue({
        success: true,
        pdfBuffer: Buffer.from('signed-pdf'),
        message: 'QR embedded',
      }),
    };

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        create: jest.fn().mockImplementation((entity: any, val: any) => val),
        save: jest.fn().mockResolvedValue({ id: 'saved-id' }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      },
    };
    dataSourceMock = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NaskahUmumService,
        { provide: StorageService, useValue: storage },
        { provide: DocxFillerService, useValue: filler },
        {
          provide: getRepositoryToken(NaskahUmumTempEntity),
          useValue: tempRepo,
        },
        { provide: OnlyOfficeService, useValue: onlyOffice },
        { provide: NomorSuratService, useValue: nomorSurat },
        { provide: PdfQrEmbedService, useValue: pdfQrEmbed },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'APP_PUBLIC_URL' ? 'http://be:3000' : undefined) },
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();
    service = moduleRef.get(NaskahUmumService);
  });

  describe('getTemplateSchema', () => {
    it('getTemplateSchema returns UND schema with expected fields', () => {
      const schema = service.getTemplateSchema('UND');
      expect(schema).not.toBeNull();
      expect(schema!.jenis).toBe('UND');
      expect(schema!.templateS3Key).toBe('templates/naskah-umum/UND.docx');
      const fieldNames = schema!.fields.map((f) => f.name);
      expect(fieldNames).toContain('perihal');
      expect(fieldNames).toContain('dari');
      expect(fieldNames).toContain('tujuan');
      expect(fieldNames).toContain('tglsurat');
      expect(fieldNames).toContain('namapengirim');
    });

    it('getTemplateSchema returns null for unknown jenis', () => {
      expect(service.getTemplateSchema('UNKNOWN')).toBeNull();
    });
  });

  describe('getTempStatus', () => {
    it('returns the status of an existing temp record', async () => {
      const status = await service.getTempStatus('temp-id');
      expect(status).toBe('saved');
      expect(tempRepo.findOne).toHaveBeenCalledWith({ where: { id: 'temp-id' } });
    });

    it('returns null when temp record is not found', async () => {
      tempRepo.findOne = jest.fn().mockResolvedValue(null);
      const status = await service.getTempStatus('missing-id');
      expect(status).toBeNull();
    });
  });

  describe('createPreview', () => {
    it('fills template, uploads temp, creates DB record, returns tempId + s3Key', async () => {
      const fields = {
        perihal: 'Test',
        dari: 'Ops',
        tujuan: ['A'],
        tglsurat: '2026-07-07',
        namapengirim: 'Budi',
      };
      const res = await service.createPreview('UND', fields, 'u1');

      expect(storage.getFile).toHaveBeenCalledWith(
        'templates/naskah-umum/UND.docx',
      );
      expect(filler.fill).toHaveBeenCalledWith(
        Buffer.from('saved-docx'),
        expect.objectContaining({ ...fields, nomor: '' }),
      );
      expect(storage.uploadBuffer).toHaveBeenCalledWith(
        Buffer.from('filled-docx'),
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$/,
        ),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'naskah-umum-temp',
      );
      expect(tempRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jenis: 'UND',
          fieldsJson: JSON.stringify(fields),
          s3Key: 'naskah-umum-final/1234567890-final.docx',
          status: 'preview',
          createdBy: 'u1',
        }),
      );
      expect(tempRepo.save).toHaveBeenCalledWith({ id: 'temp-id' });
      expect(res.tempId).toBeTruthy();
      expect(res.s3Key).toBe('naskah-umum-final/1234567890-final.docx');
    });

    it('throws BadRequestException for unknown jenis', async () => {
      await expect(
        service.createPreview('NOPE', {}, 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(storage.getFile).not.toHaveBeenCalled();
      expect(filler.fill).not.toHaveBeenCalled();
      expect(storage.uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('finalizeSend', () => {
    it('generates nomor, converts to PDF, embeds QR, creates naskah + sirkulasi, marks temp sent', async () => {
      const dto = {
        tempId: 'temp-id',
        jenis: 'UND',
        sign_option: 'qr_only' as const,
        penerima: [100, 200],
        klasifikasi: 'OPS.12',
        sifat: 'biasa' as const,
      };

      const res = await service.finalizeSend(dto, 'u1');

      expect(tempRepo.findOne).toHaveBeenCalledWith({ where: { id: 'temp-id' } });
      expect(storage.getFile).toHaveBeenCalledWith('naskah-umum-temp/temp-id-saved.docx');
      expect(nomorSurat.generateNomor).toHaveBeenCalledWith(
        expect.objectContaining({
          jenis: 'UND',
          positionText: 'Direktur Utama',
          areaText: 'Pusat',
          klasifikasi: 'OPS.12',
        }),
      );
      expect(filler.fill).toHaveBeenCalledWith(
        Buffer.from('saved-docx'),
        expect.objectContaining({ nomor: 'ND-001/OPS.12/DIRUT/2026' }),
      );
      expect(storage.uploadBuffer).toHaveBeenCalledWith(
        Buffer.from('filled-docx'),
        'temp-id.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'naskah-umum-final',
      );
      expect(onlyOffice.convertToPdf).toHaveBeenCalledWith(
        'naskah-umum-final/1234567890-final.docx',
      );
      expect(pdfQrEmbed.embedQRCodeToPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        expect.objectContaining({
          signature_id: expect.any(String),
          document_number: 'ND-001/OPS.12/DIRUT/2026',
          signer_name: 'Budi',
          signer_jabatan: 'Direktur Utama',
          document_type: 'UND',
          verification_url: expect.stringContaining('/validasi/'),
        }),
      );
      expect(storage.uploadBuffer).toHaveBeenCalledWith(
        Buffer.from('signed-pdf'),
        'temp-id.pdf',
        'application/pdf',
        'naskah-umum-final',
      );
      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahEntity,
        expect.objectContaining({
          jenis: 'UND',
          nomor: 'ND-001/OPS.12/DIRUT/2026',
          perihal: 'Test',
          konten: '',
          final_pdf: 'http://s3/final.pdf',
          status: 'final',
          signOption: 'qr_only',
          klasifikasi: 'OPS.12',
          sifat: 'biasa',
        }),
      );
      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahSirkulasi,
        expect.objectContaining({
          sirkuler: 'pengirim',
          positionText: 'Direktur Utama',
          namaSirkuler: 'Budi',
        }),
      );
      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahSirkulasi,
        expect.objectContaining({
          sirkuler: 'penerima',
          position: '100',
        }),
      );
      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahSirkulasi,
        expect.objectContaining({
          sirkuler: 'penerima',
          position: '200',
        }),
      );
      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        NaskahUmumTempEntity,
        expect.objectContaining({ status: 'sent' }),
      );
      expect(res).toEqual(
        expect.objectContaining({
          nomor: 'ND-001/OPS.12/DIRUT/2026',
          status: 'final',
          final_pdf: 'http://s3/final.pdf',
        }),
      );
    });

    it('creates tembusan sirkulasi and finalizes temporary lampiran when provided', async () => {
      const dto = {
        tempId: 'temp-id',
        jenis: 'UND',
        sign_option: 'qr_only' as const,
        penerima: [100],
        tembusan: [300, 301],
        lampiran_temp_ids: ['lamp-1', 'lamp-2'],
        klasifikasi: 'OPS.12',
        sifat: 'biasa' as const,
      };

      const res = await service.finalizeSend(dto, 'u1');

      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahSirkulasi,
        expect.objectContaining({
          sirkuler: 'tembusan',
          position: '300',
        }),
      );
      expect(queryRunner.manager.create).toHaveBeenCalledWith(
        NaskahSirkulasi,
        expect.objectContaining({
          sirkuler: 'tembusan',
          position: '301',
        }),
      );
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        NaskahLampiranEntity,
        expect.objectContaining({ id: expect.anything(), is_temporary: 1 }),
        { id_naskah: expect.any(String), is_temporary: 0, temp_folder_id: null },
      );
      expect(res).toEqual(
        expect.objectContaining({
          nomor: 'ND-001/OPS.12/DIRUT/2026',
          status: 'final',
        }),
      );
    });

    it('throws if temp is not saved', async () => {
      tempRepo.findOne = jest.fn().mockResolvedValue({
        id: 'temp-id',
        status: 'preview',
        s3KeySaved: null,
      });

      await expect(
        service.finalizeSend({ tempId: 'temp-id' } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
