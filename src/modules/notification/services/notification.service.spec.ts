import { DataSource, Repository } from 'typeorm';
import { FcmService } from '../../fcm/services';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { NotificationEntity, NotificationType } from '../entities';
import { NotificationGateway } from '../gateways';
import { NotificationService } from './notification.service';

describe('NotificationService position scope', () => {
  function createService() {
    const query = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
    };
    for (const method of [
      'where',
      'andWhere',
      'orderBy',
      'skip',
      'take',
    ] as const) {
      query[method].mockReturnValue(query);
    }
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      create: jest.fn((value) => value),
      save: jest.fn((value) =>
        Promise.resolve({ ...value, id: 'notification-1' }),
      ),
    } as unknown as Repository<NotificationEntity>;
    const fcmService = {
      sendToUserForPosition: jest.fn().mockResolvedValue(undefined),
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };
    const notificationGateway = {
      emitNewNotification: jest.fn(),
      emitUnreadCount: jest.fn(),
    };
    const service = new NotificationService(
      repository,
      {} as DataSource,
      fcmService as unknown as FcmService,
      notificationGateway as unknown as NotificationGateway,
      {} as RealtimeEmitService,
    );
    return { service, query, fcmService };
  }

  it('tidak memakai fallback persnum untuk seluruh tipe notifikasi Tugas', async () => {
    const { service, query } = createService();

    await service.getNotifications('POS-AKTIF', {}, 100);

    const parameters = query.where.mock.calls[0][1];
    expect(parameters.persuratanTypes).toEqual(
      expect.arrayContaining([
        NotificationType.TUGAS_MEMBER_ADDED,
        NotificationType.TUGAS_ASSIGNED,
        NotificationType.TUGAS_DONE,
        NotificationType.TUGAS_DUE,
      ]),
    );
  });

  it('menyimpan reminder satu kali walaupun FCM gagal', async () => {
    const { service, fcmService } = createService();
    fcmService.sendToUserForPosition.mockRejectedValueOnce(
      new Error('FCM unavailable'),
    );

    await expect(
      service.createNotification(
        {
          positionId: 'POS-AKTIF',
          userPersnum: 100,
          type: NotificationType.TUGAS_DUE,
          title: 'Tenggat',
          body: 'Task jatuh tempo besok',
          data: { action: 'OPEN_TUGAS_TASK' },
        },
        true,
        true,
      ),
    ).resolves.toMatchObject({ id: 'notification-1' });
    expect(fcmService.sendToUserForPosition).toHaveBeenCalledWith(
      100,
      'POS-AKTIF',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ type: NotificationType.TUGAS_DUE }),
    );
  });
});
