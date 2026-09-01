export interface DirectorSlot {
  index: number; // 1-based
  positionId?: string;
  nama: string; // dari getBodDirectors(company)
  jabatan: string;
  qrBase64?: string; // legacy compatibility; sheet approval sekarang render visible digsig
  signatureVisible?: boolean;
}

export interface SheetDirectorSlot {
  index: number;
  positionId?: string;
  nama: string;
  jabatan: string;
  signatureVisible?: boolean;
}

export interface SheetPdfData {
  tanggal?: string; // YYYY-MM-DD
  nomor?: string;
  diusulkanOleh?: string;
  jabatanDiusulkan?: string;
  perihal?: string;
  referensiDari?: string;
  referensiNomor?: string;
  referensiTanggal?: string;
  klasifikasi?: string; // default "Penting"
  lampiran?: string; // default "1 (satu) berkas"
  // blanko only:
  legalDrafter?: string;
  legalDrafterJabatan?: string;
  legalChecker?: string;
  legalCheckerJabatan?: string;
  bodyHtml?: string; // "Isi" blanko — rendered only by blanko template
  catatan?: string;
  directors: DirectorSlot[]; // daftar BOD untuk slot tanda tangan/paraf sheet
  ditetapkanOleh?: SheetDirectorSlot[];
  diketahuiOleh?: DirectorSlot[];
  verifiedIndices: Set<number>; // slot yang sudah paraf → QR di-render
}

/** Format YYYY-MM-DD → "21 Agustus 2026" (Indonesia). Kosong untuk input invalid. */
export function formatTanggal(tanggal?: string): string {
  if (!tanggal) return '';
  const d = new Date(tanggal + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
.signature-person { margin-bottom: 12px; }
.signature-name { text-decoration: underline; display: inline-block; margin-top: 55px; }
.director-item { margin-bottom: 4px; }
.director-divider { border-bottom: 1px solid #000; margin: 0 -7px 6px; padding: 0 7px 6px; }
.director-name { text-decoration: underline; display: block; }
/* ponytail: visualisasi digsig diperkecil ~45% (skala 0.55) agar tidak menimpa
   digsig signer/paraf lain di lembar blanko-verbal & persetujuan-direksi. */
.visible-digsig { width: 100%; max-width: 143px; min-height: 29px; border: 1.5px solid #1f2937; display: flex; align-items: center; gap: 4px; padding: 3px 4px; margin: 3px 0 2px; background: #fff; break-inside: avoid; }
.visible-digsig.wide { max-width: 176px; min-height: 32px; margin-left: auto; margin-right: auto; }
.visible-digsig-logo { width: 23px; height: 23px; object-fit: contain; flex: 0 0 auto; }
.visible-digsig-text { min-width: 0; flex: 1 1 auto; text-align: left; font-family: "Times New Roman", Times, serif; line-height: 1.12; color: #000; }
.visible-digsig-title { font-size: 4.5px; font-weight: 400; margin-bottom: 1px; }
.visible-digsig-jabatan { font-size: 5px; font-weight: 700; margin-bottom: 4px; }
.visible-digsig-nama { font-size: 6.5px; font-weight: 700; white-space: normal; word-break: break-word; }
.visible-digsig.wide .visible-digsig-title { font-size: 5px; }
.visible-digsig.wide .visible-digsig-jabatan { font-size: 5.5px; margin-bottom: 4px; }
.visible-digsig.wide .visible-digsig-nama { font-size: 7px; }
.sig-space { height: 45px; }
.tall { height: 90px; }
.catatan-cell { height: 60px; }
.footer-note { font-size: 12px; line-height: 1.35; }
.body-content { margin: 16px 0; text-align: justify; line-height: 1.5; }
.field { min-height: 16px; }
`;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderVisibleDigsig(
  signer: { nama?: string; jabatan?: string },
  variant: 'compact' | 'wide' = 'compact',
): string {
  const nama = escapeHtml(
    (signer.nama || 'NAMA LENGKAP TANPA GELAR').toUpperCase(),
  );
  const jabatan = escapeHtml(signer.jabatan || 'DIREKTUR');
  const logo = visibleDigsigLogoDataUrl();
  const logoHtml = logo
    ? `<img class="visible-digsig-logo" src="${logo}" alt="AirNav" />`
    : '<div class="visible-digsig-logo"></div>';
  return `<div class="visible-digsig ${variant === 'wide' ? 'wide' : ''}">
    ${logoHtml}
    <div class="visible-digsig-text">
      <div class="visible-digsig-title">Ditandatangani secara elektronik oleh</div>
      <div class="visible-digsig-jabatan">${jabatan}</div>
      <div class="visible-digsig-nama">${nama}</div>
    </div>
  </div>`;
}

let cachedVisibleDigsigLogo: string | null | undefined;

/** Memuat logo yang sama dengan Visualisasi Digsig di frontend sebagai data URL
 * agar Puppeteer tidak perlu mengakses URL/file eksternal ketika membuat PDF. */
function visibleDigsigLogoDataUrl(): string | null {
  // ponytail: hanya HIT yang di-cache. Miss tidak di-cache agar logo yang baru
  // tersedia (file ditambahkan / cwd deploy berbeda) tetap terbaca tanpa restart.
  if (cachedVisibleDigsigLogo !== undefined) return cachedVisibleDigsigLogo;
  const candidates = [
    process.env.VISUAL_DIGSIG_LOGO_PATH,
    path.resolve(process.cwd(), '../fe/public/logoAirnav.png'),
    path.resolve(process.cwd(), 'public/logoAirnav.png'),
  ].filter((candidate): candidate is string => !!candidate);
  const logoPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!logoPath) return null;
  cachedVisibleDigsigLogo = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  return cachedVisibleDigsigLogo;
}
import fs from 'fs';
import path from 'path';
