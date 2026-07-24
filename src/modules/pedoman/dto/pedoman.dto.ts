// ============================================================
// DTO: PedomanData & PedomanResponseDto
// Interface untuk bentuk response JSON (success, message, data).
// ============================================================

import { PedomanJenis } from '../entities/pedoman.entity';

export interface LampiranItem {
  url: string;
  name: string;
}

export interface PedomanData {
  id: string;
  judul: string;
  deskripsi: string;
  jenis: PedomanJenis;
  nomorDokumen: string;
  tanggalBerlaku: Date;
  fileUrl?: string;
  lampirans?: LampiranItem[];
  isActive: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PedomanResponseDto {
  success: boolean;
  message: string;
  data: PedomanData | PedomanData[];
}
