import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TugasActivityEntity } from '../entities';
import { TugasActivityAction } from '../enums';
import { TugasActor } from '../tugas.types';

export interface RecordTugasActivity {
  boardId: string;
  taskId?: string | null;
  aksi: TugasActivityAction;
  detail?: Record<string, unknown> | null;
  actor: TugasActor;
}

@Injectable()
export class TugasActivityService {
  record(manager: EntityManager, input: RecordTugasActivity) {
    const repository = manager.getRepository(TugasActivityEntity);
    const detail = {
      ...(input.detail ?? {}),
      actor: {
        persnum: input.actor.persnum,
        positionId: input.actor.position,
        nama: input.actor.nama || `Pengguna ${input.actor.persnum}`,
        positionText: input.actor.positionText || null,
      },
    };
    return repository.save(
      repository.create({
        id: uuidv4(),
        boardId: input.boardId,
        taskId: input.taskId ?? null,
        aksi: input.aksi,
        detail,
        actorPersnum: input.actor.persnum,
        actorPositionId: input.actor.position,
      }),
    );
  }
}
