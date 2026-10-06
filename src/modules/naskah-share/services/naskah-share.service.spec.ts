import { NaskahShareService } from './naskah-share.service';

describe('NaskahShareService dissemination recipients', () => {
  it('mengambil satu posisi utama per karyawan aktif dan mengecualikan pengirim', async () => {
    const personRepo = {
      find: jest.fn().mockResolvedValue([
        { persnum: 2, name: 'Karyawan Dua' },
        { persnum: 3, name: 'Karyawan Tiga' },
      ]),
    };
    const orgDataService = {
      findLatestOrg: jest.fn().mockResolvedValue({
        position_json: [
          {
            position: 'POS-SENDER',
            persnum_person: 1,
            position_text: 'Pengirim',
          },
          {
            position: 'POS-2-PRIMARY',
            persnum_person: 2,
            position_text: 'Staf Dua',
            organization_text: 'Unit A',
          },
          {
            position: 'POS-2-DELEGATE',
            persnum_person: 2,
            position_text: 'Delegasi Dua',
            organization_text: 'Unit B',
          },
          {
            position: 'POS-3',
            persnum_person: 3,
            position_text: 'Staf Tiga',
            organization_text: 'Unit C',
          },
          {
            position: 'POS-NO-PERSON',
            persnum_person: 4,
            position_text: 'Tidak Aktif',
          },
        ],
      }),
    };

    const service = new NaskahShareService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      personRepo as any,
      orgDataService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const recipients = await (service as any).fetchAllEmployeeData(
      'POS-SENDER',
      1,
    );

    expect(recipients).toEqual([
      {
        id: 'POS-2-PRIMARY',
        persnum: 2,
        nama: 'Karyawan Dua',
        positionText: 'Staf Dua',
        organizationText: 'Unit A',
      },
      {
        id: 'POS-3',
        persnum: 3,
        nama: 'Karyawan Tiga',
        positionText: 'Staf Tiga',
        organizationText: 'Unit C',
      },
    ]);
    expect(personRepo.find).toHaveBeenCalledTimes(1);
  });

  it('mengambil PDF final Naskah Lainnya dari preview dokumen dittd', async () => {
    const documentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          tipe: 'naskah',
          minioKey: 'naskah-lainnya/EDR/id/signed/signed.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          previewMinioKey: 'naskah-lainnya/EDR/id/signed/signed.pdf',
        },
      ]),
    };
    const service = new NaskahShareService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      documentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const key = await (service as any).resolveFinalPdfKey({
      id: 'id',
      final_pdf: null,
      tahapan: 'selesai',
      signOption: 'qr_only',
      signedLampiran: 'naskah-lainnya/EDR/id/signed/signed.docx',
    });

    expect(key).toBe('naskah-lainnya/EDR/id/signed/signed.pdf');
    expect(documentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ naskahId: 'id' }),
      }),
    );
  });

  it('menganggap Naskah Lainnya legacy selesai sebagai final jika artifact dittd tersedia', async () => {
    const documentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          naskahId: 'kep-legacy',
          tipe: 'naskah',
          status: 'dittd',
          minioKey: 'signed.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          previewMinioKey: 'signed.pdf',
        },
      ]),
    };
    const service = new NaskahShareService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      documentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await (service as any).findNotFinalizedNaskahs([
      {
        id: 'kep-legacy',
        status: 'draf',
        tahapan: 'selesai',
        signOption: 'qr_only',
      },
    ]);

    expect(result).toEqual([]);
  });

  it('tetap menolak Naskah Lainnya TTD fisik yang masih pending', async () => {
    const documentRepo = { find: jest.fn() };
    const service = new NaskahShareService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      documentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const pending = {
      id: 'physical-pending',
      status: 'pending',
      tahapan: 'selesai',
      signOption: 'ttd_basah',
    };

    const result = await (service as any).findNotFinalizedNaskahs([pending]);

    expect(result).toEqual([pending]);
    expect(documentRepo.find).not.toHaveBeenCalled();
  });
});
