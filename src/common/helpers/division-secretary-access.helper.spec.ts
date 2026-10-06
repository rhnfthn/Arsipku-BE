import { isDivisionSecretary } from './division-secretary-access.helper';

describe('isDivisionSecretary', () => {
  it('allows an active SE actor', () => {
    expect(isDivisionSecretary({ position_status: 'SE' })).toBe(true);
  });

  it('supports legacy secretary assignments', () => {
    expect(isDivisionSecretary({ tuRoles: ['sekretaris'] })).toBe(true);
    expect(isDivisionSecretary({ positionText: 'SE. EVP of Technology' })).toBe(true);
  });

  it('rejects managerial and non-secretary users', () => {
    expect(isDivisionSecretary({ position_status: 'YBS' })).toBe(false);
    expect(isDivisionSecretary({ position_status: 'PS' })).toBe(false);
    expect(isDivisionSecretary({ tuRoles: ['tu'] })).toBe(false);
  });
});
