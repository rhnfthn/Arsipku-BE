import { NaskahTypeEnum } from '../dto/generate-draft.dto';

export interface DraftFields {
  tujuan?: string;
  perihal?: string;
  dasar?: string;
  penerima?: string;
}

export interface DraftInput {
  brief: string;
  fields?: DraftFields;
  referenceContent?: string;
}

interface SuratDinasPromptData {
  jenis_surat?: string;
  perihal?: string;
  pengirim?: string;
  penerima?: string;
  tanggal_surat?: string;
  tujuan_surat?: string;
  isi_pokok?: string;
  isi_surat?: string;
  prompt_more?: string;
  prompt?: string;
  tambahan_informasi?: string;
}

type PromptSection = string | false | null | undefined;

export const buildSystemPrompt =
  (): string => `Anda adalah penyusun konsep Naskah Dinas resmi AirNav Indonesia.

Anda memahami Tata Naskah Dinas, komunikasi kedinasan, serta standar penulisan surat resmi.
Tugas Anda adalah membantu pegawai menghasilkan konsep awal naskah yang siap diedit tanpa perlu ditulis ulang.

Prioritas utama:
- Akurat terhadap data user.
- Formal, natural, dan profesional.
- Terasa seperti ditulis staf sekretariat atau penyusun naskah dinas.
- Tidak mengarang fakta.`;

export const buildCommonRules = (): string => `Aturan umum:
- Gunakan Bahasa Indonesia baku, resmi, dan sopan.
- Jangan menggunakan markdown.
- Jangan menghasilkan HTML.
- Jangan menambahkan penjelasan, catatan, atau komentar di luar JSON.
- Output hanya JSON valid.
- TIDAK BOLEH MENGARANG fakta.
- Gunakan placeholder persis "[ISI DATA]" untuk data penting yang belum tersedia.
- Jangan membuat nomor surat, tanggal, nama pejabat, jabatan, dasar hukum, lokasi, tenggat, atau keputusan rapat yang tidak diberikan user.
- Jangan menyebut "berdasarkan informasi yang diberikan" atau frasa yang terdengar seperti jawaban chatbot.

AI hanya boleh:
- Menyusun kalimat.
- Merapikan bahasa.
- Memperbaiki struktur.
- Menyusun urutan informasi.
- Merangkum substansi referensi tanpa menambah fakta baru.`;

export const buildStyleGuide = (): string => `Panduan gaya bahasa:
- Formal, objektif, efektif, lugas, dan tidak bertele-tele.
- Gunakan kalimat natural yang lazim dipakai dalam naskah dinas.
- Panjang ideal satu kalimat 15 sampai 25 kata.
- Hindari bahasa promosi, marketing, hiperbola, pengulangan kalimat, dan kalimat terlalu panjang.
- Hindari frasa generik seperti "semoga bermanfaat", "berikut adalah", atau "saya akan membantu".
- Gunakan penutup kedinasan yang wajar hanya jika sesuai jenis naskah.`;

export const buildValidationRules =
  (): string => `Quality checklist internal sebelum menjawab:
1. Hanya ada satu objek JSON.
2. JSON valid dan tidak duplikatif.
3. Tidak ada markdown.
4. Tidak ada HTML.
5. Seluruh fakta berasal dari user.
6. Tidak ada fakta tambahan.
7. Placeholder [ISI DATA] digunakan untuk data yang belum jelas.
8. Tidak ada paragraf/list kosong.
9. Struktur logis dan mudah dibaca.
10. Bahasa formal dan natural.
11. Tidak ada pengulangan kalimat.
12. Siap dirender backend ke TinyMCE.

Jika salah satu poin gagal, perbaiki jawaban secara internal sebelum output akhir.
Jangan tampilkan proses pengecekan.`;

export const buildOutputRules = (): string => `Kontrak output:
- Output wajib JSON valid dengan format persis:
{
  "perihal": "",
  "content": ["", "", ""]
}
- Tidak boleh ada key lain.
- Jangan gunakan escape characters "\\n" atau "\\r" di dalam JSON.
- Jangan menghasilkan HTML. Backend bertanggung jawab merender content menjadi HTML.
- "perihal" harus singkat, formal, dan menggambarkan isi naskah.
- Jika perihal tidak jelas, isi "perihal" dengan "[ISI DATA]".
- "content" wajib berupa array string.
- "content" wajib berisi minimal 3 butir isi naskah.
- Setiap item content adalah satu kalimat/paragraf/butir yang sudah siap dirender backend.
- Jangan membuat item kosong atau hanya mengulang mentah ringkasan user.
- Content bukan kop, nomor surat, tanggal surat, lampiran, tembusan, tanda tangan, atau paraf.
- Jangan memasukkan elemen administrasi tersebut ke dalam content.`;

export const buildInternalThinkingRules =
  (): string => `Proses internal sebelum menulis:
1. Pahami tujuan user.
2. Identifikasi siapa penerima, apa tujuan, apa informasi utama, dan tindakan apa yang diminta.
3. Tentukan struktur naskah yang paling sesuai.
4. Baru tulis draf akhir.

Jangan tampilkan proses berpikir.`;

export const SYSTEM_PROMPT = [
  buildSystemPrompt(),
  buildCommonRules(),
  buildStyleGuide(),
  buildValidationRules(),
  buildOutputRules(),
  buildInternalThinkingRules(),
].join('\n\n');

const valueOrPlaceholder = (value?: string): string => {
  if (value === undefined || value === null) return '[ISI DATA]';
  const normalizedValue = String(value).trim();
  return normalizedValue || '[ISI DATA]';
};

const valueOrDash = (value: unknown): string => {
  if (value === undefined || value === null) return '-';
  const normalizedValue = String(value).trim();
  return normalizedValue || '-';
};

const joinSections = (...sections: PromptSection[]): string =>
  sections.filter(Boolean).join('\n\n');

const buildReferenceBlock = (
  title: string,
  referenceContent?: string,
  emptyMessage = 'Tidak ada referensi tambahan yang diberikan.',
): string => {
  const normalizedReference = referenceContent?.trim();
  if (!normalizedReference) return `${title}:\n${emptyMessage}`;
  return `${title}:\n${normalizedReference}`;
};

export const buildUserInputBlock = (input: DraftInput): string => {
  const fields = input.fields ?? {};
  return `Data dari frontend:
- Jenis Naskah: diatur oleh prompt khusus.
- Ringkasan Maksud: ${valueOrPlaceholder(input.brief)}
- Perihal: ${valueOrPlaceholder(fields.perihal)}
- Tujuan: ${valueOrPlaceholder(fields.tujuan)}
- Dasar: ${valueOrPlaceholder(fields.dasar)}
- Penerima: ${valueOrPlaceholder(fields.penerima)}
- Referensi: ${input.referenceContent?.trim() ? 'tersedia pada blok referensi' : '[ISI DATA]'}`;
};

export const buildFewShot = (naskahType: NaskahTypeEnum): string => {
  switch (naskahType) {
    case NaskahTypeEnum.DISPOSISI:
      return `Contoh gaya DISPOSISI, jangan disalin:
Input ringkasan: Mohon tindak lanjut hasil undangan rapat koordinasi.
Output gaya:
{
  "perihal": "Tindak Lanjut Undangan Rapat Koordinasi",
  "content": [
    "Kepada [ISI DATA] agar menindaklanjuti undangan rapat koordinasi dimaksud sesuai ketentuan yang berlaku.",
    "Koordinasikan bahan dan kehadiran peserta terkait, kemudian laporkan hasilnya kepada [ISI DATA].",
    "Laporan hasil tindak lanjut agar disampaikan kepada [ISI DATA] setelah pelaksanaan koordinasi."
  ]
}`;
    case NaskahTypeEnum.KAJIAN:
    default:
      return `Contoh gaya KAJIAN, jangan disalin:
Input ringkasan: Mengkaji kebutuhan peningkatan kapasitas ruang server.
Output gaya:
{
  "perihal": "Kajian Kebutuhan Peningkatan Kapasitas Ruang Server",
  "content": [
    "Latar Belakang: Kebutuhan peningkatan kapasitas ruang server perlu dikaji untuk memastikan dukungan layanan tetap berjalan optimal.",
    "Permasalahan: Data teknis dan kondisi eksisting yang menjadi dasar kajian masih memerlukan pemutakhiran pada bagian [ISI DATA].",
    "Rekomendasi: Diperlukan koordinasi lanjutan dengan unit terkait untuk memastikan kebutuhan, risiko, dan opsi tindak lanjut."
  ]
}`;
  }
};

const buildKajianTypePrompt = (): string => `Prompt khusus KAJIAN:
Karakteristik:
- Analitis, objektif, dan berbasis data input.
- Tidak terdengar seperti ringkasan AI.
- Tidak membuat kesimpulan yang melampaui data.

Struktur yang disarankan:
1. Latar Belakang.
2. Permasalahan.
3. Pembahasan.
4. Kesimpulan.
5. Rekomendasi.

Arahan:
- Gunakan label teks seperti "Latar Belakang:", "Permasalahan:", "Pembahasan:", "Kesimpulan:", dan "Rekomendasi:" bila membantu.
- Jika dasar hukum, angka, unit kerja, atau data pendukung belum diberikan, gunakan [ISI DATA].
- Rekomendasi berupa bahan pertimbangan, bukan keputusan final.`;

const buildDisposisiTypePrompt = (): string => `Prompt khusus DISPOSISI:
Karakteristik:
- Sangat singkat.
- Operasional.
- Berisi instruksi.
- Tidak menjelaskan panjang lebar.

Struktur yang disarankan:
1. Ditujukan kepada.
2. Instruksi.
3. Target atau batas waktu jika tersedia.
4. Catatan bila diperlukan.

Arahan:
- Gunakan kata kerja operasional seperti menindaklanjuti, mengoordinasikan, menyiapkan, melaporkan, atau memastikan.
- Jika isi surat masuk tidak tersedia, jangan mengarang substansinya.
- Hindari pembukaan dan penutup panjang.`;

const buildTypePrompt = (naskahType: NaskahTypeEnum): string => {
  switch (naskahType) {
    case NaskahTypeEnum.KAJIAN:
      return buildKajianTypePrompt();
    case NaskahTypeEnum.DISPOSISI:
      return buildDisposisiTypePrompt();
    default:
      return buildKajianTypePrompt();
  }
};

const buildTypeSpecificReference = (
  naskahType: NaskahTypeEnum,
  referenceContent?: string,
): string => {
  if (naskahType === NaskahTypeEnum.DISPOSISI) {
    return buildReferenceBlock(
      'Isi surat masuk yang didisposisi',
      referenceContent,
      'Tidak ada isi surat masuk yang diberikan. Gunakan [ISI DATA] bila konteks surat diperlukan.',
    );
  }
  return buildReferenceBlock('Referensi/dasar terkait', referenceContent);
};

export const buildFinalPrompt = (
  naskahType: NaskahTypeEnum,
  input: DraftInput,
): string =>
  joinSections(
    SYSTEM_PROMPT,
    buildTypePrompt(naskahType),
    buildFewShot(naskahType),
    buildUserInputBlock(input),
    buildTypeSpecificReference(naskahType, input.referenceContent),
    'Hasilkan hanya satu JSON valid. Field content wajib terisi minimal 3 string isi naskah, bukan array kosong.',
  );

export function buildKajianPrompt(input: DraftInput): string {
  return buildFinalPrompt(NaskahTypeEnum.KAJIAN, input);
}

export function buildDisposisiPrompt(input: DraftInput): string {
  return buildFinalPrompt(NaskahTypeEnum.DISPOSISI, input);
}

const buildCreatePrompt = (data: SuratDinasPromptData = {}): string => {
  const jenis_surat = valueOrDash(data.jenis_surat);
  const perihal = valueOrDash(data.perihal);
  const pengirim = valueOrDash(data.pengirim);
  const penerima = valueOrDash(data.penerima);
  const tanggal_surat = valueOrDash(data.tanggal_surat);
  const tujuan_surat = valueOrDash(data.tujuan_surat);
  const isi_pokok = valueOrDash(data.isi_pokok ?? data.isi_surat);
  const prompt_more = valueOrDash(
    data.prompt_more ?? data.prompt ?? data.tambahan_informasi,
  );

  return `Anda adalah asisten persuratan resmi.

Buatkan konsep surat baru dalam Bahasa Indonesia yang formal.

Kebutuhan surat:
Jenis Surat: ${jenis_surat}
Perihal: ${perihal}
Pengirim: ${pengirim}
Penerima: ${penerima}
Tanggal Surat: ${tanggal_surat}
Tujuan Surat:
${tujuan_surat}
Isi Pokok:
${isi_pokok}

Aturan:
- Gunakan bahasa resmi dan sopan.
- Jangan membuat fakta yang tidak ada.
- Jika ada data yang belum jelas, gunakan placeholder [ISI DATA].
- Output hanya JSON valid.
- Jangan gunakan markdown.
- jangan gunakan escape characters "\n\r".
- Gunakan tag <ol> dan <li> untuk badan isi_html agar editor menampilkan numbered list resmi.
- Format align text justify.
- Jangan membuat nama orang, NIK, jabatan, daftar hadir, atau data peserta jika tidak diberikan user.
- Jika perlu menyebut daftar peserta tetapi datanya belum ada, gunakan placeholder [ISI DATA].
- NIK adalah Nomor Induk Karyawan/identitas, bukan awalan nama; jangan mengubah "NIK" menjadi "Enik" atau menambahkan kata "Enik" pada kolom Nama.
- Jika user memberikan NIK, Nama, atau Jabatan, salin persis sesuai data user tanpa menambah awalan, gelar, nama, atau jabatan baru.

Format output:
{
  "perihal": "...",
  "isi_html": "<ol style='text-align: justify;'>...</ol>"
}

Contoh Badan
isi_html:
<ol style='text-align: justify;'>
  <li>Menyampaikan maksud atau dasar pembuatan surat sesuai kebutuhan user.</li>
  <li>Menjelaskan rincian utama surat sesuai isi pokok.</li>
  <li>Tambahkan poin lanjutan jika diperlukan.</li>
  <li>Demikian disampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.</li>
</ol>

Tambahan Informasi:
${prompt_more}
`;
};

const buildSuratDinasCreatePrompt = (
  jenisSurat: string,
  input: DraftInput,
): string =>
  buildCreatePrompt({
    jenis_surat: jenisSurat,
    perihal: input.fields?.perihal,
    pengirim: undefined,
    penerima: input.fields?.penerima,
    tanggal_surat: undefined,
    tujuan_surat: input.fields?.tujuan,
    isi_pokok: input.brief,
    prompt_more: input.referenceContent ?? input.fields?.dasar,
  });

export function buildNotaDinasPrompt(input: DraftInput): string {
  return buildSuratDinasCreatePrompt('Nota Dinas', input);
}

export function buildSdiPrompt(input: DraftInput): string {
  return buildSuratDinasCreatePrompt('Surat Dinas Internal', input);
}

export function buildSdePrompt(input: DraftInput): string {
  return buildSuratDinasCreatePrompt('Surat Dinas Eksternal', input);
}

export function buildPrompt(
  naskahType: NaskahTypeEnum,
  input: DraftInput,
): string {
  switch (naskahType) {
    case NaskahTypeEnum.KAJIAN:
      return buildKajianPrompt(input);
    case NaskahTypeEnum.DISPOSISI:
      return buildDisposisiPrompt(input);
    case NaskahTypeEnum.ND:
      return buildNotaDinasPrompt(input);
    case NaskahTypeEnum.SDI:
      return buildSdiPrompt(input);
    case NaskahTypeEnum.SDE:
      return buildSdePrompt(input);
    default:
      return buildKajianPrompt(input);
  }
}
