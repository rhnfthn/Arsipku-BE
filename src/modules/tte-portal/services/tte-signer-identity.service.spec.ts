import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { Repository } from 'typeorm';
import { Session } from '../../auth/entities/session.entity';
import {
  TteSignerIdentityService,
  resolveTteDigsigMode,
} from './tte-signer-identity.service';

describe('TteSignerIdentityService', () => {
  const sessionRepository = {
    findOne: jest.fn(),
  };
  let service: TteSignerIdentityService;
  const originalMode = process.env.TTE_DIGSIG_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TTE_DIGSIG_MODE = 'PRD';
    service = new TteSignerIdentityService(
      sessionRepository as unknown as Repository<Session>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMode === undefined) delete process.env.TTE_DIGSIG_MODE;
    else process.env.TTE_DIGSIG_MODE = originalMode;
  });

  it('uses the default NIK in DEV without looking up sessions or HR', async () => {
    process.env.TTE_DIGSIG_MODE = 'DEV';
    const get = jest.spyOn(axios, 'get');
    await expect(service.getNik(12345, 'browser-session')).resolves.toBe(
      '1234567890123452',
    );
    await expect(service.getNik(67890)).resolves.toBe('1234567890123452');
    expect(sessionRepository.findOne).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('defaults to DEV when mode is unset and normalizes configured values', async () => {
    delete process.env.TTE_DIGSIG_MODE;
    await expect(service.getNik(12345)).resolves.toBe('1234567890123452');
    process.env.TTE_DIGSIG_MODE = ' prd ';
    expect(resolveTteDigsigMode()).toBe('PRD');
  });

  it('rejects invalid modes rather than silently selecting a test identity', async () => {
    process.env.TTE_DIGSIG_MODE = 'production';
    await expect(service.getNik(12345)).rejects.toThrow('harus DEV atau PRD');
    expect(sessionRepository.findOne).not.toHaveBeenCalled();
  });

  it('does not fall back to the DEV NIK when HR has no valid production NIK', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session',
      airnavExpiredAt: new Date(Date.now() + 60000),
      airnavAccessToken: 'token',
    });
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { data: [{ subType: '01', number: '' }] } });
    await expect(service.getNik(12345)).rejects.toThrow(
      'tidak ditemukan di data HR',
    );
  });

  it('rejects expired production sessions before contacting HR', async () => {
    sessionRepository.findOne.mockResolvedValue({
      airnavExpiredAt: new Date(Date.now() - 60000),
    });
    const get = jest.spyOn(axios, 'get');
    await expect(service.getNik(12345)).rejects.toThrow('expired');
    expect(get).not.toHaveBeenCalled();
  });

  it('uses the active browser session that belongs to the signer', async () => {
    sessionRepository.findOne.mockResolvedValue({
      id: 'session-active',
      userPersnum: 12345,
      airnavAccessToken: 'airnav-token',
      airnavExpiredAt: new Date(Date.now() + 60_000),
    });
    const axiosGet = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: [{ subType: '01', number: '1234567890123456' }] },
    });

    await expect(service.getNik(12345, 'session-active')).resolves.toBe(
      '1234567890123456',
    );
    expect(sessionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'session-active', userPersnum: 12345 },
      order: { createdAt: 'DESC' },
    });
    expect(axiosGet).toHaveBeenCalledWith(
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
