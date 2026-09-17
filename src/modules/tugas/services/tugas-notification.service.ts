import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from '../../notification/entities/notification.entity';
import { NotificationService } from '../../notification/services/notification.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { TugasBoardEntity, TugasTaskEntity } from '../entities';
import { TugasActor } from '../tugas.types';

export interface TugasNotificationPayload {
  boardId: string;
  boardNama: string;
  taskId: string;
  taskJudul: string;
  actor: TugasActor;
}

/**
 * TugasNotificationService
 *
 * Mengirim notifikasi TUGAS_* via NotificationService existing:
 * - TUGAS_MEMBER_ADDED: anggota baru ditambahkan ke papan.
 * - TUGAS_ASSIGNED: task ditugaskan kepada posisi.
 * - TUGAS_DONE: task ditandai selesai oleh orang lain.
 * - TUGAS_DUE: reminder H-1 tenggat (cron, idempoten).
 *
 * Aturan:
 * - Target notifikasi selalu positionId; userPersnum hanya untuk FCM push.
 * - Jangan notify actor sendiri.
 * - Payload action OPEN_TUGAS_TASK + boardId + taskId (resolver FE).
 * - Reminder claim reminder_h1_sent_at secara CONDITIONAL sebelum create;
 *   jika insert gagal sebelum tersimpan, claim di-reset agar retry berikutnya
 *   bisa berjalan. Jika hanya FCM gagal setelah row tersimpan, claim tetap.
 */
@Injectable()
export class TugasNotificationService {
  private readonly logger = new Logger(TugasNotificationService.name);

  constructor(
    @InjectRepository(TugasTaskEntity)
    private readonly taskRepository: Repository<TugasTaskEntity>,
    private readonly notificationService: NotificationService,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  /** Notifikasi anggota baru ditambahkan ke papan bersama. */
  async notifyMemberAdded(payload: {
    board: TugasBoardEntity;
    memberPositionId: string;
    memberPersnum: number;
    actor: TugasActor;
  }) {
    if (payload.memberPositionId === payload.actor.position) return;
    await this.notificationService.createNotification(
      {
        positionId: payload.memberPositionId,
        userPersnum: payload.memberPersnum,
        type: NotificationType.TUGAS_MEMBER_ADDED,
        title: 'Anda ditambahkan ke papan tugas',
        body: `${payload.actor.nama} menambahkan Anda ke papan "${payload.board.nama}".`,
        data: {
          action: 'OPEN_TUGAS_TASK',
          boardId: payload.board.id,
          taskId: null,
        },
      },
      true,
    );
  }

  /** Notifikasi task ditugaskan kepada posisi tertentu. */
  async notifyAssigned(payload: {
    board: TugasBoardEntity;
    task: TugasTaskEntity;
    assigneePositionId: string;
    assigneePersnum: number;
    actor: TugasActor;
  }) {
    if (payload.assigneePositionId === payload.actor.position) return;
    await this.notificationService.createNotification(
      {
        positionId: payload.assigneePositionId,
        userPersnum: payload.assigneePersnum,
        type: NotificationType.TUGAS_ASSIGNED,
        title: 'Task baru ditugaskan kepada Anda',
        body: `${payload.actor.nama} menugaskan "${payload.task.judul}" kepada Anda di papan "${payload.board.nama}".`,
        data: {
          action: 'OPEN_TUGAS_TASK',
          boardId: payload.board.id,
          taskId: payload.task.id,
        },
      },
      true,
    );
  }

  /** Notifikasi task ditandai selesai oleh orang lain. */
  async notifyDone(payload: {
    board: TugasBoardEntity;
    task: TugasTaskEntity;
    assigneePositionId: string;
    assigneePersnum: number;
    actor: TugasActor;
  }) {
    if (payload.assigneePositionId === payload.actor.position) return;
    await this.notificationService.createNotification(
      {
        positionId: payload.assigneePositionId,
        userPersnum: payload.assigneePersnum,
        type: NotificationType.TUGAS_DONE,
        title: 'Task ditandai selesai',
        body: `${payload.actor.nama} menandai "${payload.task.judul}" selesai di papan "${payload.board.nama}".`,
        data: {
          action: 'OPEN_TUGAS_TASK',
          boardId: payload.board.id,
          taskId: payload.task.id,
        },
      },
      true,
    );
  }

  /**
   * Reminder H-1 tenggat — cron harian 07:00 WIB.
   *
   * Idempoten lintas instance: claim reminder_h1_sent_at secara conditional
   * (UPDATE ... WHERE reminder_h1_sent_at IS NULL) SEBELUM create notifikasi.
   * - Claim sukses + insert gagal → reset claim agar retry berikutnya jalan.
   * - Claim sukses + insert sukses (FCM boleh gagal) → claim tetap.
   */
  @Cron('0 7 * * *', { timeZone: 'Asia/Jakarta' })
  async sendDueReminders(): Promise<void> {
    try {
      const tomorrow = this.tomorrowInJakarta();
      const dueTasks = await this.taskRepository
        .createQueryBuilder('task')
        .innerJoinAndSelect('task.board', 'board')
        .innerJoinAndSelect('task.assigneeMember', 'assignee')
        .where('task.tenggat = :tomorrow', { tomorrow })
        .andWhere('task.status != :done', { done: 'done' })
        .andWhere('task.archived_at IS NULL')
        .andWhere('task.reminder_h1_sent_at IS NULL')
        .andWhere('board.deleted_at IS NULL')
        .getMany();

      if (!dueTasks.length) return;
      this.logger.log(
        `⏰ [TUGAS_DUE] ${dueTasks.length} task jatuh tempo besok (${tomorrow} WIB)`,
      );

      for (const task of dueTasks) {
        const assignee = task.assigneeMember;
        if (!assignee) continue;

        // Claim conditional: hanya task yang belum di-claim yang ter-update.
        const claimed = await this.taskRepository
          .createQueryBuilder()
          .update(TugasTaskEntity)
          .set({ reminderH1SentAt: new Date() })
          .where('id = :id AND reminder_h1_sent_at IS NULL', { id: task.id })
          .execute();

        if (!claimed.affected) continue; // instance lain sudah claim.

        try {
          await this.notificationService.createNotification(
            {
              positionId: assignee.positionId,
              userPersnum: assignee.persnum,
              type: NotificationType.TUGAS_DUE,
              title: 'Task jatuh tempo besok',
              body: `"${task.judul}" di papan "${task.board.nama}" jatuh tempo besok (${task.tenggat}).`,
              data: {
                action: 'OPEN_TUGAS_TASK',
                boardId: task.boardId,
                taskId: task.id,
              },
            },
            true,
            true,
          );
        } catch (err) {
          // Insert gagal SETELAH claim → reset agar retry berikutnya berjalan.
          // Kegagalan FCM sudah ditoleransi oleh argumen ketiga; karena itu
          // hanya kegagalan persist notifikasi yang dapat mencapai blok ini.
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `❌ [TUGAS_DUE] gagal kirim reminder task ${task.id}: ${message}`,
          );
          await this.taskRepository
            .createQueryBuilder()
            .update(TugasTaskEntity)
            .set({ reminderH1SentAt: null })
            .where('id = :id', { id: task.id })
            .execute();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ [TUGAS_DUE] cron error: ${message}`);
    }
  }

  /**
   * Emit assigned-count delta ke room posisi setelah assignment berubah.
   * Dipanggil service Tugas SETELAH transaction commit.
   */
  async emitAssignedCount(positionId: string, company: string): Promise<void> {
    try {
      const count = await this.taskRepository
        .createQueryBuilder('task')
        .innerJoin('task.board', 'board')
        .innerJoin('task.assigneeMember', 'assignee')
        .where('assignee.position_id = :positionId', { positionId })
        .andWhere('board.company = :company', { company })
        .andWhere('board.deleted_at IS NULL')
        .andWhere('task.archived_at IS NULL')
        .andWhere('task.status != :done', { done: 'done' })
        .getCount();
      this.realtimeEmitService.emitTugasAssignedCount(positionId, count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `⚠️ [emitAssignedCount] failed for ${positionId}: ${message}`,
      );
    }
  }

  /**
   * Wrapper emit board-updated yang aman dipanggil fire-and-forget:
   * kegagalan emit tidak boleh membatalkan response mutasi domain.
   */
  emitBoardUpdatedSafe(payload: {
    boardId: string;
    revision: number;
    action: string;
    taskId?: string | null;
    actor: TugasActor;
  }) {
    this.realtimeEmitService.emitTugasBoardUpdated({
      boardId: payload.boardId,
      revision: payload.revision,
      action: payload.action,
      taskId: payload.taskId ?? null,
      actor: { persnum: payload.actor.persnum, nama: payload.actor.nama },
    });
    if (payload.taskId) {
      this.realtimeEmitService.emitTugasTaskUpdated({
        boardId: payload.boardId,
        taskId: payload.taskId,
        revision: payload.revision,
        action: payload.action,
        actor: { persnum: payload.actor.persnum, nama: payload.actor.nama },
      });
    }
  }

  /**
   * Emit komentar baru ke room board — client menambahkan komentar secara
   * realtime tanpa refetch penuh. Tidak menaikkan revision papan karena
   * komentar tidak mengubah state task.
   */
  emitCommentAddedSafe(payload: {
    boardId: string;
    taskId: string;
    commentId: string;
    actor: TugasActor;
  }) {
    this.realtimeEmitService.emitTugasCommentAdded({
      boardId: payload.boardId,
      taskId: payload.taskId,
      commentId: payload.commentId,
      actor: { persnum: payload.actor.persnum, nama: payload.actor.nama },
    });
  }

  /**
   * Emit komentar dihapus ke room board agar client lain me-render ulang
   * daftar komentar (komentar bisa dihapus penulisnya kapan saja).
   */
  emitCommentDeletedSafe(payload: {
    boardId: string;
    taskId: string;
    commentId: string;
    actor: TugasActor;
  }) {
    this.realtimeEmitService.emitTugasCommentDeleted({
      boardId: payload.boardId,
      taskId: payload.taskId,
      commentId: payload.commentId,
      actor: { persnum: payload.actor.persnum, nama: payload.actor.nama },
    });
  }

  private tomorrowInJakarta(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA menghasilkan YYYY-MM-DD; tambah 1 hari pada tanggal Jakarta.
    const today = formatter.format(new Date());
    const [year, month, day] = today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    return formatter.format(tomorrow);
  }
}
