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

  describe('findBodByCompany', () => {
    // rows = OrgDatum[]; BOD bersar di position_json (array flat barisData dari
    // flattenOrgTree) dengan field company/position/position_text/
    // persnum_person/persnum_person_text/bod_tag langsung. Company TIDAK
    // difilter — direksi = semua baris bod_tag='BOD' di seluruh org.
    it('returns all bod_tag=BOD records regardless of company, dirut first', () => {
      const rows = [
        {
          position_json: [
            { company: 'A', bod_tag: 'BOD', position: 'P1', position_text: 'Direktur Operasi', persnum_person: 1001, persnum_person_text: 'Andi' },
            { company: 'A', bod_tag: 'BOD', position: 'P2', position_text: 'Direktur Utama', persnum_person: 1002, persnum_person_text: 'Budi' },
            { company: 'A', bod_tag: '', position: 'P3', position_text: 'Manager', persnum_person: 1003, persnum_person_text: 'Caca' },
            { company: 'B', bod_tag: 'BOD', position: 'P4', position_text: 'Direktur', persnum_person: 1004, persnum_person_text: 'Dedi' },
          ],
        },
      ];
      // arg company diabaikan — semua BOD (P1, P2, P4) ikut, bukan hanya 'A'.
      const result = service.findBodByCompany(rows as any, 'A');
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.positionId)).toContain('P1');
      expect(result.map((r) => r.positionId)).toContain('P2');
      expect(result.map((r) => r.positionId)).toContain('P4');
      expect(result[0].positionId).toBe('P2'); // Dirut first
    });

    it('returns empty when no bod_tag=BOD entries exist', () => {
      const rows = [
        { position_json: [{ company: 'A', bod_tag: '', position: 'P1', position_text: 'Manager', persnum_person: 1, persnum_person_text: 'X' }] },
      ];
      expect(service.findBodByCompany(rows as any, 'Z')).toHaveLength(0);
    });

    it('returns empty when position_json is empty', () => {
      expect(service.findBodByCompany([{ position_json: [] }] as any, '')).toHaveLength(0);
    });
  });
});