import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { TteSignerIdentityService } from './tte-signer-identity.service';

describe('TteSignerIdentityService', () => {
  const sessionRepository = {
    findOne: jest.fn(),
  };
  let service: TteSignerIdentityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TteSignerIdentityService(sessionRepository as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the active browser session that belongs to the signer', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-active',
      userPersnum: 12345,
      airnavAccessToken: 'airnav-token',
      airnavExpiredAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: [{ subType: '01', number: '1234567890123456' }] },
    });

    await expect(service.getNik(12345, 'session-active')).resolves.toBe(
      '1234567890123456',
    );
    expect(sessionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'session-active', userPersnum: 12345 },
      order: { createdAt: 'DESC' },
    });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/12345'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer airnav-token',
        }),
      }),
    );
  });

  it('rejects a browser session that does not belong to the signer', async () => {
    const axiosGet = jest.spyOn(axios, 'get');
    sessionRepository.findOne.mockResolvedValue(null);

    await expect(service.getNik(12345, 'other-session')).rejects.toThrow(
      'Session browser tidak valid',
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('returns a login instruction when the HR API rejects the token', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-active',
      userPersnum: 12345,
      airnavAccessToken: 'expired-token',
      airnavExpiredAt: new Date(Date.now() + 60_000),
    });
    jest.spyOn(axios, 'get').mockRejectedValue({
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      response: { status: 401 },
      message: 'Request failed with status code 401',
    });

    await expect(service.getNik(12345, 'session-active')).rejects.toEqual(
      expect.objectContaining<Partial<BadRequestException>>({
        message:
          'Session AirNav tidak dapat digunakan untuk verifikasi NIK. Silakan login ulang.',
      }),
    );
  });
});
