import { portalCorrespondenceSignatureId } from '../helpers/portal-correspondence-signature';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { createCorrespondenceFinalFileName } from '../../../common/utils/correspondence-file-name.util';
import { NotificationService } from '../../notification/services';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { StorageService } from '../../storage/services/storage.service';
import { TteSigningTransactionEntity } from '../entities/tte-signing-transaction.entity';
import type { TteCompletionHandler } from './tte-signing.service';

const FINAL_FOLDERS: Record<string, string> = {
  SDI: 'surat-dinas-internal/final',
  SDE: 'surat-dinas-eksternal/final',
  DI: 'disposisi/final',
  KA: 'kajian/final',
};

@Injectable()
export class PortalNaskahTteCompletionHandler implements TteCompletionHandler {
  private readonly logger = new Logger(PortalNaskahTteCompletionHandler.name);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly lampiranRepository: Repository<NaskahLampiranEntity>,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
    private readonly meilisearchSyncService: MeilisearchSyncService,
  ) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    const transactionJenis = transaction.jenisNaskah?.toUpperCase() ?? '';
    const jenis = transactionJenis === 'SDE_MASAL' ? 'SDE' : transactionJenis;
    const finalFolder = FINAL_FOLDERS[jenis];
    if (!transaction.idNaskah || !finalFolder) {
      throw new NotFoundException(
        `Konteks completion Portal TTE ${jenis || '-'} tidak tersedia`,
      );
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: transaction.idNaskah },
    });
    if (!naskah) {
      throw new NotFoundException(
        `Naskah ${transaction.idNaskah} untuk completion TTE tidak ditemukan`,
      );
    }

    if (
      naskah.status === 'final_tte' &&
      naskah.tandaTangan?.includes(`"transaction_id":"${transaction.id}"`)
    ) {
      this.logger.log(
        `${jenis} ${naskah.id} sudah diselesaikan oleh transaksi ${transaction.id}`,
      );
      return;
    }

    const signedBuffer = await this.storageService.getFile(signedFilePath);
    const attachmentCount = await this.lampiranRepository.count({
      where: { id_naskah: naskah.id },
    });
    const filename = createCorrespondenceFinalFileName(jenis, attachmentCount);
    const upload = await this.storageService.uploadBuffer(
      signedBuffer,
      filename,
      'application/pdf',
      finalFolder,
    );
    const metadata = {
      type: 'digsig',
      mode: 'portal',
      transaction_id: transaction.id,
      request_id: transaction.requestId,
      signature_id: portalCorrespondenceSignatureId(
        naskah.id,
        transaction.nomorNaskah || naskah.nomor || '',
      ),
      signed_at:
        transaction.signedAt?.toISOString() ?? new Date().toISOString(),
      signer_nik: transaction.signerNik,
      signer_name: transaction.signerName,
      path: upload.key,
    };

    await this.naskahRepository.update(
      { id: naskah.id, tanggal: naskah.tanggal },
      {
        final_pdf: upload.key,
        tandaTangan: JSON.stringify(metadata),
        status: 'final_tte',
      },
    );
    await this.sirkulasiRepository.update(
      { idNaskah: naskah.id },
      { isDraft: false },
    );

    const sirkulasi = await this.sirkulasiRepository.find({
      where: { idNaskah: naskah.id },
    });
    const pengirim = sirkulasi.find((item) => item.sirkuler === 'pengirim');
    const penerima = sirkulasi.filter(
      (item) => item.sirkuler === 'penerima' || item.sirkuler === 'tembusan',
    );

    await Promise.all(
      penerima
        .filter((item) => Boolean(item.position))
        .map((item) => {
          const common = {
            positionId: item.position!,
            userPersnum: item.idSirkuler ? Number(item.idSirkuler) : undefined,
            naskahId: naskah.id,
            sirkulasiId: item.id,
            nomor: naskah.nomor ?? undefined,
            perihal: naskah.perihal ?? '',
            pengirim: pengirim?.namaSirkuler ?? pengirim?.positionText ?? '-',
            pengirimPosition: pengirim?.positionText ?? '-',
          };

          const notification =
            jenis === 'DI'
              ? this.notificationService.createDisposisiNotification({
                  ...common,
                  instruksi: naskah.konten ?? naskah.perihal ?? '',
                })
              : this.notificationService.createNaskahMasukNotification({
                  ...common,
                  jenis,
                  isTembusan: item.sirkuler === 'tembusan',
                });

          return notification.catch((error: Error) => {
            this.logger.error(
              `Gagal membuat notifikasi ${jenis} sirkulasi ${item.id}: ${error.message}`,
            );
          });
        }),
    );

    await this.meilisearchSyncService.syncNaskah(naskah.id);
    this.logger.log(
      `${jenis} ${naskah.id} selesai Portal TTE — final_pdf: ${upload.key}`,
    );
  }
}
