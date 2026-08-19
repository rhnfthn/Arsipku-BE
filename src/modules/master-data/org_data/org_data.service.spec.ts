import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrgDataService } from './org_data.service';
import { OrgDatum } from './entities/org_datum.entity';

describe('OrgDataService', () => {
  let service: OrgDataService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        OrgDataService,
        { provide: getRepositoryToken(OrgDatum), useValue: {} },
      ],
    }).compile();

    service = module.get<OrgDataService>(OrgDataService);
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAtasanManagerial', () => {
    // Posisi pengaju (AVP) di direktorat 1, EVP di divisi yang sama, dan
    // Direktur Utama di direktorat berbeda (2). Tanpa jaminan "wajib ada",
    // DU tertahan oleh filter direktorat — harus tetap disertakan.
    const POSITION_JSON = [
      { position: 100, position_text: 'AVP Finance', chief: 1, company: 1, divisi_id: 10, direktorat_id: 1, persnum_person: 5001, persnum_person_text: 'Andi' },
      { position: 200, position_text: 'EVP Finance', chief: 1, company: 1, divisi_id: 10, direktorat_id: 1, persnum_person: 5002, persnum_person_text: 'Budi' },
      { position: 300, position_text: 'Direktur Utama', chief: 1, company: 1, divisi_id: 99, direktorat_id: 2, persnum_person: 5003, persnum_person_text: 'Citra' },
    ];

    it('selalu menyertakan Direktur Utama meskipun di direktorat berbeda', async () => {
      jest.spyOn(service, 'findOrg').mockResolvedValue({ position_json: POSITION_JSON } as any);

      const result = await service.getAtasanManagerial(100);

      const du = result.data.find((x: any) => Number(x.position) === 300);
      expect(du).toBeDefined();
      expect(String(du.position_text)).toMatch(/Direktur Utama/i);
    });

    it('tidak menyertakan posisi pengaju sendiri sebagai atasan', async () => {
      jest.spyOn(service, 'findOrg').mockResolvedValue({ position_json: POSITION_JSON } as any);

      const result = await service.getAtasanManagerial(100);

      expect(result.data.find((x: any) => Number(x.position) === 100)).toBeUndefined();
    });
  });
});