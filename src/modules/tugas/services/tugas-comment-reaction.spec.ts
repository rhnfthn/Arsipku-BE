import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { validate } from 'class-validator';
import { TugasCommentService } from './tugas-comment.service';
import { TugasAccessReader } from './tugas-access.reader';
import { TugasActivityService } from './tugas-activity.service';
import { TugasNotificationService } from './tugas-notification.service';
import {
  TugasCommentReactionEntity,
  TugasTaskCommentEntity,
} from '../entities';
import { SetCommentReactionDto } from '../dto';
import { TugasActor } from '../tugas.types';

const actor = { company: 'c', position: 'p', persnum: 1 } as TugasActor;

describe('Forum reactions', () => {
  let service: TugasCommentService;
  const comment = { findOne: jest.fn(), findOneOrFail: jest.fn() };
  const hidden = { findOne: jest.fn() };
  const reaction = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((value: unknown) => value),
  };
  const access = { assertBoardMember: jest.fn() };
  const notification = { emitCommentReactionChangedSafe: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    access.assertBoardMember.mockResolvedValue({ member: { id: 'm1' } });
    comment.findOne.mockResolvedValue({ id: 'msg1', isi: 'Hello' });
    comment.findOneOrFail.mockResolvedValue({ id: 'msg1', isi: 'Hello' });
    hidden.findOne.mockResolvedValue(null);
    reaction.findOne.mockResolvedValue(null);
    reaction.find.mockResolvedValue([
      { emoji: '👍', memberId: 'm1' },
      { emoji: '👍', memberId: 'm2' },
      { emoji: '❤️', memberId: 'm2' },
    ]);
    const manager = {
      getRepository: (entity: unknown) =>
        entity === TugasTaskCommentEntity
          ? comment
          : entity === TugasCommentReactionEntity
            ? reaction
            : hidden,
    } as unknown as EntityManager;
    const ds = {
      manager,
      getRepository: (entity: unknown) =>
        manager.getRepository(entity as never),
      transaction: (callback: (manager: EntityManager) => unknown) =>
        callback(manager),
    } as unknown as DataSource;
    service = new TugasCommentService(
      ds,
      access as unknown as TugasAccessReader,
      {} as TugasActivityService,
      notification as unknown as TugasNotificationService,
    );
  });
  it('adds an own reaction, locks the scoped comment, and emits after commit', async () => {
    const result = await service.setReaction(
      'b1',
      'msg1',
      { emoji: '👍', active: true },
      actor,
    );
    expect(comment.findOne).toHaveBeenCalledWith({
      where: { id: 'msg1', boardId: 'b1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(reaction.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'msg1',
        memberId: 'm1',
        emoji: '👍',
      }),
    );
    expect(result.data).toEqual(
      expect.arrayContaining([
        { emoji: '👍', count: 2, reacted: true },
        { emoji: '❤️', count: 1, reacted: false },
      ]),
    );
    expect(notification.emitCommentReactionChangedSafe).toHaveBeenCalledWith({
      boardId: 'b1',
      commentId: 'msg1',
    });
  });
  it('repeated active requests do not duplicate reactions', async () => {
    reaction.findOne.mockResolvedValue({ id: 'existing' });
    await service.setReaction(
      'b1',
      'msg1',
      { emoji: '👍', active: true },
      actor,
    );
    expect(reaction.save).not.toHaveBeenCalled();
  });
  it('only removes the active membership reaction', async () => {
    await service.setReaction(
      'b1',
      'msg1',
      { emoji: '👍', active: false },
      actor,
    );
    expect(reaction.delete).toHaveBeenCalledWith({
      commentId: 'msg1',
      memberId: 'm1',
      emoji: '👍',
    });
  });
  it('rejects non-members before writing', async () => {
    access.assertBoardMember.mockRejectedValue(new ForbiddenException());
    await expect(
      service.setReaction('b1', 'msg1', { emoji: '👍', active: true }, actor),
    ).rejects.toThrow(ForbiddenException);
    expect(reaction.save).not.toHaveBeenCalled();
    expect(notification.emitCommentReactionChangedSafe).not.toHaveBeenCalled();
  });
  it('rejects comments outside the board', async () => {
    comment.findOne.mockResolvedValue(null);
    await expect(
      service.setReaction('b1', 'msg1', { emoji: '👍', active: true }, actor),
    ).rejects.toThrow(NotFoundException);
  });
  it('rejects deleted messages', async () => {
    comment.findOne.mockResolvedValue({ isi: '' });
    await expect(
      service.setReaction('b1', 'msg1', { emoji: '👍', active: true }, actor),
    ).rejects.toThrow(BadRequestException);
    expect(reaction.save).not.toHaveBeenCalled();
  });
  it('rejects messages hidden for the active member', async () => {
    hidden.findOne.mockResolvedValue({ id: 'hide' });
    await expect(
      service.setReaction('b1', 'msg1', { emoji: '👍', active: true }, actor),
    ).rejects.toThrow(NotFoundException);
  });
  it('does not expose reactions on a deleted message', async () => {
    comment.findOneOrFail.mockResolvedValue({ isi: '' });
    expect((await service.getReactions('b1', 'msg1', actor)).data).toEqual([]);
  });
  it('validates the emoji allowlist and boolean action', async () => {
    const dto = Object.assign(new SetCommentReactionDto(), {
      emoji: 'arbitrary',
      active: 'true',
    });
    expect((await validate(dto)).map((error) => error.property).sort()).toEqual(
      ['active', 'emoji'],
    );
  });
});
