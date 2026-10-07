import { EntityManager } from 'typeorm';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';

/** Use the domain transaction: ND can create the Portal request before commit. */
export async function reservePortalCorrespondenceNumber(
  manager: EntityManager,
  id: string,
): Promise<void> {
  const naskah = await manager
    .getRepository(NaskahEntity)
    .findOne({ where: { id } });
  if (naskah?.status !== 'pending_tte' || !naskah.nomor) return;
  await manager
    .getRepository(NomorRequestDetailEntity)
    .update(
      { nomor: naskah.nomor, status: 'terpakai_final' },
      { status: 'booking' },
    );
}
