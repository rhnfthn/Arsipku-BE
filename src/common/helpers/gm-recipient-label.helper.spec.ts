import { formatGmRecipientLabel } from './gm-recipient-label.helper';
import { formatSdiPdfRecipientLabel } from '../../modules/surat-dinas-internal/helpers/sdi-pdf-recipient-label.helper';
import { NotaDinasService } from '../../modules/nota-dinas/services/nota-dinas.service';
import { SuratDinasInternalService } from '../../modules/surat-dinas-internal/services/surat-dinas-internal.service';
import { SuratDinasEksternalService } from '../../modules/surat-dinas-eksternal/services/surat-dinas-eksternal.service';
import { KonsepService } from '../../modules/konsep/services/konsep.service';
import { KajianService } from '../../modules/kajian/services/kajian.service';

describe('GM correspondence recipient label', () => {
  it.each([
    NotaDinasService,
    SuratDinasInternalService,
    SuratDinasEksternalService,
    KonsepService,
    KajianService,
  ])(
    'resolves GM format through %p preview recipient lookup',
    async (Service) => {
      const org = [
        {
          position: 123,
          persnum_person_text: 'BUDI',
          position_abbreviation: 'GM-LMB',
          position_text: 'General Manager',
          area_text: 'Cabang Lombok',
        },
      ];
      const service = Object.assign(Object.create(Service.prototype), {
        orgDataService: {
          findOrg: jest.fn().mockResolvedValue({ position_json: org }),
        },
        getPositionData: jest.fn().mockResolvedValue(org),
      });
      expect(
        await service.convertPositionIdsToNames([123], '2026-10-06'),
      ).toEqual(['Budi - GM-LMB - General Manager - Cabang Lombok']);
    },
  );
  it('renders name, abbreviation, position and branch', () => {
    const source = {
      persnum_person_text: 'BUDI',
      position_abbreviation: 'GM',
      position_text: 'General Manager',
      area_text: 'Cabang Lombok',
    };
    expect(formatGmRecipientLabel(source)).toBe(
      'Budi - GM - General Manager - Cabang Lombok',
    );
    expect(formatSdiPdfRecipientLabel(source)).toBe(
      'Budi - GM - General Manager - Cabang Lombok',
    );
  });
  it('uses saved branch aliases and does not duplicate an existing branch', () => {
    expect(
      formatGmRecipientLabel({
        namaSirkuler: 'BUDI SANTOSO',
        positionText: 'General Manager',
        areaText: '',
        subAreaText: 'Cabang JATSC',
        positionStatus: 'PT',
      }),
    ).toBe('Budi Santoso - GM - PT. General Manager - Cabang JATSC');
    expect(
      formatGmRecipientLabel({
        nama: 'BUDI',
        position_text: 'General Manager - Cabang Lombok',
        area_text: 'Cabang Lombok',
        sub_area_text: 'Lombok',
      }),
    ).toBe('Budi - GM - General Manager - Cabang Lombok');
  });
  it('keeps delegation prefix on the position and snapshot name', () => {
    expect(
      formatGmRecipientLabel({
        namaSirkuler: 'ANI',
        persnum_person_text: 'BUDI',
        abbreviation: 'GM',
        positionText: 'General Manager',
        positionStatus: 'PT',
      }),
    ).toBe('Ani - GM - PT. General Manager');
  });
  it('does not alter Deputy GM or other recipients', () => {
    expect(
      formatGmRecipientLabel({
        position_text: 'Deputy General Manager',
        abbreviation: 'DGM',
        nama: 'ANI',
      }),
    ).toBeUndefined();
    expect(
      formatSdiPdfRecipientLabel({
        position_text: 'Direktur Utama',
        nama: 'ANI',
      }),
    ).toBe('Direktur Utama');
  });
});
