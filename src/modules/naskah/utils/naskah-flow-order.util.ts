interface NaskahFlowNode {
  jenis?: string | null;
  nomor?: string | null;
  level?: number | null;
  tanggal?: string | Date | null;
  created_at?: string | Date | null;
}

const getKonsepSequence = (node: NaskahFlowNode): number | null => {
  if (String(node.jenis || '').toUpperCase() !== 'K') return null;

  const match = String(node.nomor || '').match(/^KONSEP-(\d+)$/i);
  return match ? Number(match[1]) : null;
};

const getTimestamp = (node: NaskahFlowNode): number => {
  const raw = node.created_at || node.tanggal;
  if (!raw) return 0;

  const normalized =
    typeof raw === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? raw.replace(' ', 'T')
      : raw;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

/**
 * Urutan response rangkaian:
 * - chain level yang sedang dilihat tetap didahulukan;
 * - workflow konsep pada level yang sama selalu KONSEP-001, 002, dst.;
 * - naskah final ditempatkan setelah rangkaian konsepnya;
 * - node non-konsep lain mempertahankan urutan terbaru lebih dahulu.
 */
export const compareNaskahFlow = (
  a: NaskahFlowNode,
  b: NaskahFlowNode,
): number => {
  const aLevel = Number(a.level || 0);
  const bLevel = Number(b.level || 0);
  if (aLevel !== bLevel) return bLevel - aLevel;

  const aKonsepSequence = getKonsepSequence(a);
  const bKonsepSequence = getKonsepSequence(b);

  if (aKonsepSequence !== null && bKonsepSequence !== null) {
    if (aKonsepSequence !== bKonsepSequence) {
      return aKonsepSequence - bKonsepSequence;
    }
    return getTimestamp(a) - getTimestamp(b);
  }

  if (aKonsepSequence !== null) return -1;
  if (bKonsepSequence !== null) return 1;

  return getTimestamp(b) - getTimestamp(a);
};
