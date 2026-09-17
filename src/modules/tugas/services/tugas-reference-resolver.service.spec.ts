/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { DiEntity } from '../../disposisi/entities/di.entity';
import { NaskahLainnyaApprovalEntity } from '../../naskah-lainnya/entities/naskah-lainnya-approval.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { TugasReferenceType } from '../enums';
import { TugasActor } from '../tugas.types';
import { TugasReferenceResolver } from './tugas-reference-resolver.service';

const actor: TugasActor = {
  persnum: 100,
  nama: 'User A',
  company: '1000',
  position: 'POSITION-A',
  positionText: 'Manager',
  role: 'user',
};

function approvalQuery(result: NaskahLainnyaApprovalEntity | null) {
  const query: Record<string, jest.Mock> = {};
  query.where = jest.fn(() => query);
  query.andWhere = jest.fn(() => query);
  query.getOne = jest.fn(() => Promise.resolve(result));
  return query;
}

function createResolver(options: {
  naskah?: NaskahEntity | null;
  disposisi?: DiEntity | null;
  circulation?: NaskahSirkulasi | null;
  approval?: NaskahLainnyaApprovalEntity | null;
  shares?: unknown[];
}) {
  const naskahRepository = {
    findOne: jest.fn(() => Promise.resolve(options.naskah ?? null)),
  } as unknown as Repository<NaskahEntity>;
  const diRepository = {
    findOne: jest.fn(() => Promise.resolve(options.disposisi ?? null)),
  } as unknown as Repository<DiEntity>;
  const sirkulasiRepository = {
    findOne: jest.fn(() => Promise.resolve(options.circulation ?? null)),
  } as unknown as Repository<NaskahSirkulasi>;
  const approvalRepository = {
    createQueryBuilder: jest.fn(() => approvalQuery(options.approval ?? null)),
  } as unknown as Repository<NaskahLainnyaApprovalEntity>;
  const dataSource = {
    query: jest.fn(() => Promise.resolve(options.shares ?? [])),
  } as unknown as DataSource;
  const resolver = new TugasReferenceResolver(
    naskahRepository,
    diRepository,
    sirkulasiRepository,
    approvalRepository,
    dataSource,
  );
  return { resolver, naskahRepository, sirkulasiRepository, dataSource };
}

describe('TugasReferenceResolver (Phase 7)', () => {
  const naskah = {
    id: '11111111-1111-4111-8111-111111111111',
    nomor: 'ND-123/2026',
    perihal: 'Persiapan rakornas',
    jenis: 'ND',
    dikirimOleh: null,
    penandatanganChain: null,
  } as unknown as NaskahEntity;

  it('membentuk snapshot dan route setelah akses posisi/company terbukti', async () => {
    const { resolver, sirkulasiRepository } = createResolver({
      naskah,
      circulation: { id: 'circulation' } as NaskahSirkulasi,
    });

    const result = await resolver.resolve(
      TugasReferenceType.NASKAH_MASUK,
      naskah.id,
      actor,
    );

    expect(sirkulasiRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idNaskah: naskah.id,
          position: actor.position,
          company: actor.company,
        }),
      }),
    );
    expect(result).toEqual({
      referenceType: TugasReferenceType.NASKAH_MASUK,
      referenceId: naskah.id,
      labelSnapshot: 'ND-123/2026 — Persiapan rakornas',
      route: `/korespondensi/kotak-masuk/${naskah.id}`,
    });
  });

  it('menerima penerima share aktif tanpa membuka akses task ke dokumen', async () => {
    const { resolver, dataSource } = createResolver({
      naskah,
      shares: [{ 1: 1 }],
    });

    const result = await resolver.resolve(
      TugasReferenceType.NASKAH_MASUK,
      naskah.id,
      actor,
    );

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('naskah_share_recipient'),
      [naskah.id, actor.position],
    );
    expect(result.referenceId).toBe(naskah.id);
  });

  it('menolak posisi/company tanpa akses sebelum membaca metadata naskah', async () => {
    const { resolver, naskahRepository } = createResolver({ naskah });

    await expect(
      resolver.resolve(TugasReferenceType.NASKAH_MASUK, naskah.id, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(naskahRepository.findOne).not.toHaveBeenCalled();
  });

  it('memakai naskah.id sebagai ID dan route disposisi', async () => {
    const disposisiNaskah = { ...naskah, jenis: 'DI' } as NaskahEntity;
    const disposisi = {
      id: '22222222-2222-4222-8222-222222222222',
      idNaskah: disposisiNaskah.id,
      nomor: 'DI-456',
      perihal: 'Tindak lanjut laporan',
    } as DiEntity;
    const { resolver } = createResolver({
      naskah: disposisiNaskah,
      disposisi,
      circulation: { id: 'circulation' } as NaskahSirkulasi,
    });

    const result = await resolver.resolve(
      TugasReferenceType.DISPOSISI,
      disposisiNaskah.id,
      actor,
    );

    expect(result.referenceId).toBe(disposisiNaskah.id);
    expect(result.labelSnapshot).toBe('DI-456 — Tindak lanjut laporan');
    expect(result.route).toBe(
      `/korespondensi/kotak-masuk/${disposisiNaskah.id}?jenis=DI`,
    );
  });

  it('menolak disposisi yang tidak dapat diakses tanpa membaca metadata', async () => {
    const { resolver, naskahRepository } = createResolver({
      naskah: { ...naskah, jenis: 'DI' } as NaskahEntity,
    });

    await expect(
      resolver.resolve(TugasReferenceType.DISPOSISI, naskah.id, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(naskahRepository.findOne).not.toHaveBeenCalled();
  });

  it('mengizinkan Naskah Lainnya hanya untuk participant di company yang sama', async () => {
    const lainnya = {
      ...naskah,
      jenis: 'PER',
      dikirimOleh: {
        persnum: String(actor.persnum),
        nama: actor.nama,
        position_text: actor.positionText,
        position_id: actor.position,
        company: actor.company,
      },
    } as NaskahEntity;
    const { resolver } = createResolver({ naskah: lainnya });

    const result = await resolver.resolve(
      TugasReferenceType.NASKAH_LAINNYA,
      lainnya.id,
      actor,
    );

    expect(result.route).toBe(`/naskah-lainnya/${lainnya.id}`);
  });

  it('menyamarkan Naskah Lainnya company lain sebagai 404', async () => {
    const lainnya = {
      ...naskah,
      jenis: 'PER',
      dikirimOleh: {
        persnum: String(actor.persnum),
        nama: actor.nama,
        position_text: actor.positionText,
        position_id: actor.position,
        company: 'COMPANY-LAIN',
      },
    } as NaskahEntity;
    const { resolver } = createResolver({ naskah: lainnya });

    await expect(
      resolver.resolve(TugasReferenceType.NASKAH_LAINNYA, lainnya.id, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('menolak Naskah Lainnya non-participant di company yang sama', async () => {
    const lainnya = {
      ...naskah,
      jenis: 'PER',
      dikirimOleh: {
        persnum: '999',
        position_id: 'POSITION-LAIN',
        company: actor.company,
      },
    } as NaskahEntity;
    const { resolver } = createResolver({ naskah: lainnya });

    await expect(
      resolver.resolve(TugasReferenceType.NASKAH_LAINNYA, lainnya.id, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mempertahankan label fallback dan batas 255 karakter', async () => {
    const longNaskah = {
      ...naskah,
      perihal: 'P'.repeat(400),
    } as NaskahEntity;
    const { resolver } = createResolver({
      naskah: longNaskah,
      circulation: { id: 'circulation' } as NaskahSirkulasi,
    });

    const result = await resolver.resolve(
      TugasReferenceType.NASKAH_MASUK,
      longNaskah.id,
      actor,
    );
    expect(result.labelSnapshot.length).toBeLessThanOrEqual(255);
    expect(result.labelSnapshot.endsWith('...')).toBe(true);
  });
});
