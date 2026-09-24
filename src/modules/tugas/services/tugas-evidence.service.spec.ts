/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/services/storage.service';
import {
  TugasBoardEntity,
  TugasBoardMemberEntity,
  TugasTaskEntity,
  TugasTaskEvidenceEntity,
} from '../entities';
import { TugasActor } from '../tugas.types';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasEvidenceService } from './tugas-evidence.service';
import { TugasNotificationService } from './tugas-notification.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'PIC',
  company: '1000',
  position: 'POS-1',
  positionText: 'Manager',
  role: 'user',
};

const board = { id: 'board-1', revision: 2 } as TugasBoardEntity;
const member = { id: 'member-1' } as TugasBoardMemberEntity;
const task = {
  id: 'task-1',
  judul: 'Task evidence',
  board,
  assigneeMemberId: member.id,
} as TugasTaskEntity;

const pngFile = (): Express.Multer.File =>
  ({
    originalname: 'evidence.png',
    mimetype: 'image/png',
    size: 12,
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]),
  }) as Express.Multer.File;

const pdfFile = (): Express.Multer.File => {
  const buffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
  );
  return {
    originalname: 'evidence.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
};

function createHarness() {
  const evidenceRepository = {
    save: jest.fn((value) =>
      Promise.resolve({
        ...value,
        createdAt: new Date('2026-09-16T00:00:00Z'),
      }),
    ),
  };
  const boardRepository = {
    findOneOrFail: jest.fn(() => Promise.resolve({ ...board })),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === TugasTaskEvidenceEntity ? evidenceRepository : boardRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as DataSource;
  const access = {
    assertTaskMember: jest.fn(() => Promise.resolve({ board, member, task })),
    assertTaskEditor: jest.fn(),
  } as unknown as TugasAccessReader;
  const activity = {
    record: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as TugasActivityService;
  const storage = {
    uploadFile: jest.fn(() =>
      Promise.resolve({ key: 'tugas/board-1/task-1/evidence/file.png' }),
    ),
    getPreviewUrl: jest.fn(() =>
      Promise.resolve('https://preview/evidence.png'),
    ),
    deleteFile: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as StorageService;
  const notification = {
    emitBoardUpdatedSafe: jest.fn(),
  } as unknown as TugasNotificationService;
  const service = new TugasEvidenceService(
    dataSource,
    access,
    activity,
    storage,
    notification,
  );
  return { service, access, activity, storage, notification };
}

describe('TugasEvidenceService', () => {
  it('menolak file berkedok PNG ketika signature tidak valid', async () => {
    const harness = createHarness();
    const fake = {
      ...pngFile(),
      buffer: Buffer.from('bukan gambar'),
    } as Express.Multer.File;

    await expect(
      harness.service.add(task.id, fake, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.access.assertTaskMember).not.toHaveBeenCalled();
    expect(harness.storage.uploadFile).not.toHaveBeenCalled();
  });

  it('mengunggah PNG valid dan memvalidasi editor sebelum serta di dalam transaksi', async () => {
    const harness = createHarness();

    const response = await harness.service.add(task.id, pngFile(), actor);

    expect(harness.access.assertTaskEditor).toHaveBeenCalledTimes(2);
    expect(harness.storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'evidence.png' }),
      'tugas/board-1/task-1/evidence',
    );
    expect(harness.activity.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: task.id, aksi: 'add_evidence' }),
    );
    expect(response.data).toMatchObject({
      originalName: 'evidence.png',
      mimeType: 'image/png',
      url: 'https://preview/evidence.png',
      revision: 3,
    });
  });

  it('menerima PDF valid berdasarkan ekstensi, MIME, header, dan EOF marker', async () => {
    const harness = createHarness();

    const response = await harness.service.add(task.id, pdfFile(), actor);

    expect(harness.storage.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'evidence.pdf',
        mimetype: 'application/pdf',
      }),
      'tugas/board-1/task-1/evidence',
    );
    expect(response.data).toMatchObject({
      originalName: 'evidence.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('menolak file berkedok PDF ketika signature tidak valid', async () => {
    const harness = createHarness();
    const fake = {
      ...pdfFile(),
      buffer: Buffer.from('bukan pdf'),
    } as Express.Multer.File;

    await expect(
      harness.service.add(task.id, fake, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.storage.uploadFile).not.toHaveBeenCalled();
  });
});
