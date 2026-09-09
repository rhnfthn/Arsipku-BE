import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkflowService } from './workflow.service';
import { NaskahLainnyaApprovalEntity } from '../entities/naskah-lainnya-approval.entity';
import { NaskahLainnyaRiwayatEntity } from '../entities/naskah-lainnya-riwayat.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { LegalRoleService } from '../../konfigurasi/services/legal-role.service';

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

describe('WorkflowService', () => {
  let svc: WorkflowService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: getRepositoryToken(NaskahLainnyaApprovalEntity),
          useValue: repo(),
        },
        {
          provide: getRepositoryToken(NaskahLainnyaRiwayatEntity),
          useValue: repo(),
        },
        { provide: getRepositoryToken(NaskahEntity), useValue: repo() },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb) => cb({ manager: { save: jest.fn() } })),
          },
        },
        {
          provide: LegalRoleService,
          useValue: { getActivePositionIds: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    svc = mod.get(WorkflowService);
  });

  it('buildStepper: butuhLegal=false menghapus Legal Drafting, Evaluasi, PD & Blanko dari stepper', () => {
    const steps = svc.buildStepper('persetujuan', false, 1);
    const labels = steps.map((s) => s.label);
    expect(labels).not.toContain('Legal Drafting');
    expect(labels).not.toContain('Evaluasi');
    expect(labels).not.toContain('Persetujuan Direksi');
    expect(labels).not.toContain('Blanko Verbal / Persetujuan Direksi');
    // step tersisa berurutan 1..M, persetujuan aktif
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4]);
    expect(steps.find((s) => s.label === 'Persetujuan')?.status).toBe('active');
  });

  it('buildStepper: selesai → step terakhir "Selesai" berstatus done (icon check), bukan active', () => {
    const steps = svc.buildStepper('selesai', true, 1);
    const last = steps[steps.length - 1];
    expect(last.label).toBe('Selesai');
    expect(last.status).toBe('done');
    // semua step done saat selesai (tidak ada active/todo)
    expect(steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('transisi kirim: konsep → persetujuan, menulis riwayat + baris approval', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'konsep',
      butuhLegal: true,
      tanggal: new Date('2026-08-13'),
    } as NaskahEntity;
    const manager = {
      save: jest.fn((e) => e),
      update: jest.fn(),
      delete: jest.fn(),
    };
    await svc.transisi(naskah, 'kirim', {
      aktor: 'M Fakhri A',
      jabatan: 'Kabag Hukum',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('persetujuan');
    expect(manager.update).toHaveBeenCalled();
  });

  it('setuju pada baris terakhir persetujuan → legal_drafting (butuhLegal)', async () => {
    const naskah = {
      id: 'n2',
      tahapan: 'persetujuan',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', {
      aktor: 'Test',
      catatan: 'ok',
      manager: manager as any,
    });
    expect(next).toBe('legal_drafting');
    expect(approval.find((a) => a.id === 'a2')?.status).toBe('verified');
  });

  it('setuju baris terakhir persetujuan tetap maju walau ada baris evaluasi rejected dari siklus sebelumnya (daur ulang Legal Drafting Ulang)', async () => {
    const naskah = {
      id: 'n2-recycle',
      tahapan: 'persetujuan',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
      // Sisa siklus evaluasi sebelumnya — tidak boleh menghalangi tahap aktif.
      { id: 'evp', tahap: 'evaluasi', urutan: 1, status: 'rejected' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', {
      aktor: 'Test',
      catatan: 'ok',
      manager: manager as any,
    });
    expect(next).toBe('legal_drafting');
  });

  it('setuju pada baris terakhir persetujuan → tanda_tangan (!butuhLegal, N=2; skip evaluasi)', async () => {
    const naskah = {
      id: 'n2b',
      tahapan: 'persetujuan',
      butuhLegal: false,
      penandatanganChain: [{}, {}],
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', {
      aktor: 'Test',
      catatan: 'ok',
      manager: manager as any,
    });
    expect(next).toBe('tanda_tangan');
  });

  it('setuju pada baris terakhir persetujuan → selesai (!butuhLegal, N=0; tanpa penandatangan)', async () => {
    const naskah = {
      id: 'n2c',
      tahapan: 'persetujuan',
      butuhLegal: false,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', {
      aktor: 'Test',
      catatan: 'ok',
      manager: manager as any,
    });
    expect(next).toBe('selesai');
  });

  it('setuju verifikator terakhir → approval Naskah Draft oleh penandatangan TTD fisik', async () => {
    const naskah = {
      id: 'n2d',
      tahapan: 'persetujuan',
      butuhLegal: true,
      signOption: 'ttd_basah',
      penandatanganChain: [
        { nama: 'A', jabatan: 'X' },
        { nama: 'B', jabatan: 'Y' },
      ],
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'verified' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a2', 'setuju', {
      aktor: 'Test',
      manager: manager as any,
    });
    expect(next).toBe('tanda_tangan');
  });

  it('setuju belum semua → tetap persetujuan', async () => {
    const naskah = {
      id: 'n3',
      tahapan: 'persetujuan',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a1', 'setuju', {
      aktor: 'Test',
      catatan: undefined,
      manager: manager as any,
    });
    expect(next).toBe('persetujuan');
  });

  it('applyApproval: direksi parallel — urutan 2 can act before urutan 1', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'persetujuan_direksi',
      butuhLegal: true,
      signingIndex: 0,
    } as any;
    const rows = [
      {
        id: 'a1',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 1,
        status: 'waiting',
        nama: 'A',
      } as any,
      {
        id: 'a2',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 2,
        status: 'waiting',
        nama: 'B',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    await svc.applyApproval(naskah, rows, 'a2', 'setuju', {
      aktor: 'B',
      catatan: undefined,
      manager: manager as any,
    });
    expect(rows[1].status).toBe('verified');
    expect(naskah.tahapan).toBe('persetujuan_direksi');
  });

  it('applyApproval: direksi parallel — all verified triggers complete', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'persetujuan_direksi',
      butuhLegal: true,
      signingIndex: 0,
    } as any;
    const rows = [
      {
        id: 'a1',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 1,
        status: 'verified',
        nama: 'A',
      } as any,
      {
        id: 'a2',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 2,
        status: 'waiting',
        nama: 'B',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'setuju', {
      aktor: 'B',
      catatan: undefined,
      manager: manager as any,
    });
    expect(rows[1].status).toBe('verified');
    expect(next).toBe('blanko_verbal');
    expect(naskah.tahapan).toBe('blanko_verbal');
  });

  it('applyApproval: direksi reject short-circuits remaining waiting rows', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'persetujuan_direksi',
      butuhLegal: true,
      signingIndex: 0,
    } as any;
    const rows = [
      {
        id: 'a1',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 1,
        status: 'waiting',
        nama: 'A',
      } as any,
      {
        id: 'a2',
        naskahId: 'n1',
        tahap: 'persetujuan_direksi',
        urutan: 2,
        status: 'waiting',
        nama: 'B',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'tolak', {
      aktor: 'B',
      catatan: 'salah',
      manager: manager as any,
    });
    expect(rows[0].status).toBe('rejected');
    expect(rows[1].status).toBe('rejected');
    expect(next).toBe('legal_drafting');
    expect(naskah.tahapan).toBe('legal_drafting');
  });

  it('applyApproval: blanko_verbal parallel — urutan 2 can act before urutan 1', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      signingIndex: 0,
    } as any;
    const rows = [
      {
        id: 'a1',
        naskahId: 'n1',
        tahap: 'blanko_verbal',
        urutan: 1,
        status: 'waiting',
        nama: 'A',
      } as any,
      {
        id: 'a2',
        naskahId: 'n1',
        tahap: 'blanko_verbal',
        urutan: 2,
        status: 'waiting',
        nama: 'B',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    await svc.applyApproval(naskah, rows, 'a2', 'setuju', {
      aktor: 'B',
      catatan: undefined,
      manager: manager as any,
    });
    expect(rows[1].status).toBe('verified');
    expect(naskah.tahapan).toBe('blanko_verbal');
  });

  it('applyApproval: blanko_verbal all verified auto-advances ke signingTarget (selesai saat N=0)', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      signingIndex: 0,
    } as any;
    const rows = [
      {
        id: 'a1',
        naskahId: 'n1',
        tahap: 'blanko_verbal',
        urutan: 1,
        status: 'verified',
        nama: 'A',
      } as any,
      {
        id: 'a2',
        naskahId: 'n1',
        tahap: 'blanko_verbal',
        urutan: 2,
        status: 'waiting',
        nama: 'B',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, rows, 'a2', 'setuju', {
      aktor: 'B',
      catatan: undefined,
      manager: manager as any,
    });
    expect(rows[1].status).toBe('verified');
    // N=0 (tanpa penandatangan) → signingTarget = selesai
    expect(next).toBe('selesai');
    expect(naskah.tahapan).toBe('selesai');
  });

  it('applyApproval blanko: Ditetapkan baru aktif setelah seluruh Diketahui selesai, lalu langsung selesai', async () => {
    const naskah = {
      id: 'n1',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      signingIndex: null,
      penandatanganChain: [{ positionId: 'SIGNER_1' }],
    } as any;
    const rows = [
      {
        id: 'ditetapkan',
        naskahId: 'n1',
        tahap: 'blanko_verbal_ditetapkan',
        urutan: 1,
        status: 'pending',
        nama: 'Direktur Utama',
      } as any,
      {
        id: 'diketahui',
        naskahId: 'n1',
        tahap: 'blanko_verbal',
        urutan: 1,
        status: 'waiting',
        nama: 'Direktur Operasi',
      } as any,
    ];
    const manager = { save: jest.fn((e) => e) };

    const afterDiketahui = await svc.applyApproval(
      naskah,
      rows,
      'diketahui',
      'setuju',
      {
        aktor: 'Direktur Operasi',
        catatan: undefined,
        manager: manager as any,
      },
    );

    expect(afterDiketahui).toBe('blanko_verbal');
    expect(rows[0].status).toBe('waiting');

    const next = await svc.applyApproval(naskah, rows, 'ditetapkan', 'setuju', {
      aktor: 'Direktur Utama',
      catatan: undefined,
      manager: manager as any,
    });

    expect(next).toBe('selesai');
    expect(naskah.tahapan).toBe('selesai');
  });

  it('applyApproval LPD pilihan pada blanko: Ditetapkan aktif setelah Diketahui lalu selesai', async () => {
    const naskah = {
      id: 'n-lpd-option',
      // Setelah template LPD dikirim dari step gabungan, state teknis berpindah
      // ke persetujuan_direksi agar endpoint approval LPD dapat dipakai.
      tahapan: 'persetujuan_direksi',
      butuhLegal: true,
    } as any;
    const rows = [
      {
        id: 'lpd-established',
        tahap: 'persetujuan_direksi_ditetapkan',
        status: 'pending',
        urutan: 1,
      },
      {
        id: 'lpd-known',
        tahap: 'persetujuan_direksi',
        status: 'waiting',
        urutan: 1,
      },
    ] as any[];
    const manager = { save: jest.fn((entity) => entity) };

    const afterDiketahui = await svc.applyApproval(
      naskah,
      rows,
      'lpd-known',
      'setuju',
      {
        aktor: 'Direktur',
        manager: manager as any,
        completionTransitionFrom: 'blanko_verbal',
      },
    );
    expect(afterDiketahui).toBe('persetujuan_direksi');
    expect(rows[0].status).toBe('waiting');

    const next = await svc.applyApproval(
      naskah,
      rows,
      'lpd-established',
      'setuju',
      {
        aktor: 'Direktur Utama',
        manager: manager as any,
        completionTransitionFrom: 'blanko_verbal',
      },
    );
    expect(next).toBe('selesai');
    expect(naskah.tahapan).toBe('selesai');
  });

  it('applyApproval blanko: satu penolakan menolak kelompok aktif dan pending lalu kembali ke legal', async () => {
    const naskah = {
      id: 'n-reject',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
    } as any;
    const rows = [
      {
        id: 'known-1',
        tahap: 'blanko_verbal',
        status: 'waiting',
        urutan: 1,
      },
      {
        id: 'known-2',
        tahap: 'blanko_verbal',
        status: 'waiting',
        urutan: 2,
      },
      {
        id: 'established',
        tahap: 'blanko_verbal_ditetapkan',
        status: 'pending',
        urutan: 1,
      },
    ] as any[];
    const manager = { save: jest.fn((entity) => entity) };

    const next = await svc.applyApproval(naskah, rows, 'known-1', 'tolak', {
      aktor: 'Direktur',
      catatan: 'Perbaiki substansi',
      manager: manager as any,
    });

    expect(next).toBe('legal_drafting');
    expect(rows.every((row) => row.status === 'rejected')).toBe(true);
  });

  it('applyApproval menolak aksi urutan 2 bila urutan 1 masih waiting (berjenjang)', async () => {
    const naskah = {
      id: 'n5',
      tahapan: 'persetujuan',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' },
      { id: 'a2', tahap: 'persetujuan', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    await expect(
      svc.applyApproval(naskah, approval, 'a2', 'setuju', {
        aktor: 'Test',
        catatan: undefined,
        manager: manager as any,
      }),
    ).rejects.toThrow('Urutan approval sebelumnya belum selesai');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('tolak → perlu_perbaikan', async () => {
    const naskah = {
      id: 'n4',
      tahapan: 'persetujuan',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'a1', tahap: 'persetujuan', urutan: 1, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'a1', 'tolak', {
      aktor: 'Test',
      catatan: 'alasan',
      manager: manager as any,
    });
    expect(next).toBe('perlu_perbaikan');
  });

  it('legal_drafting: setuju semua → evaluasi', async () => {
    const naskah = {
      id: 'l1',
      tahapan: 'legal_drafting',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'verified' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'la2', 'setuju', {
      aktor: 'Legal B',
      manager: manager as any,
    });
    expect(next).toBe('evaluasi');
    expect(naskah.tahapan).toBe('evaluasi');
  });

  it('legal_drafting: tolak → legal_drafting (kembali ke drafter legal untuk revisi & kirim ulang) + short-circuit baris waiting lain', async () => {
    const naskah = {
      id: 'l2',
      tahapan: 'legal_drafting',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'waiting' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(naskah, approval, 'la1', 'tolak', {
      aktor: 'Legal A',
      catatan: 'revisi',
      manager: manager as any,
    });
    expect(next).toBe('legal_drafting');
    expect(naskah.tahapan).toBe('legal_drafting');
    // baris waiting lain ikut rejected (short-circuit)
    expect(approval.find((a) => a.id === 'la2')?.status).toBe('rejected');
  });

  it('legal_drafting: kembalikan → perlu_perbaikan (kembali ke pemrakarsa) + short-circuit baris waiting lain', async () => {
    const naskah = {
      id: 'l2b',
      tahapan: 'legal_drafting',
      butuhLegal: true,
    } as NaskahEntity;
    const approval = [
      { id: 'la1', tahap: 'legal_drafting', urutan: 1, status: 'waiting' },
      { id: 'la2', tahap: 'legal_drafting', urutan: 2, status: 'waiting' },
    ] as NaskahLainnyaApprovalEntity[];
    const manager = { save: jest.fn((e) => e) };
    const next = await svc.applyApproval(
      naskah,
      approval,
      'la1',
      'kembalikan',
      { aktor: 'Legal A', catatan: 'kembalikan', manager: manager as any },
    );
    expect(next).toBe('perlu_perbaikan');
    expect(naskah.tahapan).toBe('perlu_perbaikan');
    expect(approval.find((a) => a.id === 'la2')?.status).toBe('rejected');
  });

  it('buildAvailableActions legal_drafting: hasWaitingLegalRows=true → kosong (drafter tunggu approver)', async () => {
    const actions = await svc.buildAvailableActions(
      'legal_drafting',
      true,
      { positionId: 'POS_LEGAL' },
      true,
    );
    expect(actions).toEqual([]);
  });

  it('buildAvailableActions evaluasi kosong karena aksi ditentukan service untuk pemrakarsa/EVP', async () => {
    expect(
      await svc.buildAvailableActions('evaluasi', true, {
        positionText: 'Kabag Hukum',
      }),
    ).toEqual([]);
    expect(
      await svc.buildAvailableActions('evaluasi', true, {
        positionId: 'POS_X',
      }),
    ).toEqual([]);
    expect(
      await svc.buildAvailableActions('evaluasi', false, {
        positionId: 'POS_X',
      }),
    ).toEqual([]);
  });

  it('resolveNext kembalikan-evaluasi → legal_drafting', () => {
    expect(svc.resolveNext('evaluasi', 'kembalikan-evaluasi', true)).toBe(
      'legal_drafting',
    );
  });

  it('resolveNext: evaluasi + setuju + butuhLegal → persetujuan_direksi', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', true)).toBe(
      'persetujuan_direksi',
    );
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal → signingTarget', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false)).toBe(
      svc.signingTarget(0),
    );
  });

  it('resolveNext: persetujuan_direksi + complete → blanko_verbal', () => {
    expect(svc.resolveNext('persetujuan_direksi', 'complete', true)).toBe(
      'blanko_verbal',
    );
  });

  it('resolveNext: memilih Lembar Persetujuan Direksi dari step gabungan → persetujuan_direksi', () => {
    expect(
      svc.resolveNext(
        'blanko_verbal',
        'kirim-lembar-persetujuan-direksi',
        true,
      ),
    ).toBe('persetujuan_direksi');
  });

  it('resolveNext: blanko_verbal gabungan + complete → selesai', () => {
    expect(svc.resolveNext('blanko_verbal', 'complete', true, 1, 2, null)).toBe(
      'selesai',
    );
  });

  it('resolveNext: blanko_verbal + complete (fisik) → selesai', () => {
    expect(
      svc.resolveNext('blanko_verbal', 'complete', true, 1, 2, 'ttd_basah'),
    ).toBe('selesai');
  });

  it('resolveNext: persetujuan_direksi + tolak → legal_drafting', () => {
    expect(svc.resolveNext('persetujuan_direksi', 'tolak', true)).toBe(
      'legal_drafting',
    );
  });

  it('buildStepper menggabungkan persetujuan direksi dan blanko verbal', () => {
    const stepper = svc.buildStepper('persetujuan_direksi', true, 0);
    const labels = stepper.map((s) => s.label);
    expect(labels).toContain('Blanko Verbal / Persetujuan Direksi');
    expect(labels).not.toContain('Persetujuan Direksi');
    expect(labels).not.toContain('Persetujuan Lanjutan');
    expect(labels).not.toContain('Evaluasi Final EVP');
  });

  it('buildStepper TTD fisik menampilkan approval draft setiap penandatangan', () => {
    const stepper = svc.buildStepper('selesai', true, 2, null, 'ttd_basah');
    expect(stepper.map((s) => s.label)).toEqual([
      'Konsep Naskah',
      'Persetujuan',
      'Tanda Tangan Penandatangan 1',
      'Tanda Tangan Penandatangan 2',
      'Selesai',
    ]);
  });

  it('buatApprovalLegalDrafting: hapus baris legal lama + seed baru, tetap legal_drafting', async () => {
    const naskah = {
      id: 'l3',
      tahapan: 'legal_drafting',
      butuhLegal: true,
      tanggal: new Date('2026-08-18'),
    } as NaskahEntity;
    const manager = { save: jest.fn((e) => e), delete: jest.fn() };
    const approval = [
      { positionId: 'P1', nama: 'Legal A', jabatan: 'Kabag Hukum' },
      { positionId: 'P2', nama: 'Legal B', jabatan: 'Staff Legal' },
    ];
    await svc.buatApprovalLegalDrafting(manager as any, naskah, approval, {
      aktor: 'Drafter',
    });
    expect(manager.delete).toHaveBeenCalledWith(NaskahLainnyaApprovalEntity, {
      naskahId: 'l3',
      tahap: 'legal_drafting',
    });
    // 2 baris baru di-seed (save dipanggil untuk tiap baris + riwayat)
    expect(manager.save).toHaveBeenCalled();
    expect(naskah.tahapan).toBe('legal_drafting');
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal + N>0 → tanda_tangan', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false, 1, 2)).toBe(
      'tanda_tangan',
    );
  });

  it('resolveNext: evaluasi + setuju + !butuhLegal + N=0 → selesai (skip signing)', () => {
    expect(svc.resolveNext('evaluasi', 'setuju', false, 1, 0)).toBe('selesai');
  });

  it('effectiveSignerCount: chain null + legacy atasNama/positionId → 1 (bukan 0)', () => {
    // Legacy naskah (penandatanganChain null, penandatangan hanya di field legacy).
    // Harus dihitung 1 — bukan 0 — supaya validasi kirim qr_only & transisi signing
    // tidak salah anggap tidak ada penandatangan.
    expect(
      svc.effectiveSignerCount({
        atasNama: 'Budi',
        penandatanganPositionId: 'P1',
      } as any),
    ).toBe(1);
    expect(svc.effectiveSignerCount({ atasNama: 'Budi' } as any)).toBe(1);
    expect(
      svc.effectiveSignerCount({ penandatanganPositionId: 'P1' } as any),
    ).toBe(1);
    // Tanpa chain maupun legacy → 0.
    expect(svc.effectiveSignerCount({} as any)).toBe(0);
    // Chain terisi → pakai panjang chain.
    expect(
      svc.effectiveSignerCount({ penandatanganChain: [{}, {}] } as any),
    ).toBe(2);
  });

  it('resolveNext: evaluasi + tolak → perlu_perbaikan', () => {
    expect(svc.resolveNext('evaluasi', 'tolak', true, 1, 2)).toBe(
      'perlu_perbaikan',
    );
  });

  it('buildAvailableActions persetujuan_direksi: non-legal → paraf/tolak; legal tanpa baris BOD → kirim-lembar; legal dgn baris BOD → []', async () => {
    expect(
      await svc.buildAvailableActions(
        'persetujuan_direksi',
        true,
        { positionId: 'POS_X' },
        false,
        false,
      ),
    ).toEqual(['paraf', 'tolak']);
    expect(
      await svc.buildAvailableActions(
        'persetujuan_direksi',
        true,
        { positionText: 'Kabag Hukum' },
        false,
        false,
      ),
    ).toEqual(['kirim-lembar-persetujuan-direksi']);
    expect(
      await svc.buildAvailableActions(
        'persetujuan_direksi',
        true,
        { positionText: 'Kabag Hukum' },
        false,
        true,
      ),
    ).toEqual([]);
  });

  it('buildAvailableActions blanko_verbal: legal dapat membuat lalu tetap membuka progres setelah dikirim', async () => {
    expect(
      await svc.buildAvailableActions(
        'blanko_verbal',
        true,
        { positionText: 'Kabag Hukum' },
        false,
        false,
      ),
    ).toEqual(['kirim-approval-blanko']);
    expect(
      await svc.buildAvailableActions(
        'blanko_verbal',
        true,
        { positionText: 'Kabag Hukum' },
        false,
        true,
      ),
    ).toEqual(['buka-blanko-verbal']);
  });

  it('signingTarget: N=0 → selesai, N>0 → tanda_tangan', () => {
    expect(svc.signingTarget(0)).toBe('selesai');
    expect(svc.signingTarget(3)).toBe('tanda_tangan');
    expect(svc.signingTarget(3, 'ttd_basah')).toBe('tanda_tangan');
  });

  it('buildAvailableActions TTD fisik memberi aksi setujui draft dan tolak', async () => {
    await expect(
      svc.buildAvailableActions(
        'tanda_tangan',
        false,
        { positionText: 'Direktur' },
        false,
        false,
        'ttd_basah',
      ),
    ).resolves.toEqual(['tanda-tangan', 'tolak-tanda-tangan']);
  });

  it('nextAfterTtd tanda_tangan: idx<N tetap, idx>=N selesai', () => {
    expect(svc.nextAfterTtd('tanda_tangan', 1, 3)).toBe('tanda_tangan');
    expect(svc.nextAfterTtd('tanda_tangan', 3, 3)).toBe('selesai');
  });

  it('transisiTandaTangan terakhir TTD fisik menyelesaikan approval draft dengan status pending', async () => {
    const naskah = {
      id: 'physical-signing',
      tahapan: 'tanda_tangan',
      signOption: 'ttd_basah',
      signingIndex: 1,
      penandatanganChain: [{ nama: 'Direktur', jabatan: 'Direktur' }],
      tanggal: new Date('2026-08-31'),
    } as NaskahEntity;
    const manager = { save: jest.fn(), update: jest.fn() };

    await svc.transisiTandaTangan(naskah, {
      aktor: 'Direktur',
      manager: manager as any,
    });

    expect(naskah.tahapan).toBe('selesai');
    expect(naskah.status).toBe('pending');
    expect(manager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.any(Object),
      expect.objectContaining({
        tahapan: 'selesai',
        signingIndex: null,
        status: 'pending',
      }),
    );
  });

  it('transisi kirim-approval-blanko: blanko_verbal → tanda_tangan + signingIndex=1', async () => {
    const naskah = {
      id: 'b1',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      penandatanganChain: [
        { nama: 'A', jabatan: 'X' },
        { nama: 'B', jabatan: 'Y' },
      ],
      tanggal: new Date('2026-08-18'),
    } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisi(naskah, 'kirim-approval-blanko', {
      aktor: 'Legal',
      jabatan: 'Kepala Unit Legal',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('tanda_tangan');
    expect(naskah.signingIndex).toBe(1);
    expect(manager.update).toHaveBeenCalled();
  });

  it('transisi kirim-approval-blanko fisik: masuk approval penandatangan', async () => {
    const naskah = {
      id: 'b1-manual',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      signOption: 'ttd_basah',
      penandatanganChain: [{ nama: 'A', jabatan: 'X' }],
      tanggal: new Date('2026-08-18'),
    } as NaskahEntity;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisi(naskah, 'kirim-approval-blanko', {
      aktor: 'Legal',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('tanda_tangan');
    expect(manager.update).toHaveBeenCalledWith(
      NaskahEntity,
      expect.any(Object),
      expect.objectContaining({ signingIndex: 1 }),
    );
  });

  it('transisi kirim-blanko: blanko_verbal stays blanko_verbal', async () => {
    const naskah = {
      id: 'b2',
      tahapan: 'blanko_verbal',
      butuhLegal: true,
      penandatanganChain: [
        { nama: 'A', jabatan: 'X' },
        { nama: 'B', jabatan: 'Y' },
      ],
      tanggal: new Date('2026-08-18'),
    } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisi(naskah, 'kirim-blanko', {
      aktor: 'Legal',
      jabatan: 'Kepala Unit Legal',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('blanko_verbal');
    expect(naskah.signingIndex).toBeUndefined();
    expect(manager.update).toHaveBeenCalled();
  });

  it('transisiTandaTangan: idx<N → increment signingIndex', async () => {
    const naskah = {
      id: 's1',
      tahapan: 'tanda_tangan',
      signingIndex: 1,
      penandatanganChain: [
        { nama: 'A', jabatan: 'X' },
        { nama: 'B', jabatan: 'Y' },
      ],
      tanggal: new Date('2026-08-18'),
    } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisiTandaTangan(naskah, {
      aktor: 'A',
      jabatan: 'X',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('tanda_tangan');
    expect(naskah.signingIndex).toBe(2);
  });

  it('transisiTandaTangan: idx===N → selesai + signingIndex null', async () => {
    const naskah = {
      id: 's2',
      tahapan: 'tanda_tangan',
      signingIndex: 2,
      penandatanganChain: [
        { nama: 'A', jabatan: 'X' },
        { nama: 'B', jabatan: 'Y' },
      ],
      tanggal: new Date('2026-08-18'),
    } as any;
    const manager = { save: jest.fn(), update: jest.fn() };
    await svc.transisiTandaTangan(naskah, {
      aktor: 'B',
      jabatan: 'Y',
      manager: manager as any,
    });
    expect(naskah.tahapan).toBe('selesai');
    expect(naskah.signingIndex).toBeNull();
  });

  it('buildAvailableActions tanda_tangan hanya menyediakan tanda tangan atau tolak ke legal', async () => {
    await expect(
      svc.buildAvailableActions(
        'tanda_tangan',
        true,
        { positionText: 'Direktur' } as any,
        false,
        false,
        'qr_only',
      ),
    ).resolves.toEqual(['tanda-tangan', 'tolak-tanda-tangan']);
  });

  it('buildStepper non-legal tetap memiliki sub-step tanda tangan', () => {
    const steps = svc.buildStepper('tanda_tangan', false, 2, 1);
    const signingSteps = steps.filter((s) =>
      /Tanda Tangan Penandatangan/.test(s.label),
    );
    expect(signingSteps.length).toBe(2);
    expect(signingSteps[0].status).toBe('active');
    expect(signingSteps[1].status).toBe('todo');
  });
});
