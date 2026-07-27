import 'reflect-metadata';
import {
  buildPrompt,
  buildKajianPrompt,
  buildDisposisiPrompt,
  buildNotaDinasPrompt,
  buildSdiPrompt,
  buildSdePrompt,
  SYSTEM_PROMPT,
  buildCommonRules,
  buildFewShot,
  buildFinalPrompt,
  buildOutputRules,
  buildStyleGuide,
  buildValidationRules,
} from './prompt.builder';
import { NaskahTypeEnum } from '../dto/generate-draft.dto';

describe('prompt.builder', () => {
  it('system prompt enforces JSON output and no fabrication', () => {
    expect(SYSTEM_PROMPT).toContain('JSON');
    expect(SYSTEM_PROMPT).toContain('content');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('tidak boleh mengarang');
    expect(SYSTEM_PROMPT).toContain('[ISI DATA]');
    expect(SYSTEM_PROMPT).toContain('Tidak boleh ada key lain');
    expect(SYSTEM_PROMPT).toContain('Jangan gunakan escape characters');
    expect(SYSTEM_PROMPT).toContain('Jangan menghasilkan HTML');
    expect(SYSTEM_PROMPT).toContain('bukan kop');
  });

  it('builds modular prompt sections from V2 spec', () => {
    expect(buildCommonRules()).toContain('AI hanya boleh');
    expect(buildStyleGuide()).toContain('15 sampai 25 kata');
    expect(buildValidationRules()).toContain('Quality checklist internal');
    expect(buildOutputRules()).toContain('Kontrak output');
    expect(buildOutputRules()).toContain('"content": ["", "", ""]');
    expect(buildOutputRules()).toContain('array string');
  });

  it('final prompt includes system, type instruction, few shot, and user input', () => {
    const p = buildFinalPrompt(NaskahTypeEnum.KAJIAN, {
      brief: 'mengkaji kebutuhan peningkatan kapasitas ruang server',
    });
    expect(p).toContain('Prompt khusus KAJIAN');
    expect(p).toContain('Contoh gaya KAJIAN');
    expect(p).toContain('Data dari frontend');
    expect(p).toContain(
      'mengkaji kebutuhan peningkatan kapasitas ruang server',
    );
    expect(p).toContain('"content"');
    expect(p).not.toContain('"isi_html"');
  });

  it('kajian prompt includes brief and [ISI DATA] placeholder for empty fields', () => {
    const p = buildKajianPrompt({
      brief: 'analisis kebutuhan ruang server baru',
    });
    expect(p).toContain('analisis kebutuhan ruang server baru');
    expect(p).toContain('[ISI DATA]');
    expect(p).toContain('kajian');
    expect(p).toContain('Permasalahan');
    expect(p).toContain('Rekomendasi');
  });

  it('kajian prompt includes provided fields', () => {
    const p = buildKajianPrompt({
      brief: 'analisis x',
      fields: {
        tujuan: 'mengetahui kelayakan',
        perihal: 'kajian ruang server',
      },
    });
    expect(p).toContain('mengetahui kelayakan');
    expect(p).toContain('kajian ruang server');
  });

  it('disposisi prompt includes reference content (surat masuk)', () => {
    const p = buildDisposisiPrompt({
      brief: 'instruksikan tindak lanjut ke tim teknis',
      referenceContent:
        'surat masuk: undangan rapat koordinasi tanggal 10 Juli',
    });
    expect(p).toContain('instruksikan tindak lanjut ke tim teknis');
    expect(p).toContain('undangan rapat koordinasi');
  });

  it('disposisi prompt forbids fabricating missing surat masuk context', () => {
    const p = buildDisposisiPrompt({ brief: 'mohon tindak lanjut' });
    expect(p).toContain('Tidak ada isi surat masuk yang diberikan');
    expect(p).toContain('[ISI DATA]');
  });

  it('few shot examples are type-specific and marked as not copied', () => {
    const kajian = buildFewShot(NaskahTypeEnum.KAJIAN);
    const disposisi = buildFewShot(NaskahTypeEnum.DISPOSISI);
    expect(kajian).toContain('jangan disalin');
    expect(disposisi).toContain('jangan disalin');
    expect(kajian).not.toEqual(disposisi);
  });

  it('buildPrompt dispatches by naskahType', () => {
    const k = buildPrompt(NaskahTypeEnum.KAJIAN, { brief: 'sama' });
    const d = buildPrompt(NaskahTypeEnum.DISPOSISI, { brief: 'sama' });
    expect(k).not.toEqual(d);
  });
});

describe('prompt.builder ND/SDI/SDE', () => {
  it('Nota Dinas prompt includes brief + [ISI DATA]', () => {
    const p = buildNotaDinasPrompt({
      brief: 'meminta persetujuan pengadaan AC',
    });
    expect(p).toContain('meminta persetujuan pengadaan AC');
    expect(p).toContain('[ISI DATA]');
    expect(p.toLowerCase()).toContain('nota dinas');
    expect(p).toContain('Demikian disampaikan');
  });

  it('ND/SDI/SDE prompts use official numbered list isi_html', () => {
    const prompts = [
      buildNotaDinasPrompt({ brief: 'membuat nota dinas' }),
      buildSdiPrompt({ brief: 'membuat surat dinas internal' }),
      buildSdePrompt({ brief: 'membuat surat dinas eksternal' }),
    ];

    for (const p of prompts) {
      expect(p).toContain('Buatkan konsep surat baru');
      expect(p).toContain('"perihal": "..."');
      expect(p).toContain(
        '"isi_html": "<ol style=\'text-align: justify;\'>...</ol>"',
      );
      expect(p).toContain('Gunakan tag <ol> dan <li>');
      expect(p).not.toContain('"content"');
      expect(p).not.toContain('Kontrak output');
    }
  });

  it('ND/SDI/SDE prompts forbid fabricated participant identity data', () => {
    const prompts = [
      buildNotaDinasPrompt({ brief: 'buat daftar hadir peserta' }),
      buildSdiPrompt({ brief: 'buat daftar hadir peserta' }),
      buildSdePrompt({ brief: 'buat daftar hadir peserta' }),
    ];

    for (const p of prompts) {
      expect(p).toContain('Jangan membuat nama orang, NIK, jabatan');
      expect(p).toContain('jangan mengubah "NIK" menjadi "Enik"');
      expect(p).toContain('salin persis sesuai data user');
    }
  });

  it('SDI prompt marks internal surat', () => {
    const p = buildSdiPrompt({ brief: 'undangan rapat internal unit' });
    expect(p).toContain('undangan rapat internal unit');
    expect(p.toLowerCase()).toContain('internal');
  });

  it('SDE prompt marks external surat', () => {
    const p = buildSdePrompt({
      brief: 'permohonan data ke instansi eksternal',
    });
    expect(p).toContain('permohonan data ke instansi eksternal');
    expect(p.toLowerCase()).toContain('eksternal');
  });

  it('buildPrompt dispatches ND/SDI/SDE distinctly', () => {
    const nd = buildPrompt(NaskahTypeEnum.ND, { brief: 'sama' });
    const sdi = buildPrompt(NaskahTypeEnum.SDI, { brief: 'sama' });
    const sde = buildPrompt(NaskahTypeEnum.SDE, { brief: 'sama' });
    expect(nd).not.toEqual(sdi);
    expect(sdi).not.toEqual(sde);
  });
});
