import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { DEFAULT_BSRE_NIK } from '../../../common/constants/bsre.constants';
import { Session } from '../../auth/entities/session.entity';

export type TteDigsigMode = 'DEV' | 'PRD';

export function resolveTteDigsigMode(): TteDigsigMode {
  const mode = process.env.TTE_DIGSIG_MODE?.trim().toUpperCase() || 'DEV';
  if (mode !== 'DEV' && mode !== 'PRD') {
    throw new BadRequestException('TTE_DIGSIG_MODE harus DEV atau PRD');
  }
  return mode;
}

interface HrPersonalIdentity {
  subType?: string;
  number?: string | number;
}

interface HrPersonalIdentityResponse {
  data?: HrPersonalIdentity[];
}

/**
 * Identity lookup khusus Portal TTE.
 *
 * Sengaja dipisahkan dari DigsigService agar jalur BSrE direct tetap memakai
 * kontrak legacy (NIK shared + passphrase dari Arsipku) tanpa perubahan.
 */
@Injectable()
export class TteSignerIdentityService {
  private readonly logger = new Logger(TteSignerIdentityService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  async getNik(
    persnum: number,
    sessionId?: string,
    mode: TteDigsigMode = resolveTteDigsigMode(),
  ): Promise<string> {
    // Portal development uses the test identity; production always resolves HR KTP.
    if (mode === 'DEV') return DEFAULT_BSRE_NIK;

    const session = await this.sessionRepository.findOne({
      where: sessionId
        ? { id: sessionId, userPersnum: persnum }
        : { userPersnum: persnum },
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      throw new BadRequestException(
        sessionId
          ? 'Session browser tidak valid. Silakan login ulang untuk melanjutkan TTE Portal.'
          : 'Session tidak ditemukan. Silakan login ulang untuk melanjutkan TTE Portal.',
      );
    }
    if (new Date() > new Date(session.airnavExpiredAt)) {
      throw new BadRequestException(
        'Token AirNav sudah expired. Silakan login ulang untuk melanjutkan TTE Portal.',
      );
    }

    try {
      const response = await axios.get<HrPersonalIdentityResponse>(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/personal-ids/${persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.airnavAccessToken}`,
          },
          timeout: 30_000,
        },
      );
      const identities: HrPersonalIdentity[] = Array.isArray(
        response.data?.data,
      )
        ? response.data.data
        : [];
      const nik = identities.find(
        (identity) => identity.subType === '01',
      )?.number;
      const normalized = nik == null ? '' : String(nik).trim();
      if (!/^\d{16}$/.test(normalized)) {
        throw new BadRequestException(
          'NIK penandatangan tidak ditemukan di data HR (KTP). Hubungi administrator untuk registrasi DIGSIG.',
        );
      }
      return normalized;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const code = axios.isAxiosError(error) ? error.code : null;
      this.logger.warn(
        `Gagal mengambil NIK Portal TTE untuk persnum ${persnum}` +
          ` (session=${session.id.slice(0, 8)}..., status=${status ?? '-'}, code=${code ?? '-'}): ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      if (status === 401 || status === 403) {
        throw new BadRequestException(
          'Session AirNav tidak dapat digunakan untuk verifikasi NIK. Silakan login ulang.',
        );
      }
      throw new BadRequestException(
        'NIK penandatangan tidak dapat diverifikasi. Silakan coba lagi atau login ulang.',
      );
    }
  }
}
