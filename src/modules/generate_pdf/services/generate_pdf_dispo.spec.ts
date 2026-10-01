import { buildDisposisiRecipientHtml } from './generate_pdf_dispo.service';

describe('buildDisposisiRecipientHtml', () => {
  it('menampilkan satu penerima tanpa nomor', () => {
    expect(buildDisposisiRecipientHtml(['Direktur Utama'])).toBe(
      'Direktur Utama',
    );
  });

  it('memberi nomor pada lebih dari satu penerima', () => {
    const html = buildDisposisiRecipientHtml([
      'Direktur Utama',
      'Direktur Teknik',
    ]);

    expect(html).toContain('<ol');
    expect(html).toContain('<li>Direktur Teknik</li>');
    expect(html).toContain('<li>Direktur Utama</li>');
  });

  it('mempertahankan label GM lengkap yang mengandung tanda hubung', () => {
    const recipient =
      'Nama Pejabat - General Manager Cabang - Cabang JATSC';

    expect(buildDisposisiRecipientHtml([recipient])).toBe(recipient);
  });
});
