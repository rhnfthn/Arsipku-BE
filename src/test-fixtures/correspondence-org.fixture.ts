// Synthetic topology: no employee data and no connection to the live database.
// IDs deliberately differ from production. Keep ordering stable for regression.
function position(
  id: number,
  organization: number,
  parent: number | null,
  level: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    position: id,
    position_text: `Test position ${id}`,
    position_abbreviation: null,
    chief: 1,
    bod_tag: 'BOD-3',
    departType: null,
    persnum_person: id + 1000,
    persnum_person_text: `Test person ${id}`,
    organization_id: organization,
    organization_text: `Test organization ${organization}`,
    organization_abbreviation: null,
    organization_parent: parent,
    organization_parent_text: null,
    sub_area: 1,
    sub_area_text: 'Test HQ',
    area: 'HQ',
    area_text: 'Test HQ',
    level,
    divisi_id: 20,
    divisi_name: 'Test division',
    direktorat_id: 10,
    direktorat_name: 'Test directorate',
    company: 10000,
    company_name: 'Test company',
    ...overrides,
  };
}

export function correspondenceOrgFixture() {
  return [
    position(1, 10, null, 1, { bod_tag: 'BOD' }),
    position(2, 20, 10, 2, { bod_tag: 'BOD-1', departType: 'DIVORCABANG' }),
    position(3, 30, 20, 3, { bod_tag: 'BOD-2' }),
    position(4, 40, 30, 4),
    position(5, 40, 30, 4, { chief: 0 }),
    position(6, 40, 30, 4, {
      chief: 0,
      persnum_person: null,
      persnum_person_text: null,
    }),
    position(7, 50, 10, 2, {
      bod_tag: 'BOD-1',
      departType: 'DIVORCABANG',
      area: 'BRANCH_A',
      sub_area: 2,
      divisi_id: 50,
    }),
    position(8, 60, 50, 3, {
      bod_tag: 'BOD-2',
      area: 'BRANCH_A',
      sub_area: 2,
      divisi_id: 50,
    }),
    position(9, 70, 60, 4, { area: 'BRANCH_A', sub_area: 2, divisi_id: 50 }),
    position(10, 70, 60, 4, {
      chief: 0,
      area: 'BRANCH_A',
      sub_area: 2,
      divisi_id: 50,
    }),
    position(11, 80, 10, 2, {
      bod_tag: 'BOD-1',
      departType: 'DIVORCABANG',
      area: 'BRANCH_B',
      sub_area: 3,
      divisi_id: 80,
      persnum_person: null,
      persnum_person_text: null,
    }),
    position(12, 90, null, 1, {
      bod_tag: 'BOD',
      company: 20000,
      area: 'OTHER',
      sub_area: 4,
      direktorat_id: 90,
    }),
  ];
}
