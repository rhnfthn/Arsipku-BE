export class EksternalDto {
  id: string;
  company: string;
  area: string;
  nama: string;
  alamat?: string;
  telepon?: string;
  email?: string;
  kontak?: string;
  aktif?: boolean;
}

export class EksternalListResponseDto {
  success: boolean;
  total: number;
  data: EksternalDto[];
}

export class EksternalItemResponseDto {
  success: boolean;
  data: EksternalDto;
}

export class EksternalActionResponseDto {
  success: boolean;
  message: string;
  data?: EksternalDto;
}
