import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { HitungWaktuRetensiDari, TindakanPenyusutanAkhir } from '../../berkas/entities/berkas.entity';

export class CreateArsipDinamisBerkasDto {
  @IsString()
  @IsNotEmpty({ message: 'Klasifikasi wajib diisi' })
  klasifikasi: string;

  @IsString()
  @IsNotEmpty({ message: 'Nama berkas wajib diisi' })
  @MaxLength(200)
  judul_berkas: string;

  @IsEnum(HitungWaktuRetensiDari)
  @IsNotEmpty({ message: 'Hitung waktu retensi wajib dipilih' })
  hitung_waktu_retensi_dari: HitungWaktuRetensiDari;

  @IsEnum(TindakanPenyusutanAkhir)
  @IsNotEmpty({ message: 'Tindakan penyusutan akhir wajib dipilih' })
  tindakan_penyusutan_akhir: TindakanPenyusutanAkhir;

  @IsString()
  @IsNotEmpty({ message: 'Lokasi fisik wajib diisi' })
  lokasi: string;

  @IsString()
  @IsNotEmpty({ message: 'Uraian wajib diisi' })
  isi_ringkas: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kategori_berkas?: string;

  @IsOptional()
  @IsInt()
  retensi_aktif_tahun?: number;

  @IsOptional()
  @IsInt()
  retensi_inaktif_tahun?: number;

  @IsOptional()
  @IsString()
  foto_lokasi_fisik?: string;

  @IsOptional()
  @IsString()
  dokumen_pendukung?: string;

  @IsOptional()
  @IsInt()
  unit_pencipta_id?: number;

  @IsOptional()
  @IsString()
  pic_persnum?: string;

  @IsOptional()
  @IsInt()
  pic_position_id?: number;

  @IsOptional()
  @IsString()
  klasifikasi_text?: string;
}
