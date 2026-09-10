import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway naskah lainnya detail rooms', () => {
  const naskahId = '6cfbad6f-f2e0-46be-835c-a0c785f9994d';

  function createGateway() {
    return new RealtimeGateway({} as any, {} as any, {} as any);
  }

  it('client terautentikasi dapat subscribe dan unsubscribe room naskah', async () => {
    const gateway = createGateway();
    const client = {
      data: { user: { position: 'POS-1' } },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
    } as any;

    await expect(
      gateway.onSubscribeNaskahLainnya(client, { naskahId }),
    ).resolves.toEqual({ status: 'subscribed', naskahId });
    expect(client.join).toHaveBeenCalledWith(`naskah-lainnya:${naskahId}`);

    await expect(
      gateway.onUnsubscribeNaskahLainnya(client, { naskahId }),
    ).resolves.toEqual({ status: 'unsubscribed', naskahId });
    expect(client.leave).toHaveBeenCalledWith(`naskah-lainnya:${naskahId}`);
  });

  it('menolak subscription tanpa autentikasi atau UUID valid', async () => {
    const client = { data: {}, join: jest.fn() } as any;
    await expect(
      createGateway().onSubscribeNaskahLainnya(client, { naskahId }),
    ).resolves.toEqual({ status: 'error', message: 'Unauthorized' });

    client.data.user = { position: 'POS-1' };
    await expect(
      createGateway().onSubscribeNaskahLainnya(client, {
        naskahId: 'bukan-uuid',
      }),
    ).resolves.toEqual({ status: 'error', message: 'Invalid naskahId' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('mengirim invalidasi hanya ke room naskah terkait', () => {
    const gateway = createGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to };
    const payload = { naskahId, occurredAt: '2026-09-10T09:00:00.000Z' };

    gateway.emitNaskahLainnyaUpdated(payload);

    expect(to).toHaveBeenCalledWith(`naskah-lainnya:${naskahId}`);
    expect(emit).toHaveBeenCalledWith('naskah-lainnya:updated', payload);
  });
});
