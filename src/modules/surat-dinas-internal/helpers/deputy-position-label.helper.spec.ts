import { formatDeputyPositionLabel } from './deputy-position-label.helper';

describe('formatDeputyPositionLabel', () => {
  it('appends area after an interim Deputy GM PEO label', () => {
    expect(
      formatDeputyPositionLabel({
        position_text:
          'Deputy General Manager Perencanaan Dan Evaluasi Operasi - Interim Officer',
        area_text: 'Cabang JATSC',
      }),
    ).toBe(
      'Deputy General Manager Perencanaan Dan Evaluasi Operasi - Interim Officer - Cabang JATSC',
    );
  });

  it('appends area to the regular Deputy GM PEO label', () => {
    expect(
      formatDeputyPositionLabel({
        positionText: 'Deputy General Manager Perencanaan dan Evaluasi Operasi',
        areaText: 'Cabang MATSC',
      }),
    ).toBe(
      'Deputy General Manager Perencanaan dan Evaluasi Operasi - Cabang MATSC',
    );
  });

  it('does not duplicate the area and leaves other positions unchanged', () => {
    expect(
      formatDeputyPositionLabel({
        position_text:
          'Deputy General Manager Perencanaan dan Evaluasi Operasi - Cabang MATSC',
        area_text: 'Cabang MATSC',
      }),
    ).toBe(
      'Deputy General Manager Perencanaan dan Evaluasi Operasi - Cabang MATSC',
    );
    expect(
      formatDeputyPositionLabel({
        position_text: 'General Manager',
        area_text: 'Cabang MATSC',
      }),
    ).toBe('General Manager');
  });
});
