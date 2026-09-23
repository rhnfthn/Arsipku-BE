import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { StorageService } from '../../storage/services/storage.service';
import { TteCompletionHandler } from '../../tte-portal/services/tte-signing.service';
import { TteSigningTransactionEntity } from '../../tte-portal/entities/tte-signing-transaction.entity';

/**
 * Completion handler untuk Naskah Umum setelah TTE Portal sukses.
 *
 * Dipanggil TteSigningService setelah callback portal diproses & PDF TTE
 * tersimpan di MinIO. Tugasnya:
 * 1. Ganti final_pdf naskah dengan URL PDF versi TTE
 * 2. Simpan metadata tanda tangan (tandaTangan JSON)
 *
 * Naskah NU dibuat dengan status final_tte SEBELUM signing portal — penerima
 * sudah bisa melihat dokumen; completion hanya mengganti PDF-nya dengan versi
 * bertanda tangan elektronik.
 */
@Injectable()
export class NaskahUmumTteCompletionHandler implements TteCompletionHandler {
  private readonly logger = new Logger(NaskahUmumTteCompletionHandler.name);

  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    private readonly storageService: StorageService,
  ) {}

  async completeSigning(
    transaction: TteSigningTransactionEntity,
    signedFilePath: string,
  ): Promise<void> {
    if (!transaction.idNaskah) {
      this.logger.warn(
        `Transaksi ${transaction.id} tidak punya idNaskah — skip completion NU`,
      );
      throw new NotFoundException(
        'Konteks Naskah Umum pada transaksi TTE tidak lengkap',
      );
    }

    const naskah = await this.naskahRepository.findOne({
      where: { id: transaction.idNaskah },
    });
    if (!naskah) {
      this.logger.warn(
        `Naskah ${transaction.idNaskah} tidak ditemukan — skip completion NU`,
      );
      throw new NotFoundException(
        'Naskah Umum untuk completion TTE tidak ditemukan',
      );
    }

    // URL presigned untuk final_pdf (kolom ini menyimpan URL, bukan key —
    // konsisten dengan alur existing finalizeSend)
    const signedPdfUrl = await this.storageService.getFileUrl(
      signedFilePath,
      3600,
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
      path: signedFilePath,
    };

    await this.naskahRepository.update(
      { id: naskah.id, tanggal: naskah.tanggal },
      {
        final_pdf: signedPdfUrl,
        tandaTangan: JSON.stringify(signatureMetadata),
        status: 'final_tte',
      },
    );

    this.logger.log(
      `Naskah Umum ${naskah.id} selesai TTE portal — final_pdf: ${signedFilePath}`,
    );
  }
}
