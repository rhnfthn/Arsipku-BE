import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

export enum NotificationType {
  NASKAH_MASUK = 'NASKAH_MASUK',
  NASKAH_TEMBUSAN = 'NASKAH_TEMBUSAN',
  DISPOSISI = 'DISPOSISI',
  DISPOSISI_SELESAI = 'DISPOSISI_SELESAI',
  KONSEP_DISETUJUI = 'KONSEP_DISETUJUI',
  KONSEP_DITOLAK = 'KONSEP_DITOLAK',
  PENOMORAN_USULAN = 'PENOMORAN_USULAN',
  PENOMORAN_PERSETUJUAN = 'PENOMORAN_PERSETUJUAN',
  PENOMORAN_VERIFIKASI = 'PENOMORAN_VERIFIKASI',
  PENOMORAN_SELESAI = 'PENOMORAN_SELESAI',
  PENOMORAN_DITOLAK = 'PENOMORAN_DITOLAK',
  DIGSIG_VERIFIKASI = 'DIGSIG_VERIFIKASI',
  DIGSIG_TANDA_TANGAN = 'DIGSIG_TANDA_TANGAN',
  DIGSIG_SELESAI = 'DIGSIG_SELESAI',
  DIGSIG_DITOLAK = 'DIGSIG_DITOLAK',
  NASKAH_DINAS_VERIFIKATOR = 'NASKAH_DINAS_VERIFIKATOR',
  NASKAH_DINAS_VERIFIKASI_SELESAI = 'NASKAH_DINAS_VERIFIKASI_SELESAI',
  NASKAH_DINAS_DITOLAK = 'NASKAH_DINAS_DITOLAK',
  BERKAS_VERIFIKASI = 'BERKAS_VERIFIKASI',
  DELEGASI = 'DELEGASI',
  SYSTEM = 'SYSTEM',
  NASKAH_SHARE_DITERIMA = 'NASKAH_SHARE_DITERIMA',
  NASKAH_SHARE_DIBUKA = 'NASKAH_SHARE_DIBUKA',
  NASKAH_SHARE_DICABUT = 'NASKAH_SHARE_DICABUT',
  NASKAH_SHARE_REOPEN_REQUEST = 'NASKAH_SHARE_REOPEN_REQUEST',
  NASKAH_SHARE_REOPEN_APPROVED = 'NASKAH_SHARE_REOPEN_APPROVED',
  NASKAH_SHARE_REOPEN_REJECTED = 'NASKAH_SHARE_REOPEN_REJECTED',
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // PRIMARY: Notifikasi milik JABATAN
  @Column('varchar', { name: 'position_id', length: 100 })
  positionId: string;

  // OPTIONAL: Untuk push notification ke device
  @Column('int', { name: 'user_persnum', nullable: true })
  userPersnum: number | null;

  @Column('enum', {
    enum: NotificationType,
  })
  type: NotificationType;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text')
  body: string;

  @Column('json', { nullable: true })
  data: Record<string, any> | null;

  @Column('tinyint', { name: 'is_read', default: 0 })
  isRead: boolean;

  @Column('timestamp', { name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

// Interface untuk data payload notifikasi naskah masuk
export interface NaskahMasukNotificationData {
  naskahId: string;
  sirkulasiId: string;
  jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
  nomor: string | null;
  perihal: string;
  pengirim: string;
  pengirimPosition: string;
  action: 'OPEN_INBOX_DETAIL';
}

// Interface untuk data payload notifikasi disposisi
export interface DisposisiNotificationData {
  disposisiId: string;
  naskahId: string;
  instruksi: string;
  pengirim: string;
  action: 'OPEN_DISPOSISI_DETAIL';
}
