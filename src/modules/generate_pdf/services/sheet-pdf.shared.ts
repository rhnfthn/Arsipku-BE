export interface DirectorSlot {
  index: number;       // 1-based
  nama: string;        // dari getBodDirectors(company)
  jabatan: string;
  qrBase64: string;    // QR paraf PNG (base64) — built for every director
}

export interface SheetPdfData {
  tanggal?: string;            // YYYY-MM-DD
  nomor?: string;
  diusulkanOleh?: string;
  jabatanDiusulkan?: string;
  perihal?: string;
  referensiDari?: string;
  referensiNomor?: string;
  referensiTanggal?: string;
  klasifikasi?: string;        // default "Penting"
  lampiran?: string;           // default "1 (satu) berkas"
  // blanko only:
  legalDrafter?: string;
  legalDrafterJabatan?: string;
  legalChecker?: string;
  legalCheckerJabatan?: string;
  bodyHtml?: string;           // "Isi" blanko — rendered only by blanko template
  catatan?: string;
  directors: DirectorSlot[];      // daftar BOD (orchestrator bangun, sudah berisi qrBase64)
  verifiedIndices: Set<number>;   // slot yang sudah paraf → QR di-render
}

/** Format YYYY-MM-DD → "21 Agustus 2026" (Indonesia). Kosong untuk input invalid. */
export function formatTanggal(tanggal?: string): string {
  if (!tanggal) return '';
  const d = new Date(tanggal + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * CSS shared LPD & blanko — union rule dipakai dua template (rule tidak dipakai
 * tidak membahayakan). Disediakan sekali agar dua service tidak duplikat 140 baris CSS.
 * Ported dari docs/lembar_persetujuan_direksi.html + docs/blanko_verbal.html,
 * tanpa chrome on-screen (page shadow, print-btn, contenteditable, :focus).
 */
export const SHEET_CSS = `
@page { size: A4; margin: 15mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; font-size: 13px; color: #000; margin: 0; padding: 0; background: #fff; }
.page { width: auto; min-height: auto; margin: 0; padding: 0; background: #fff; }
.header { text-align: center; font-weight: bold; text-transform: uppercase; line-height: 1.4; margin-bottom: 14px; font-size: 13px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.top { margin-bottom: 22px; }
td, th { border: 1px solid #000; padding: 4px 7px; vertical-align: top; font-size: 13px; }
.colon { width: 14px; text-align: center; padding-left: 2px; padding-right: 2px; }
.small-italic { font-size: 11px; line-height: 1.3; }
.center-text { text-align: center; }
.signature-block { text-align: center; padding: 6px 4px 4px 4px; }
.signature-name { text-decoration: underline; display: inline-block; margin-top: 55px; }
.director-item { margin-bottom: 4px; }
.director-divider { border-bottom: 1px solid #000; margin: 0 -7px 6px; padding: 0 7px 6px; }
.director-name { text-decoration: underline; display: block; }
.paraf-qr { width: 50px; height: 50px; display: block; margin: 2px 0; }
.sig-space { height: 45px; }
.tall { height: 90px; }
.catatan-cell { height: 60px; }
.footer-note { font-size: 12px; line-height: 1.35; }
.body-content { margin: 16px 0; text-align: justify; line-height: 1.5; }
.field { min-height: 16px; }
`;
