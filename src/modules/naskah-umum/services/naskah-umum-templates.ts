import { TemplateSchema } from '../dto/naskah-umum.dto';

export const NASKAH_UMUM_TEMPLATES: Record<string, TemplateSchema> = {
  UND: {
    jenis: 'UND',
    templateS3Key: 'templates/naskah-umum/UND.docx',
    placeholders: ['perihal', 'dari', 'tujuan', 'tglsurat', 'namapengirim', 'nomor'],
    fields: [
      { name: 'perihal', label: 'Perihal', type: 'text', required: true, placeholder: 'Undangan Rapat...' },
      { name: 'dari', label: 'Dari (Unit Pengirim)', type: 'text', required: true },
      { name: 'tujuan', label: 'Tujuan', type: 'textarea', required: true, placeholder: 'Satu per baris' },
      { name: 'tglsurat', label: 'Tanggal Surat', type: 'date', required: true },
      { name: 'namapengirim', label: 'Nama Pengirim', type: 'text', required: true },
      { name: 'klasifikasi', label: 'Klasifikasi', type: 'text', required: false },
      { name: 'sifat', label: 'Sifat', type: 'select', required: false, options: ['biasa', 'rahasia', 'terbatas', 'sangat_rahasia', 'terbuka'] },
    ],
  },
};
