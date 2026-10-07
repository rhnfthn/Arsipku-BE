export enum TugasBoardType {
  PERSONAL = 'personal',
  BERSAMA = 'bersama',
}

export enum TugasBoardFilter {
  SEMUA = 'semua',
  SAYA_BUAT = 'saya-buat',
  SAYA_IKUT = 'saya-ikut',
}

export enum TugasBoardMemberRole {
  OWNER = 'owner',
  MEMBER = 'member',
}

export enum TugasTaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export enum TugasTaskPriority {
  RENDAH = 'rendah',
  SEDANG = 'sedang',
  TINGGI = 'tinggi',
}

export enum TugasMyTaskScope {
  SEMUA = 'semua',
  TERLAMBAT = 'terlambat',
  HARI_INI = 'hari-ini',
  MENDATANG = 'mendatang',
  SELESAI = 'selesai',
}

export enum TugasReferenceType {
  NASKAH_MASUK = 'naskah_masuk',
  NASKAH_TERKIRIM = 'naskah_terkirim',
  DISPOSISI = 'disposisi',
  NASKAH_LAINNYA = 'naskah_lainnya',
}

export enum TugasActivityAction {
  CREATE_BOARD = 'create_board',
  UPDATE_BOARD = 'update_board',
  DELETE_BOARD = 'delete_board',
  RESTORE_BOARD = 'restore_board',
  ADD_MEMBER = 'add_member',
  REMOVE_MEMBER = 'remove_member',
  CREATE_TASK = 'create_task',
  UPDATE_TASK = 'update_task',
  MOVE_TASK = 'move_task',
  ASSIGN_TASK = 'assign_task',
  UNASSIGN_TASK = 'unassign_task',
  ARCHIVE_TASK = 'archive_task',
  RESTORE_TASK = 'restore_task',
  ADD_REFERENCE = 'add_reference',
  REMOVE_REFERENCE = 'remove_reference',
  ADD_EVIDENCE = 'add_evidence',
  REMOVE_EVIDENCE = 'remove_evidence',
  ADD_COMMENT = 'add_comment',
  DELETE_COMMENT = 'delete_comment',
  DELETE_TASK = 'delete_task',
}
