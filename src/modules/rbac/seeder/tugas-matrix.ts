import type { MatrixHalaman } from './utama-matrix';
import type { ResourceDefinition } from './kelola-matrix';

/** Permission yang digunakan halaman Tugas. */
export const tugasResources: ResourceDefinition[] = [
  {
    name: 'tugas',
    description: 'Papan tugas dan pengelolaan task',
    permissions: [
      { action: 'read-board', description: 'Melihat papan dan task' },
      { action: 'read-my-tasks', description: 'Melihat tugas yang ditugaskan kepada saya' },
      { action: 'create-board', description: 'Membuat papan tugas' },
      { action: 'update-board', description: 'Mengubah papan tugas' },
      { action: 'delete-board', description: 'Menghapus papan tugas' },
      { action: 'manage-members', description: 'Mengelola anggota papan' },
      { action: 'create-task', description: 'Membuat task' },
      { action: 'update-task', description: 'Mengubah task' },
      { action: 'move-task', description: 'Memindahkan task' },
      { action: 'delete-task', description: 'Menghapus task' },
    ],
  },
];

export const tugasSuperAdminPermissions = tugasResources.flatMap((resource) =>
  resource.permissions.map((permission) => `${resource.name}.${permission.action}`),
);

/** Assignment default untuk menu Tugas. */
export const tugasRolePermissionAssignments: Record<'ADMIN' | 'USER', string[]> = {
  ADMIN: tugasSuperAdminPermissions,
  USER: tugasSuperAdminPermissions,
};

const actionLabels: Record<string, string> = {
  'read-board': 'Read',
  'read-my-tasks': 'Read',
  'create-board': 'Create Board',
  'update-board': 'Update Board',
  'delete-board': 'Delete Board',
  'manage-members': 'Manage Members',
  'create-task': 'Create Task',
  'update-task': 'Update Task',
  'move-task': 'Move Task',
  'delete-task': 'Delete Task',
};

const toPermissions = (actions: string[]) => actions.map((action) => {
  const definition = tugasResources[0].permissions.find((permission) => permission.action === action)!;
  return {
    action,
    label: actionLabels[action] ?? action,
    description: definition.description,
    resource: 'tugas',
  };
});

export const tugasMatrix: MatrixHalaman = {
  key: 'tugas',
  label: 'Tugas',
  menus: [
    {
      key: 'papan',
      label: 'Papan',
      subMenus: [
        {
          key: 'papan',
          label: 'Papan',
          fiturs: [
            {
              key: 'papan',
              label: 'Papan',
              permissions: toPermissions([
                'read-board',
                'create-board',
                'update-board',
                'delete-board',
                'manage-members',
                'create-task',
                'update-task',
                'move-task',
                'delete-task',
              ]),
            },
          ],
        },
      ],
    },
    {
      key: 'tugas-saya',
      label: 'Tugas Saya',
      subMenus: [
        {
          key: 'tugas-saya',
          label: 'Tugas Saya',
          fiturs: [
            {
              key: 'tugas-saya',
              label: 'Tugas Saya',
              permissions: toPermissions([
                'read-my-tasks',
                'create-task',
                'update-task',
                'move-task',
                'delete-task',
              ]),
            },
          ],
        },
      ],
    },
  ],
};
