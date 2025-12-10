export class CreateNaskahLampiranDto {
  id_naskah?: string;
  file_name?: string;
  file_pdf?: string;
  jenis?: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA';
}
