import {
  createCorrespondenceAttachmentFileName,
  createCorrespondenceFinalFileName,
} from './correspondence-file-name.util';

describe('correspondence file names', () => {
  it('uses jenis and a random token for attachments', () => {
    expect(createCorrespondenceAttachmentFileName('sdi')).toMatch(
      /^SDI-[A-F0-9]{12}\.pdf$/,
    );
  });

  it('appends the attachment count to final documents', () => {
    expect(createCorrespondenceFinalFileName('ND', 3)).toMatch(
      /^ND-[A-F0-9]{12}-3\.pdf$/,
    );
  });
});
