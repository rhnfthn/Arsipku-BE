import { AiService } from './ai.service';
import { NaskahTypeEnum, GenerateDraftDto } from '../dto/generate-draft.dto';

describe('AiService.generateDraft', () => {
  let ollama: any;
  let log: any;
  let config: any;
  let service: AiService;

  beforeEach(() => {
    ollama = { generate: jest.fn() };
    log = { log: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: (k: string) => (k === 'AI_OLLAMA_MODEL' ? 'qwen3:4b' : undefined),
    };
    const userAiConfig = { getApiKey: jest.fn().mockResolvedValue(null) };
    service = new AiService(ollama, log, config, userAiConfig as any);
  });

  it('parses structured JSON content into DraftResult HTML and logs success', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'Kajian Ruang Server',
        content: [
          { type: 'paragraph', text: 'Pembuka resmi.' },
          { type: 'list', items: ['Butir pertama.', 'Butir kedua.'] },
        ],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.KAJIAN,
      brief: 'analisis ruang server',
    };
    const res = await service.generateDraft(dto, 123);
    expect(res).toEqual({
      draftHtml:
        '<p>Pembuka resmi.</p><ol><li>Butir pertama.</li><li>Butir kedua.</li></ol>',
      draftPerihal: 'Kajian Ruang Server',
      raw: false,
    });
    expect(log.log).toHaveBeenCalledWith(
      expect.objectContaining({ persnum: 123, status_code: 200 }),
    );
  });

  it('renders simple content string arrays as paragraphs', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'Penyampaian Hasil Evaluasi',
        content: [
          'Menindaklanjuti hasil evaluasi implementasi Sistem Manajemen Dokumen Elektronik Semester I Tahun 2025, bersama ini disampaikan beberapa hal untuk menjadi perhatian.',
          'Seluruh unit kerja diminta menindaklanjuti hasil evaluasi, melengkapi metadata dokumen, dan mempercepat proses unggah arsip sesuai ketentuan.',
          'Laporan progres tindak lanjut agar disampaikan paling lambat 14 hari kerja sejak nota dinas ini diterima.',
        ],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.ND,
      brief: 'evaluasi implementasi sistem',
    };
    const res = await service.generateDraft(dto, 123);
    expect(res.draftHtml).toContain('<p>Menindaklanjuti hasil evaluasi');
    expect(res.draftPerihal).toBe('Penyampaian Hasil Evaluasi');
  });

  it('converts content array to HTML paragraphs', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'Kajian Ruang Server',
        content: ['Latar Belakang: ...', 'Kesimpulan: ...'],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.KAJIAN,
      brief: 'analisis x',
    };
    const res = await service.generateDraft(dto, 1);
    expect(res.raw).toBe(false);
    expect(res.draftPerihal).toBe('Kajian Ruang Server');
    expect(res.draftHtml).toBe(
      '<p>Latar Belakang: ...</p>\n<p>Kesimpulan: ...</p>',
    );
  });

  it('escapes structured content before rendering HTML', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'P',
        content: [
          {
            type: 'paragraph',
            text: 'Gunakan <script>alert("x")</script> & lanjut.',
          },
        ],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.ND,
      brief: 'buat aman',
    };
    const res = await service.generateDraft(dto, 123);
    expect(res.draftHtml).toBe(
      '<p>Gunakan &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; lanjut.</p>',
    );
  });

  it('keeps backward compatibility for legacy isi_html JSON', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'Kajian Ruang Server',
        isi_html: '<p>halo</p>',
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.KAJIAN,
      brief: 'analisis ruang server',
    };
    const res = await service.generateDraft(dto, 123);
    expect(res).toEqual({
      draftHtml: '<p>halo</p>',
      draftPerihal: 'Kajian Ruang Server',
      raw: false,
    });
  });

  it('extracts the first JSON object when provider adds text outside JSON', async () => {
    ollama.generate.mockResolvedValue(
      'hasil:\n' +
        JSON.stringify({
          perihal: 'P',
          content: [{ type: 'list', items: ['Satu.', 'Dua.'] }],
        }) +
        '\nselesai',
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.DISPOSISI,
      brief: 'instruksi tindak lanjut',
    };
    const res = await service.generateDraft(dto, 1);
    expect(res.raw).toBe(false);
    expect(res.draftHtml).toBe('<ol><li>Satu.</li><li>Dua.</li></ol>');
  });

  it('throws 502 when provider returns JSON without draft content', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: '',
        content: [],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.ND,
      brief: 'meminta persetujuan pengadaan perangkat jaringan',
      fields: {
        perihal: 'Permohonan Persetujuan Pengadaan Perangkat Jaringan',
      },
    };
    await expect(service.generateDraft(dto, 1)).rejects.toMatchObject({
      message: expect.stringContaining('AI'),
    });
    expect(log.log).toHaveBeenCalledWith(
      expect.objectContaining({
        status_code: 502,
        error_message: expect.stringContaining('AI response tidak berisi draf'),
      }),
    );
  });

  it('accepts common provider variations for perihal and content', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        judul: 'Instruksi Tindak Lanjut',
        content: [
          'Mohon ditindaklanjuti sesuai ketentuan.',
          {
            items: ['Koordinasikan dengan unit terkait.', 'Laporkan hasilnya.'],
          },
        ],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.DISPOSISI,
      brief: 'instruksi tindak lanjut',
    };
    const res = await service.generateDraft(dto, 1);
    expect(res.draftPerihal).toBe('Instruksi Tindak Lanjut');
    expect(res.draftHtml).toBe(
      '<p>Mohon ditindaklanjuti sesuai ketentuan.</p><ol><li>Koordinasikan dengan unit terkait.</li><li>Laporkan hasilnya.</li></ol>',
    );
  });

  it('recovers body text from unusual nested provider content', async () => {
    ollama.generate.mockResolvedValue(
      JSON.stringify({
        perihal: 'Penyampaian Hasil Evaluasi',
        content: [
          {
            type: 'section',
            paragraphs: [
              'Bersama ini disampaikan hasil evaluasi implementasi sistem.',
            ],
          },
        ],
      }),
    );
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.ND,
      brief: 'evaluasi implementasi sistem manajemen',
    };
    const res = await service.generateDraft(dto, 1);
    expect(res.draftPerihal).toBe('Penyampaian Hasil Evaluasi');
    expect(res.draftHtml).toBe(
      '<p>Bersama ini disampaikan hasil evaluasi implementasi sistem.</p>',
    );
  });

  it('fallback raw=true when response is not JSON', async () => {
    ollama.generate.mockResolvedValue('ini bukan json sama sekali');
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.DISPOSISI,
      brief: 'instruksi tindak lanjut',
    };
    const res = await service.generateDraft(dto, 1);
    expect(res.raw).toBe(true);
    expect(res.draftHtml).toBe('ini bukan json sama sekali');
    expect(res.draftPerihal).toBe('instruksi tindak lanjut');
    expect(log.log).toHaveBeenCalledWith(
      expect.objectContaining({ status_code: 200 }),
    );
  });

  it('throws 502 when provider returns an empty response', async () => {
    ollama.generate.mockResolvedValue('   ');
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.ND,
      brief: 'buat nota dinas',
    };
    await expect(service.generateDraft(dto, 1)).rejects.toMatchObject({
      message: expect.stringContaining('AI'),
    });
    expect(log.log).toHaveBeenCalledWith(
      expect.objectContaining({
        status_code: 502,
        error_message: expect.stringContaining('AI response kosong'),
      }),
    );
  });

  it('throws 502 and logs failure when ollama rejects', async () => {
    ollama.generate.mockRejectedValue(new Error('timeout'));
    const dto: GenerateDraftDto = {
      naskahType: NaskahTypeEnum.KAJIAN,
      brief: 'analisis x',
    };
    await expect(service.generateDraft(dto, 1)).rejects.toMatchObject({
      message: expect.stringContaining('AI'),
    });
    expect(log.log).toHaveBeenCalledWith(
      expect.objectContaining({
        status_code: 502,
        error_message: expect.stringContaining('timeout'),
      }),
    );
  });
});
