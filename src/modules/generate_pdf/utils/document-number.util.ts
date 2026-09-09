export interface DocumentNumberSource {
  nomor?: unknown;
  nomorSurat?: unknown;
  nomor_surat?: unknown;
  nomorDokumen?: unknown;
  document_number?: unknown;
}

/** Resolve nomor surat dari payload current maupun legacy. */
export function resolveDocumentNumber(body: DocumentNumberSource): string {
  const candidates = [
    body.nomor,
    body.nomorSurat,
    body.nomor_surat,
    body.nomorDokumen,
    body.document_number,
  ];

  const value = candidates.find(
    (candidate) =>
      candidate !== undefined && candidate !== null && candidate !== '',
  );

  return value === undefined ? '' : String(value);
}
