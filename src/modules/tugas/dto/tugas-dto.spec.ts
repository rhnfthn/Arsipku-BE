import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBoardDto, QueryBoardDto } from './board.dto';
import { CreateTaskDto, MoveTaskDto, QueryMyTaskDto } from './task.dto';
import { TugasTaskStatus } from '../enums';
import { ValidationPipe } from '@nestjs/common';
import { AddTaskReferenceDto } from './reference.dto';

describe('Tugas DTO', () => {
  it('trim nama board dan menerima warna hex enam digit', async () => {
    const dto = plainToInstance(CreateBoardDto, {
      nama: '  Papan Saya  ',
      warna: '#3b82f6',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nama).toBe('Papan Saya');
    expect(dto.warna).toBe('#3B82F6');
  });

  it('menolak warna pendek, tanggal kalender invalid, dan field asing', async () => {
    const board = plainToInstance(CreateBoardDto, {
      nama: 'Papan',
      warna: '#FFF',
    });
    const task = plainToInstance(CreateTaskDto, {
      judul: 'Task',
      tenggat: '2026-02-31',
    });

    expect(await validate(board)).not.toHaveLength(0);
    expect(await validate(task)).not.toHaveLength(0);
  });

  it('membatasi pagination dan memvalidasi UUID board Tugas Saya', async () => {
    const boardQuery = plainToInstance(QueryBoardDto, { page: 0, limit: 101 });
    const myTaskQuery = plainToInstance(QueryMyTaskDto, {
      boardId: 'bukan-uuid',
    });

    expect(await validate(boardQuery)).toHaveLength(2);
    expect(await validate(myTaskQuery)).not.toHaveLength(0);
  });

  it('memvalidasi payload move beserta expected revision', async () => {
    const valid = plainToInstance(MoveTaskDto, {
      status: TugasTaskStatus.DONE,
      urutan: 0,
      expectedRevision: 4,
    });
    const invalid = plainToInstance(MoveTaskDto, {
      status: 'invalid',
      urutan: -1,
      expectedRevision: -1,
    });

    expect(await validate(valid)).toHaveLength(0);
    expect((await validate(invalid)).length).toBeGreaterThanOrEqual(3);
  });

  it('menolak route dan label referensi dari client', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          referenceType: 'naskah_masuk',
          referenceId: 'eb780188-ff31-4f60-a472-b46acbcf86ea',
          route: 'https://contoh.invalid/phishing',
          labelSnapshot: 'Label palsu',
        },
        { type: 'body', metatype: AddTaskReferenceDto },
      ),
    ).rejects.toThrow();
  });

  it('menerima nomor naskah sebagai input referensi manual', async () => {
    const dto = plainToInstance(AddTaskReferenceDto, {
      referenceType: 'naskah_masuk',
      referenceNumber: '  ND-123/2026  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.referenceNumber).toBe('ND-123/2026');
  });
});
