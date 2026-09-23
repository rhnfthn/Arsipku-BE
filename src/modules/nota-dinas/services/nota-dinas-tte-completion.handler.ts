import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { StorageService } from '../../storage/services/storage.service';
import { NotificationService } from '../../notification/services';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { TteCompletionHandler } from '../../tte-portal/services/tte-signing.service';
import { TteSigningTransactionEntity } from '../../tte-portal/entities/tte-signing-transaction.entity';

/**
 * Completion handler untuk Nota Dinas setelah TTE Portal sukses.
 *
 * Dipanggil TteSigningService setelah callback portal diproses & PDF TTE
 * tersimpan di MinIO. Tugasnya:
 * 1. Ganti final_pdf naskah dengan PDF versi TTE (upload ke nota-dinas/final)
 * 2. Simpan metadata tanda tangan (tandaTangan JSON)
 *
 * ND disimpan sebagai pending_tte sampai Portal menyelesaikan signing.
 * Completion mengganti PDF, membuka sirkulasi, lalu menerbitkan notifikasi.
 */
@Injectable()
export class NotaDinasTteCompletionHandler implements TteCompletionHandler {
  private readonly logger = new Logger(NotaDinasTteCompletionHandler.name);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly sirkulasiRepository: Repository<NaskahSirkulasi>,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
    private readonly meilisearchSyncService: MeilisearchSyncService,
  ) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    if (!transaction.idNaskah) {
      this.logger.warn(
        `Transaksi ${transaction.id} tidak punya idNaskah — skip completion ND`,
      );
      throw new NotFoundException(
        'Konteks Nota Dinas pada transaksi TTE tidak lengkap',
      );
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: transaction.idNaskah },
    });
    if (!naskah) {
      this.logger.warn(
        `Naskah ${transaction.idNaskah} tidak ditemukan — skip completion ND`,
      );
      throw new NotFoundException(
        'Nota Dinas untuk completion TTE tidak ditemukan',
      );
    }

    if (
      naskah.status === 'final_tte' &&
      naskah.tandaTangan?.includes(`"transaction_id":"${transaction.id}"`)
    ) {
      this.logger.log(
        `Nota Dinas ${naskah.id} sudah diselesaikan oleh transaksi ${transaction.id}`,
      );
      return;
    }

    // Ambil PDF TTE dari path digsig (hasil download portal) → upload ke
    // nota-dinas/final sebagai PDF final (pola sama dengan alur bsre_direct).
    const ttePdfBuffer = await this.storageService.getFile(signedFilePath);
    const timestamp = Date.now();
    const pdfFileName = `ND-tte-${transaction.idNaskah}-${timestamp}.pdf`;
    const upload = await this.storageService.uploadBuffer(
      ttePdfBuffer,
      pdfFileName,
      'application/pdf',
      'nota-dinas/final',
    );

    const signatureMetadata = {
      type: 'digsig',
      mode: 'portal',
      transaction_id: transaction.id,
      request_id: transaction.requestId,
      signature_id: transaction.requestId, // request_id portal sebagai signature ref
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
        tandaTangan: JSON.stringify(signatureMetadata),
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
      penerima.map((item) =>
        this.notificationService
          .createNaskahMasukNotification({
            positionId: item.position ?? '',
            userPersnum: item.idSirkuler ? Number(item.idSirkuler) : undefined,
            naskahId: naskah.id,
            sirkulasiId: item.id,
            jenis: 'ND',
            nomor: naskah.nomor ?? undefined,
            perihal: naskah.perihal ?? '',
            pengirim: pengirim?.namaSirkuler ?? pengirim?.positionText ?? '-',
            pengirimPosition: pengirim?.positionText ?? '-',
            isTembusan: item.sirkuler === 'tembusan',
          })
          .catch((error: Error) => {
            this.logger.error(
              `Gagal membuat notifikasi TTE untuk sirkulasi ${item.id}: ${error.message}`,
            );
          }),
      ),
    );

    await this.meilisearchSyncService.syncNaskah(naskah.id);

    this.logger.log(
      `Nota Dinas ${naskah.id} selesai TTE portal — final_pdf: ${upload.key}`,
    );
  }
}
