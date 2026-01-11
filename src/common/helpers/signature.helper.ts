import { v4 as uuidv4 } from 'uuid';

export interface SignatureMetadata {
  type: 'digsig' | 'passphrase' | 'internal' | 'image' | 'unknown';
  signature_id?: string; // Unique ID untuk signature
  doc_id?: string;
  signed_at?: string;
  signer_nik?: string;
  signer_id?: string;
  signer_name?: string;
  signer_jabatan?: string;
  path?: string;
  raw?: string;
  verification_url?: string;
  bsre_name_doc?: string; // name_doc dari BSrE (krusial untuk verifikasi)
}

/**
 * Generate unique signature ID
 * Format: SIG-{timestamp}-{random}
 */
export function generateSignatureId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = uuidv4().split('-')[0].toUpperCase();
  return `SIG-${timestamp}-${random}`;
}

/**
 * Parse kolom tanda_tangan untuk mendapatkan metadata
 */
export function parseSignatureData(
  tandaTangan: string | null,
): SignatureMetadata | null {
  if (!tandaTangan) return null;

  try {
    // Try parse as JSON (format baru)
    if (tandaTangan.startsWith('{')) {
      return JSON.parse(tandaTangan) as SignatureMetadata;
    }

    // Try parse as delimiter (format alternatif)
    if (tandaTangan.includes('|')) {
      const parts = tandaTangan.split('|');
      const [type, doc_id, signed_at, path] = parts;
      return {
        type: type as 'digsig' | 'passphrase' | 'internal',
        doc_id,
        signed_at,
        path,
      };
    }

    // Legacy format (path gambar TTD atau string lainnya)
    return {
      type: 'image',
      path: tandaTangan,
      raw: tandaTangan,
    };
  } catch (error) {
    return {
      type: 'unknown',
      raw: tandaTangan,
    };
  }
}

/**
 * Format signature metadata ke string untuk disimpan di database
 */
export function formatSignatureData(metadata: {
  type: 'digsig' | 'passphrase' | 'internal';
  signature_id?: string;
  doc_id?: string;
  signed_at?: string;
  signer_nik?: string;
  signer_id?: string;
  signer_name?: string;
  signer_jabatan?: string;
  path?: string | null;
  verification_url?: string;
  bsre_name_doc?: string | null; // name_doc dari BSrE
}): string {
  const signatureId = metadata.signature_id || generateSignatureId();
  return JSON.stringify({
    type: metadata.type,
    signature_id: signatureId,
    doc_id: metadata.doc_id || null,
    signed_at: metadata.signed_at || new Date().toISOString(),
    signer_nik: metadata.signer_nik || null,
    signer_id: metadata.signer_id || null,
    signer_name: metadata.signer_name || null,
    signer_jabatan: metadata.signer_jabatan || null,
    path: metadata.path || null,
    verification_url: metadata.verification_url || null,
    bsre_name_doc: metadata.bsre_name_doc || null, // Simpan name_doc untuk verifikasi
  });
}

/**
 * Check apakah dokumen sudah ditandatangani dengan digsig
 */
export function isSignedWithDigsig(tandaTangan: string | null): boolean {
  const metadata = parseSignatureData(tandaTangan);
  return metadata?.type === 'digsig';
}

/**
 * Check apakah dokumen sudah ditandatangani (dengan metode apapun)
 */
export function isSigned(tandaTangan: string | null): boolean {
  const metadata = parseSignatureData(tandaTangan);
  return (
    metadata?.type === 'digsig' ||
    metadata?.type === 'passphrase' ||
    metadata?.type === 'internal'
  );
}
