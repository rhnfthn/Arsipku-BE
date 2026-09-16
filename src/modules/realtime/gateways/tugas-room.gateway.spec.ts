/* eslint-disable @typescript-eslint/unbound-method */
import { ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeSyncService } from '../services/realtime-sync.service';
import { TugasAccessReader } from '../../tugas/services/tugas-access.reader';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { Socket } from 'socket.io';

const makeClient = (user: JwtPayload | undefined) =>
  ({
    data: { user },
    join: jest.fn(),
    leave: jest.fn(),
  }) as unknown as Socket;

const jwtPayload: JwtPayload = {
  persnum: 100,
  nama: 'Pemilik',
  role: 'superadmin',
  company: '1000',
  companyText: 'PERUM LPPNPI',
  area: '1',
  areaText: '',
  subArea: '',
  subAreaText: '',
  organization: '',
  organizationText: '',
  position: 'POS-1',
  positionText: 'Manager',
  bodTag: '',
  abbreviation: '',
} as unknown as JwtPayload;

describe('RealtimeGateway tugas rooms (Phase 6)', () => {
  const VALID_BOARD_ID = 'e4864a9b-a85f-4ee3-93be-888dd73ef195';

  function createGateway(accessReader: TugasAccessReader | null) {
    const moduleRef = {
      get: jest.fn().mockReturnValue(accessReader),
    } as unknown as ModuleRef;
    const gateway = new RealtimeGateway(
      {} as JwtService,
      {} as ConfigService,
      {} as RealtimeSyncService,
      moduleRef,
    );
    return { gateway, moduleRef };
  }

  it('menolak subscribe tanpa autentikasi', async () => {
    const { gateway } = createGateway(null);
    const client = makeClient(undefined);

    const result = await gateway.onSubscribeTugas(client, {
      boardId: VALID_BOARD_ID,
    });

    expect(result).toMatchObject({ status: 'error' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('menolak boardId non-UUID', async () => {
    const { gateway } = createGateway(null);
    const client = makeClient(jwtPayload);

    const result = await gateway.onSubscribeTugas(client, {
      boardId: 'bukan-uuid',
    });

    expect(result).toMatchObject({
      status: 'error',
      message: 'Invalid boardId',
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('menolak non-member tanpa membocorkan keberadaan board', async () => {
    const accessReader = {
      assertBoardMember: jest.fn().mockRejectedValue(new Error('not found')),
    } as unknown as TugasAccessReader;
    const { gateway } = createGateway(accessReader);
    const client = makeClient(jwtPayload);

    const result = await gateway.onSubscribeTugas(client, {
      boardId: VALID_BOARD_ID,
    });

    expect(result).toMatchObject({
      status: 'error',
      message: 'Board not found',
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('join room board hanya setelah membership valid', async () => {
    const accessReader = {
      assertBoardMember: jest.fn().mockResolvedValue({}),
    } as unknown as TugasAccessReader;
    const { gateway } = createGateway(accessReader);
    const client = makeClient(jwtPayload);

    const result = await gateway.onSubscribeTugas(client, {
      boardId: VALID_BOARD_ID,
    });

    expect(result).toMatchObject({
      status: 'subscribed',
      boardId: VALID_BOARD_ID,
    });
    expect(accessReader.assertBoardMember).toHaveBeenCalledWith(
      VALID_BOARD_ID,
      jwtPayload.company,
      jwtPayload.position,
    );
    expect(client.join).toHaveBeenCalledWith(`tugas:board:${VALID_BOARD_ID}`);
  });

  it('unsubscribe meninggalkan room board', async () => {
    const { gateway } = createGateway(null);
    const client = makeClient(jwtPayload);

    const result = await gateway.onUnsubscribeTugas(client, {
      boardId: VALID_BOARD_ID,
    });

    expect(result).toMatchObject({ status: 'unsubscribed' });
    expect(client.leave).toHaveBeenCalledWith(`tugas:board:${VALID_BOARD_ID}`);
  });

  it('mengirim task-updated hanya ke room papan terkait', () => {
    const { gateway } = createGateway(null);
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gateway as any).server = { to };
    const payload = {
      boardId: VALID_BOARD_ID,
      taskId: 'task-1',
      revision: 8,
      action: 'update_task',
      occurredAt: new Date().toISOString(),
    };

    gateway.emitTugasTaskUpdated(payload);

    expect(to).toHaveBeenCalledWith(`tugas:board:${VALID_BOARD_ID}`);
    expect(emit).toHaveBeenCalledWith('tugas:task-updated', payload);
  });
});
