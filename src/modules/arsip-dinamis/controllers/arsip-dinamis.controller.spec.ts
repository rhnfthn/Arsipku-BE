import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArsipDinamisController } from './arsip-dinamis.controller';
import { ArsipDinamisService } from '../services';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';

describe('ArsipDinamisController - getRiwayatPersetujuan', () => {
  let controller: ArsipDinamisController;
  let service: { getRiwayatPersetujuan: jest.Mock };

  beforeEach(async () => {
    service = {
      getRiwayatPersetujuan: jest
        .fn()
        .mockResolvedValue({ data: [], meta: { total: 0 } }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ArsipDinamisController],
      providers: [
        { provide: ArsipDinamisService, useValue: service },
        { provide: getRepositoryToken(KlasifikasiEntity), useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(ArsipDinamisController);
  });

  it('meneruskan persnum + parameter terkoersi ke service', async () => {
    await controller.getRiwayatPersetujuan(
      { persnum: '12345' },
      'foo',
      'approved',
      '2',
      '50',
    );
    expect(service.getRiwayatPersetujuan).toHaveBeenCalledWith('12345', {
      search: 'foo',
      status: 'approved',
      page: 2,
      limit: 50,
    });
  });

  it('default page=1 limit=20 jika tidak diberikan', async () => {
    await controller.getRiwayatPersetujuan(
      { persnum: 99 },
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(service.getRiwayatPersetujuan).toHaveBeenCalledWith('99', {
      search: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });
});
