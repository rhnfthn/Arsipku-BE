import { PedomanJenis } from '../entities/pedoman.entity';

export interface PedomanData {
  id: string;
  judul: string;
  deskripsi: string;
  jenis: PedomanJenis;
  nomorDokumen: string;
  tanggalBerlaku: Date;
  fileUrl?: string;
  lampiranUrl?: string;
  lampiranName?: string;
  isActive: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PedomanResponseDto {
  success: boolean;
  message: string;
  data: PedomanData | PedomanData[];
}