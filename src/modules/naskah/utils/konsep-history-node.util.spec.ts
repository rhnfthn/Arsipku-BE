import { buildKonsepHistoryNode } from './konsep-history-node.util';
import { compareNaskahFlow } from './naskah-flow-order.util';
import type { KonsepRiwayatEntity } from '../../konsep/entities/konsep-riwayat.entity';

describe('concept history in finalized correspondence chain', () => {
  const node = {
    id: 'concept',
    jenis: 'K',
    status: 'final',
    level: 0,
    perihal: 'Konsep',
    pengirim: {
      position_id: '1',
      position_text: 'Rini Position',
      nama: 'Rini',
      persnum: '11',
    },
    penerima: [
      {
        position_id: '2',
        position_text: 'Hermana Position',
        nama: 'Hermana',
        persnum: '22',
      },
    ],
    final_pdf: 'latest.pdf',
    final_pdf_url: 'latest-url',
  };
  const history = (aksi: string, urutan: number, extra: any = {}) =>
    ({
      id: `event-${urutan}`,
      aksi,
      urutan,
      fromPositionId: 1,
      fromPositionText: 'Rini Position',
      fromNama: 'Rini',
      toPositionId: 2,
      toPositionText: 'Hermana Position',
      toNama: 'Hermana',
      createdBy: '11',
      createdAt: new Date('2026-10-07T02:23:00Z'),
      ...extra,
    }) as KonsepRiwayatEntity;

  it('retains rejection action, historical actor/recipient, reason and timestamp', () => {
    const result = buildKonsepHistoryNode(
      node,
      history('reject', 2, {
        fromPositionId: 2,
        fromPositionText: 'PT. Hermana Position',
        fromNama: 'Hermana',
        createdBy: '22',
        toPositionId: 1,
        toPositionText: 'Rini Position',
        toNama: 'Rini',
        catatan: 'betulkan',
      }),
      'ND',
      null,
    );
    expect(result).toMatchObject({
      aksi: 'reject',
      catatan: 'betulkan',
      jenis_label: 'Konsep',
      jenis_naskah_konsep: 'ND',
      pengirim: {
        position_id: '2',
        position_text: 'PT. Hermana Position',
        nama: 'Hermana',
        persnum: '22',
      },
      penerima: [{ position_id: '1', nama: 'Rini' }],
      detail: { aksi: 'reject', catatan: 'betulkan' },
      final_pdf: undefined,
      final_pdf_url: null,
    });
    expect(result.created_at).toEqual(new Date('2026-10-07T02:23:00Z'));
  });
  it('keeps separate events on one concept document and no recipient for finalization', () => {
    const forward = buildKonsepHistoryNode(
      node,
      history('forward', 3, {
        catatan: 'sudah diperbaiki',
        pdfSnapshot: 'v3.pdf',
      }),
      'ND',
      'v3-url',
    );
    const finalized = buildKonsepHistoryNode(
      node,
      history('finalize', 4, { toPositionId: null, pdfSnapshot: null }),
      'ND',
      null,
    );
    expect(forward.final_pdf_url).toBe('v3-url');
    expect(finalized.penerima).toEqual([]);
    expect(forward.id).toBe(finalized.id);
    expect(forward.flow_id).not.toBe(finalized.flow_id);
    expect(finalized.final_pdf_url).toBeNull();
    const ordered = [
      finalized,
      { ...node, id: 'final', jenis: 'ND' },
      forward,
    ].sort(compareNaskahFlow);
    expect(ordered.map((item) => item.aksi)).toEqual([
      'forward',
      'finalize',
      undefined,
    ]);
    expect(node.final_pdf).toBe('latest.pdf');
  });
});
