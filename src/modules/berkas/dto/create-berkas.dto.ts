import {
  IsString,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {
  HitungWaktuRetensiDari,
  TindakanPenyusutanAkhir,
} from '../entities/berkas.entity';

export class CreateBerkasDto {
  @IsString()
  @IsNotEmpty({ message: 'Klasifikasi tidak boleh kosong' })
  @MaxLength(50, { message: 'Klasifikasi maksimal 50 karakter' })
  klasifikasi: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Klasifikasi teks maksimal 255 karakter' })
  klasifikasi_teks?: string;

  @IsString()
  @IsNotEmpty({ message: 'Judul berkas tidak boleh kosong' })
  @MaxLength(200, { message: 'Judul berkas maksimal 200 karakter' })
  judul_berkas: string;

  @IsEnum(HitungWaktuRetensiDari, {
    message:
      'Hitung waktu retensi dari harus berupa "Sejak Berkas Dibuat" atau "Sejak Berkas Ditutup"',
  })
  @IsNotEmpty({ message: 'Hitung waktu retensi dari tidak boleh kosong' })
  hitung_waktu_retensi_dari: HitungWaktuRetensiDari;

  @IsEnum(TindakanPenyusutanAkhir, {
    message:
      'Tindakan penyusutan akhir harus berupa "Musnah", "Dinilai Kembali", atau "Permanen"',
  })
  @IsNotEmpty({ message: 'Tindakan penyusutan akhir tidak boleh kosong' })
  tindakan_penyusutan_akhir: TindakanPenyusutanAkhir;

  @IsString()
  @IsNotEmpty({ message: 'Lokasi tidak boleh kosong' })
  @MaxLength(255, { message: 'Lokasi maksimal 255 karakter' })
  lokasi: string;

  @IsString()
  @IsNotEmpty({ message: 'Isi ringkas tidak boleh kosong' })
  isi_ringkas: string;

  @IsOptional()
  @IsBoolean()
  is_aktif?: boolean;
}
