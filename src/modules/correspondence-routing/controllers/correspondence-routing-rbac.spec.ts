import { administrasiResources } from '../../rbac/seeder/administrasi-matrix';

describe('correspondence routing RBAC matrix', () => {
  it('defines the complete unique Phase 3 permission set', () => {
    const resource = administrasiResources.find(
      (item) => item.name === 'correspondence-routing',
    );
    expect(resource).toBeDefined();
    const actions = resource!.permissions.map(
      (permission) => permission.action,
    );
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions.sort()).toEqual(
      [
        'activate-rule',
        'create-role',
        'create-rule',
        'delete-role',
        'delete-rule',
        'manage-members',
        'preview',
        'read',
        'read-health',
        'update-role',
        'update-rule',
      ].sort(),
    );
  });
});
