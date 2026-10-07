import type { KonsepRiwayatEntity } from '../../konsep/entities/konsep-riwayat.entity';

/** Snapshot pelaku dan tujuan berasal dari aksi riwayat, bukan status dokumen K. */
export function buildKonsepHistoryNode(
  node: any,
  history: KonsepRiwayatEntity,
  jenisNaskah: string | null,
  snapshotUrl: string | null,
) {
  const fromMatches =
    String(node.pengirim?.position_id) === String(history.fromPositionId);
  const recipient = node.penerima?.find(
    (person: any) =>
      String(person.position_id) === String(history.toPositionId),
  );
  const pengirim = {
    ...(fromMatches ? node.pengirim : {}),
    position_id: String(history.fromPositionId),
    position_text:
      history.fromPositionText ||
      (fromMatches ? node.pengirim?.position_text : '') ||
      '',
    nama: history.fromNama || (fromMatches ? node.pengirim?.nama : '') || '',
    persnum: history.createdBy || (fromMatches ? node.pengirim?.persnum : null),
  };
  const penerima =
    history.toPositionId == null
      ? []
      : [
          {
            ...recipient,
            position_id: String(history.toPositionId),
            position_text:
              history.toPositionText || recipient?.position_text || '',
            nama: history.toNama || recipient?.nama || '',
          },
        ];
  return {
    ...node,
    flow_id: history.id,
    konsep_sequence: history.urutan,
    jenis_label: 'Konsep',
    jenis_naskah_konsep: jenisNaskah,
    aksi: history.aksi,
    catatan: history.catatan,
    perihal: history.perihalSnapshot || node.perihal,
    tanggal: history.createdAt,
    created_at: history.createdAt,
    updated_at: null,
    pengirim,
    penerima,
    tembusan: [],
    penerima_grup: [],
    tembusan_grup: [],
    final_pdf: history.pdfSnapshot,
    final_pdf_url: snapshotUrl,
    detail: { ...node.detail, aksi: history.aksi, catatan: history.catatan },
  };
}
