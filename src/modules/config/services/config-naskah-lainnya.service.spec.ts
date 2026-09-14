import { BadRequestException } from '@nestjs/common';
import { ConfigNaskahLainnyaService } from './config-naskah-lainnya.service';

function makeRepo() {
  return {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null as any),
    create: jest.fn((e: any) => e),
    save: jest.fn(async (e: any) => e),
  };
}

describe('ConfigNaskahLainnyaService', () => {
  it('findByJenis mengembalikan default stub bila belum ada row', async () => {
    const repo = makeRepo();
    const svc = new ConfigNaskahLainnyaService(repo as any);
    const res = await svc.findByJenis('PER');
    expect(res.jenisNaskah).toBe('PER');
    expect(res.butuhLegal).toBe(false);
    expect(res.shareEnabled).toBe(false);
    expect(res.defaultKlasifikasi).toBeNull();

    const edaran = await svc.findByJenis('EDR');
    expect(edaran.shareEnabled).toBe(true);
  });

  it('findAll mengembalikan semua jenis, row tersimpan menimpa stub', async () => {
    const repo = makeRepo();
    repo.find.mockResolvedValue([
      {
        jenisNaskah: 'KEP',
        butuhLegal: true,
        shareEnabled: true,
        defaultKlasifikasi: 'Biasa',
      } as any,
    ]);
    const svc = new ConfigNaskahLainnyaService(repo as any);
    const all = await svc.findAll();
    expect(all.length).toBe(19);
    const kep = all.find((r) => r.jenisNaskah === 'KEP');
    expect(kep?.butuhLegal).toBe(true);
    expect(kep?.shareEnabled).toBe(true);
    const per = all.find((r) => r.jenisNaskah === 'PER');
    expect(per?.defaultKlasifikasi).toBeNull();
    // Kode baru hasil penyamaan dengan nama file template (template_naskah_mapping.md)
    expect(all.map((r) => r.jenisNaskah)).toContain('SPR');
    expect(all.map((r) => r.jenisNaskah)).toContain('EDR');
    expect(all.map((r) => r.jenisNaskah)).toContain('MOU');
    expect(all.map((r) => r.jenisNaskah)).toContain('PROC');
    expect(all.map((r) => r.jenisNaskah)).toContain('PJJ');
    expect(all.map((r) => r.jenisNaskah)).toContain('BAC');
    expect(all.map((r) => r.jenisNaskah)).toContain('KET');
    expect(all.map((r) => r.jenisNaskah)).toContain('SPE');
    expect(all.map((r) => r.jenisNaskah)).toContain('RPT');
    expect(all.map((r) => r.jenisNaskah)).toContain('PEN');
    expect(all.map((r) => r.jenisNaskah)).toContain('PGM');
  });

  it('update membuat row baru bila belum ada, update bila sudah ada', async () => {
    const repo = makeRepo();
    const svc = new ConfigNaskahLainnyaService(repo as any);
    const saved = await svc.update('PER', {
      butuhLegal: true,
      shareEnabled: true,
      defaultKlasifikasi: 'Penting',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jenisNaskah: 'PER',
        butuhLegal: true,
        shareEnabled: true,
        defaultKlasifikasi: 'Penting',
      }),
    );
    expect(saved.butuhLegal).toBe(true);
    expect(saved.shareEnabled).toBe(true);

    // Row sudah ada → properti tidak dikirim tidak tertimpa.
    repo.findOne.mockResolvedValue({
      jenisNaskah: 'PER',
      butuhLegal: true,
      shareEnabled: true,
      defaultKlasifikasi: 'Penting',
    } as any);
    await svc.update('PER', { defaultKlasifikasi: '' });
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ butuhLegal: true, defaultKlasifikasi: null }),
    );
  });

  it('menolak jenis tidak dikenal', async () => {
    const repo = makeRepo();
    const svc = new ConfigNaskahLainnyaService(repo as any);
    await expect(svc.findByJenis('XXX')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.update('nd', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
