import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
} from './entities';

export interface TugasTaskCounts {
  todo: number;
  inProgress: number;
  done: number;
  total: number;
}

export const emptyTaskCounts = (): TugasTaskCounts => ({
  todo: 0,
  inProgress: 0,
  done: 0,
  total: 0,
});

export const mapMember = (member: TugasBoardMemberEntity) => ({
  id: member.id,
  persnum: member.persnum,
  positionId: member.positionId,
  nama: member.namaSnapshot,
  positionText: member.positionTextSnapshot,
  role: member.role,
});

export const mapBoard = (
  board: TugasBoardEntity,
  counts: TugasTaskCounts = emptyTaskCounts(),
  owner?: TugasBoardMemberEntity | null,
) => ({
  id: board.id,
  nama: board.nama,
  deskripsi: board.deskripsi,
  tipe: board.tipe,
  icon: board.icon,
  warna: board.warna,
  revision: board.revision,
  owner: owner
    ? {
        persnum: owner.persnum,
        nama: owner.namaSnapshot,
        positionText: owner.positionTextSnapshot,
      }
    : null,
  counts,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
});

export const mapTask = (task: TugasTaskEntity) => ({
  id: task.id,
  boardId: task.boardId,
  judul: task.judul,
  deskripsi: task.deskripsi,
  status: task.status,
  urutan: task.urutan,
  prioritas: task.prioritas,
  tenggat: task.tenggat,
  assignee: task.assigneeMember ? mapMember(task.assigneeMember) : null,
  /** Member yang membuat task — FE pakai untuk read-only task milik orang lain. */
  createdByMemberId: task.createdByMemberId,
  createdByPersnum: task.createdByPersnum,
  selesaiAt: task.selesaiAt,
  archivedAt: task.archivedAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});
