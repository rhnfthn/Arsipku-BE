import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '../../storage/services/storage.service';
import { TugasBoardEntity, TugasTaskEvidenceEntity } from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;

@Injectable()
export class TugasEvidenceService {
  private readonly logger = new Logger(TugasEvidenceService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: TugasAccessReader,
    private readonly activity: TugasActivityService,
    private readonly storage: StorageService,
    private readonly tugasNotification: TugasNotificationService,
  ) {}

  async list(taskId: string, actor: TugasActor) {
    await this.access.assertTaskMember(taskId, actor.company, actor.position);
    const evidences = await this.access.repositories.task.manager
      .getRepository(TugasTaskEvidenceEntity)
      .find({ where: { taskId }, order: { createdAt: 'ASC' } });

    return Promise.all(evidences.map((evidence) => this.mapEvidence(evidence)));
  }

  async add(taskId: string, file: Express.Multer.File, actor: TugasActor) {
    this.assertValidEvidence(file);
    const initialAccess = await this.access.assertTaskMember(
      taskId,
      actor.company,
      actor.position,
    );
    this.access.assertTaskEditor(initialAccess);

    const uploaded = await this.storage.uploadFile(
      file,
      `tugas/${initialAccess.board.id}/${taskId}/evidence`,
    );

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const access = await this.access.assertTaskMember(
          taskId,
          actor.company,
          actor.position,
          manager,
        );
        this.access.assertTaskEditor(access);
        const board = await this.lockBoard(manager, access.board.id);
        const evidence = await manager
          .getRepository(TugasTaskEvidenceEntity)
          .save({
            id: uuidv4(),
            taskId,
            storageKey: uploaded.key,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            uploadedByPersnum: actor.persnum,
          });

        board.revision += 1;
        await manager.getRepository(TugasBoardEntity).save(board);
        await this.activity.record(manager, {
          boardId: board.id,
          taskId,
          aksi: TugasActivityAction.ADD_EVIDENCE,
          detail: {
            judul: access.task.judul,
            evidenceId: evidence.id,
            fileName: evidence.originalName,
          },
          actor,
        });
        return { evidence, boardId: board.id, revision: board.revision };
      });

      this.tugasNotification?.emitBoardUpdatedSafe({
        boardId: result.boardId,
        revision: result.revision,
        action: 'add_evidence',
        taskId,
        actor,
      });

      return {
        status: 'success',
        message: 'Evidence berhasil ditambahkan',
        data: {
          ...(await this.mapEvidence(result.evidence)),
          revision: result.revision,
        },
      };
    } catch (error) {
      await this.storage.deleteFile(uploaded.key).catch(() => undefined);
      throw error;
    }
  }

  async remove(taskId: string, evidenceId: string, actor: TugasActor) {
    const result = await this.dataSource.transaction(async (manager) => {
      const access = await this.access.assertTaskMember(
        taskId,
        actor.company,
        actor.position,
        manager,
      );
      this.access.assertTaskEditor(access);
      const board = await this.lockBoard(manager, access.board.id);
      const repository = manager.getRepository(TugasTaskEvidenceEntity);
      const evidence = await repository.findOne({
        where: { id: evidenceId, taskId },
      });
      if (!evidence) throw new NotFoundException('Evidence tidak ditemukan');

      await this.activity.record(manager, {
        boardId: board.id,
        taskId,
        aksi: TugasActivityAction.REMOVE_EVIDENCE,
        detail: {
          judul: access.task.judul,
          evidenceId: evidence.id,
          fileName: evidence.originalName,
        },
        actor,
      });
      await repository.remove(evidence);
      board.revision += 1;
      await manager.getRepository(TugasBoardEntity).save(board);
      return {
        evidence,
        boardId: board.id,
        revision: board.revision,
      };
    });

    try {
      await this.storage.deleteFile(result.evidence.storageKey);
    } catch (error) {
      this.logger.warn(
        `Metadata evidence ${result.evidence.id} terhapus, tetapi object storage gagal dibersihkan: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.tugasNotification?.emitBoardUpdatedSafe({
      boardId: result.boardId,
      revision: result.revision,
      action: 'remove_evidence',
      taskId,
      actor,
    });

    return {
      status: 'success',
      message: 'Evidence berhasil dihapus',
      data: { id: evidenceId, revision: result.revision },
    };
  }

  private assertValidEvidence(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('File evidence wajib dipilih');
    if (file.size > MAX_EVIDENCE_SIZE) {
      throw new BadRequestException('Ukuran evidence maksimal 10 MB');
    }

    const extension = path.extname(file.originalname).toLowerCase();
    const validPair =
      (file.mimetype === 'image/jpeg' &&
        ['.jpg', '.jpeg'].includes(extension)) ||
      (file.mimetype === 'image/png' && extension === '.png') ||
      (file.mimetype === 'application/pdf' && extension === '.pdf');
    const isJpeg =
      file.buffer?.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng =
      file.buffer?.length >= pngSignature.length &&
      pngSignature.every((byte, index) => file.buffer[index] === byte);
    const pdfHeader = Buffer.from('%PDF-');
    const pdfEof = Buffer.from('%%EOF');
    const isPdf =
      file.buffer?.subarray(0, 1024).indexOf(pdfHeader) >= 0 &&
      file.buffer
        ?.subarray(Math.max(0, file.buffer.length - 2048))
        .indexOf(pdfEof) >= 0;
    const validSignature =
      (file.mimetype === 'image/jpeg' && isJpeg) ||
      (file.mimetype === 'image/png' && isPng) ||
      (file.mimetype === 'application/pdf' && isPdf);

    if (!validPair || !validSignature) {
      throw new BadRequestException(
        'Evidence hanya mendukung file JPG, PNG, atau PDF yang valid',
      );
    }
  }

  private async mapEvidence(evidence: TugasTaskEvidenceEntity) {
    return {
      id: evidence.id,
      originalName: evidence.originalName,
      mimeType: evidence.mimeType,
      fileSize: evidence.fileSize,
      uploadedByPersnum: evidence.uploadedByPersnum,
      createdAt: evidence.createdAt,
      url: await this.storage.getPreviewUrl(evidence.storageKey, 3600),
    };
  }

  private lockBoard(manager: EntityManager, boardId: string) {
    return manager.getRepository(TugasBoardEntity).findOneOrFail({
      where: { id: boardId },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
