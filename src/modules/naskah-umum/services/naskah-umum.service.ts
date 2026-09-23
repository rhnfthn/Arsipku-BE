import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { NASKAH_UMUM_TEMPLATES } from './naskah-umum-templates';
import { SendDto, TemplateSchema, PreviewDto } from '../dto/naskah-umum.dto';
import { StorageService } from '../../storage/services/storage.service';
import { DocxFillerService } from './docx-filler.service';
import { NaskahUmumTempEntity } from '../../onlyoffice/entities/naskah-umum-temp.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { OnlyOfficeService } from '../../onlyoffice/services/onlyoffice.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { PdfQrEmbedService } from '../../digsig/services/pdf-qr-embed.service';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';
import { TteSigningGateway } from '../../tte-portal/services/tte-signing-gateway.service';
import { TteSigningService } from '../../tte-portal/services/tte-signing.service';

@Injectable()
export class NaskahUmumService {
  constructor(
    private readonly storage: StorageService,
    private readonly filler: DocxFillerService,
    @InjectRepository(NaskahUmumTempEntity)
    private readonly tempRepo: Repository<NaskahUmumTempEntity>,
    private readonly onlyOffice: OnlyOfficeService,
    private readonly nomorSurat: NomorSuratService,
    private readonly pdfQrEmbed: PdfQrEmbedService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly grupPenerimaService: GrupPenerimaService,
    private readonly tteSigningGateway: TteSigningGateway,
    private readonly tteSigningService: TteSigningService,
  ) {
    // Kill switch: OnlyOffice feature = ONLYOFFICE_ENABLED=false (default).
    // Don't throw at bootstrap. APP_PUBLIC_URL checked lazily in methods
    // (only when OnlyOffice is enabled + user calls preview/finalize).
    // This allows BE to boot without OnlyOffice env on servers where
    // OnlyOffice Docker isn't deployed yet.
  }

  getTemplateSchema(jenis: string): TemplateSchema | null {
    return NASKAH_UMUM_TEMPLATES[jenis] ?? null;
  }

  async getTempStatus(
    tempId: string,
  ): Promise<'preview' | 'saved' | 'sent' | null> {
    const temp = await this.tempRepo.findOne({ where: { id: tempId } });
    return temp?.status ?? null;
  }

  async createPreview(
    jenis: string,
    fields: Record<string, string | string[]>,
    userId: string,
  ): Promise<{ tempId: string; s3Key: string }> {
    // Lazy check: OnlyOffice must be enabled + APP_PUBLIC_URL set
    if (!this.onlyOffice.isEnabled()) {
      throw new BadRequestException(
        'OnlyOffice feature is disabled. Set ONLYOFFICE_ENABLED=true and configure OnlyOffice Document Server.',
      );
    }
    const appPublicUrl = this.config.get<string>('APP_PUBLIC_URL');
    if (!appPublicUrl) {
      throw new BadRequestException(
        'Missing required environment variable: APP_PUBLIC_URL',
      );
    }
    const schema = this.getTemplateSchema(jenis);
    if (!schema) throw new BadRequestException(`Jenis ${jenis} belum didukung`);

    // 1. Fetch template docx from S3
    const templateBuffer = await this.storage.getFile(schema.templateS3Key);

    // 2. Fill placeholders; keep nomor empty until finalize
    const fillData: Record<string, string | string[]> = { ...fields };
    fillData.nomor = fillData.nomor ?? '';
    const filled = this.filler.fill(templateBuffer, fillData);

    // 3. Upload filled temp to S3; use the returned key (StorageService builds it)
    const tempId = uuidv4();
    const uploadResult = await this.storage.uploadBuffer(
      filled,
      `${tempId}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'naskah-umum-temp',
    );

    // 4. Create temp record
    const temp = this.tempRepo.create({
      id: tempId,
      jenis,
      fieldsJson: JSON.stringify(fields),
      s3Key: uploadResult.key,
      status: 'preview',
      createdBy: userId,
    });
    await this.tempRepo.save(temp);

    return { tempId, s3Key: uploadResult.key };
  }

  async finalizeSend(
    dto: SendDto,
    userId: string,
    _persnum?: number,
    user?: any,
  ): Promise<{
    id: string;
    nomor: string;
    status: string;
    final_pdf: string;
    /** Alur portal: URL untuk redirect user ke Portal TTE */
    tte_redirect?: {
      transactionId: string;
      signingUrl: string;
    };
  }> {
    const temp = await this.tempRepo.findOne({ where: { id: dto.tempId } });
    if (!temp) {
      throw new BadRequestException(
        `Temp naskah ${dto.tempId} tidak ditemukan`,
      );
    }
    if (temp.status !== 'saved' || !temp.s3KeySaved) {
      throw new BadRequestException(
        `Naskah belum disimpan dari editor. Buka editor lalu Simpan dulu.`,
      );
    }

    const schema = this.getTemplateSchema(temp.jenis);
    if (!schema) {
      throw new BadRequestException(`Jenis ${temp.jenis} belum didukung`);
    }

    const fields = JSON.parse(temp.fieldsJson) as Record<string, any>;

    // 1. Re-fill saved docx with generated nomor
    const savedDocx = await this.storage.getFile(temp.s3KeySaved);
    const nomorResult = await this.nomorSurat.generateNomor({
      jenis: temp.jenis as any,
      positionText: fields.dari ?? '',
      areaText: 'Pusat',
      tanggal: new Date(),
      klasifikasi: fields.klasifikasi ?? dto.klasifikasi,
    });
    const nomor = nomorResult.nomor;

    const finalDocx = this.filler.fill(savedDocx, { ...fields, nomor });

    // 2. Upload final docx
    const finalDocxUpload = await this.storage.uploadBuffer(
      finalDocx,
      `${dto.tempId}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'naskah-umum-final',
    );

    // 3. Convert DOCX to PDF
    const pdfBuffer = await this.onlyOffice.convertToPdf(finalDocxUpload.key);

    // 4. Embed QR code
    const appPublicUrl = this.config.get<string>('APP_PUBLIC_URL');
    const naskahId = uuidv4();
    const qrData = {
      signature_id: naskahId,
      document_number: nomor,
      signed_at: new Date().toISOString(),
      signer_name: fields.namapengirim ?? '',
      signer_jabatan: fields.dari ?? '',
      document_type: temp.jenis,
      verification_url: `${appPublicUrl}/validasi/${naskahId}`,
    };
    const qrResult = await this.pdfQrEmbed.embedQRCodeToPdf(pdfBuffer, qrData);
    if (!qrResult.success) {
      throw new BadRequestException(
        `Gagal menyematkan QR code: ${qrResult.message}`,
      );
    }

    // 5. Upload signed PDF
    const finalPdfUpload = await this.storage.uploadBuffer(
      qrResult.pdfBuffer,
      `${dto.tempId}.pdf`,
      'application/pdf',
      'naskah-umum-final',
    );
    const finalPdfUrl = await this.storage.getFileUrl(finalPdfUpload.key, 3600);

    // 6. Create naskah + sirkulasi atomically
    const portalMode =
      dto.sign_option === 'digsig'
        ? await this.tteSigningGateway.isPortalMode(temp.jenis)
        : false;
    const newStatus =
      dto.sign_option === 'digsig'
        ? portalMode
          ? 'pending_tte'
          : 'final_tte'
        : 'final';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const naskah = queryRunner.manager.create(NaskahEntity, {
        id: naskahId,
        jenis: temp.jenis as any,
        nomor,
        tanggal: new Date(),
        perihal: fields.perihal ?? '',
        konten: '',
        final_pdf: finalPdfUrl,
        status: newStatus,
        signOption: dto.sign_option,
        klasifikasi: fields.klasifikasi ?? dto.klasifikasi,
        sifat: fields.sifat || dto.sifat || 'biasa',
      });
      await queryRunner.manager.save(naskah);

      const pengirim = queryRunner.manager.create(NaskahSirkulasi, {
        id: uuidv4(),
        idNaskah: naskahId,
        tanggal: naskah.tanggal, // partisi RANGE(YEAR(tanggal))
        sirkuler: 'pengirim',
        positionText: fields.dari ?? '',
        namaSirkuler: fields.namapengirim ?? '',
      });
      await queryRunner.manager.save(pengirim);

      // ── Expand grup penerima ke individual position IDs ────────────────────
      const penerimaPositionIds = new Set<number>();
      for (const posId of dto.penerima ?? []) {
        penerimaPositionIds.add(Number(posId));
      }
      if (dto.penerima_grup && dto.penerima_grup.length > 0) {
        for (const grupId of dto.penerima_grup) {
          try {
            const grupPositions =
              await this.grupPenerimaService.expandGrupToPositions(grupId);
            grupPositions.forEach((pos) =>
              penerimaPositionIds.add(Number(pos.position)),
            );
          } catch (error) {
            console.warn(
              `[NU:finalizeSend] Failed to expand penerima grup ${grupId}:`,
              error.message,
            );
          }
        }
      }

      const tembusanPositionIds = new Set<number>();
      for (const posId of dto.tembusan ?? []) {
        tembusanPositionIds.add(Number(posId));
      }
      if (dto.tembusan_grup && dto.tembusan_grup.length > 0) {
        for (const grupId of dto.tembusan_grup) {
          try {
            const grupPositions =
              await this.grupPenerimaService.expandGrupToPositions(grupId);
            grupPositions.forEach((pos) =>
              tembusanPositionIds.add(Number(pos.position)),
            );
          } catch (error) {
            console.warn(
              `[NU:finalizeSend] Failed to expand tembusan grup ${grupId}:`,
              error.message,
            );
          }
        }
      }

      for (const posId of penerimaPositionIds) {
        const penerima = queryRunner.manager.create(NaskahSirkulasi, {
          id: uuidv4(),
          idNaskah: naskahId,
          tanggal: naskah.tanggal, // partisi RANGE(YEAR(tanggal))
          sirkuler: 'penerima',
          position: String(posId),
        });
        await queryRunner.manager.save(penerima);
      }

      for (const posId of tembusanPositionIds) {
        const tembusan = queryRunner.manager.create(NaskahSirkulasi, {
          id: uuidv4(),
          idNaskah: naskahId,
          tanggal: naskah.tanggal, // partisi RANGE(YEAR(tanggal))
          sirkuler: 'tembusan',
          position: String(posId),
        });
        await queryRunner.manager.save(tembusan);
      }

      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await queryRunner.manager.update(
          NaskahLampiranEntity,
          { id: In(dto.lampiran_temp_ids), is_temporary: 1 },
          { id_naskah: naskahId, is_temporary: 0, temp_folder_id: null },
        );
      }

      temp.status = 'sent';
      await queryRunner.manager.save(NaskahUmumTempEntity, temp);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // ── Alur Portal TTE (konfigurasi admin: tte_mode=portal) ──────────────
    // Naskah sudah dibuat dengan status final_tte (PDF belum TTE). Buat
    // signing request di portal; FE redirect user ke signing_url untuk
    // memasukkan passphrase di halaman Portal TTE. Setelah callback sukses,
    // completion handler mengganti final_pdf dengan versi TTE.
    if (dto.sign_option === 'digsig') {
      if (portalMode) {
        if (!user?.persnum || !user?.nama) {
          throw new BadRequestException(
            'Sesi user tidak valid untuk TTE Portal. Silakan login ulang.',
          );
        }
        const tteResult = await this.tteSigningService.createSigningTransaction(
          {
            sourceKey: finalPdfUpload.key,
            filename: `${dto.tempId}.pdf`,
            pathDokumen: 'naskah-umum-final/tte',
            idNaskah: naskahId,
            jenisNaskah: temp.jenis,
            nomorNaskah: nomor,
            location: fields.dari ?? 'KANTOR PUSAT',
            reason: `${nomor} - ${fields.perihal ?? ''}`.slice(0, 2000),
            tampilan: 'INVISIBLE',
            user,
          },
        );
        return {
          id: naskahId,
          nomor,
          status: newStatus,
          final_pdf: finalPdfUrl,
          tte_redirect: {
            transactionId: tteResult.transactionId,
            signingUrl: tteResult.signingUrl,
          },
        };
      }
    }

    return { id: naskahId, nomor, status: newStatus, final_pdf: finalPdfUrl };
  }
}
