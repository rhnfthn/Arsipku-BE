import { isAllowedCorrespondenceRecipient } from './correspondence-recipient.util';

describe('isAllowedCorrespondenceRecipient', () => {
  it('keeps Direktur Utama available', () => {
    expect(
      isAllowedCorrespondenceRecipient({ position_text: 'Direktur Utama' }),
    ).toBe(true);
  });

  it('excludes Ketua Dewan Pengawas', () => {
    expect(
      isAllowedCorrespondenceRecipient({
        position_text: 'Ketua Dewan Pengawas',
      }),
    ).toBe(false);
  });
});
