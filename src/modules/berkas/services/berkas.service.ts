import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Berkas } from '../entities/berkas.entity';
import { CreateBerkasDto, UpdateBerkasDto } from '../dto';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';

@Injectable()
export class BerkasService {
  constructor(
    @InjectRepository(Berkas)
    private readonly berkasRepository: Repository<Berkas>,
    @InjectRepository(KlasifikasiEntity)
    private readonly klasifikasiRepository: Repository<KlasifikasiEntity>,
  ) {}

  /**
   * Membuat berkas baru
   */
  async create(createBerkasDto: CreateBerkasDto): Promise<Berkas> {
    // Fetch klasifikasi_text dari tabel klasifikasi jika tidak dikirim dari frontend
    let klasifikasiTeks = createBerkasDto.klasifikasi_teks;
    
    if (!klasifikasiTeks && createBerkasDto.klasifikasi) {
      const klasifikasi = await this.klasifikasiRepository.findOne({
        where: { klasifikasi: createBerkasDto.klasifikasi },
      });
      
      if (klasifikasi) {
        klasifikasiTeks = klasifikasi.klasifikasi_text;
      }
    }

    const berkas = this.berkasRepository.create({
      klasifikasi: createBerkasDto.klasifikasi,
      klasifikasiTeks: klasifikasiTeks,
      judulBerkas: createBerkasDto.judul_berkas,
      hitungWaktuRetensiDari: createBerkasDto.hitung_waktu_retensi_dari,
      tindakanPenyusutanAkhir: createBerkasDto.tindakan_penyusutan_akhir,
      lokasi: createBerkasDto.lokasi,
      isiRingkas: createBerkasDto.isi_ringkas,
      isAktif: createBerkasDto.is_aktif ?? true, // Default true jika tidak diisi
    });

    return this.berkasRepository.save(berkas);
  }

  /**
   * Mengambil semua berkas
   * Secara default hanya menampilkan berkas aktif
   */
  async findAll(includeInactive = false): Promise<Berkas[]> {
    const whereCondition = includeInactive ? {} : { isAktif: true };

    return this.berkasRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Mengambil berkas berdasarkan ID
   */
  async findOne(id: string): Promise<Berkas> {
    const berkas = await this.berkasRepository.findOne({
      where: { id },
    });

    if (!berkas) {
      throw new NotFoundException(`Berkas dengan ID ${id} tidak ditemukan`);
    }

    return berkas;
  }

  /**
   * Mengupdate berkas
   */
  async update(id: string, updateBerkasDto: UpdateBerkasDto): Promise<Berkas> {
    const berkas = await this.findOne(id);

    // Update field yang ada di DTO
    if (updateBerkasDto.klasifikasi !== undefined) {
      berkas.klasifikasi = updateBerkasDto.klasifikasi;
      
      // Auto-fetch klasifikasi_text jika klasifikasi berubah dan klasifikasi_teks tidak dikirim
      if (updateBerkasDto.klasifikasi_teks === undefined) {
        const klasifikasi = await this.klasifikasiRepository.findOne({
          where: { klasifikasi: updateBerkasDto.klasifikasi },
        });
        
        if (klasifikasi) {
          berkas.klasifikasiTeks = klasifikasi.klasifikasi_text;
        }
      }
    }
    if (updateBerkasDto.klasifikasi_teks !== undefined) {
      berkas.klasifikasiTeks = updateBerkasDto.klasifikasi_teks;
    }
    if (updateBerkasDto.judul_berkas !== undefined) {
      berkas.judulBerkas = updateBerkasDto.judul_berkas;
    }
    if (updateBerkasDto.hitung_waktu_retensi_dari !== undefined) {
      berkas.hitungWaktuRetensiDari =
        updateBerkasDto.hitung_waktu_retensi_dari;
    }
    if (updateBerkasDto.tindakan_penyusutan_akhir !== undefined) {
      berkas.tindakanPenyusutanAkhir =
        updateBerkasDto.tindakan_penyusutan_akhir;
    }
    if (updateBerkasDto.lokasi !== undefined) {
      berkas.lokasi = updateBerkasDto.lokasi;
    }
    if (updateBerkasDto.isi_ringkas !== undefined) {
      berkas.isiRingkas = updateBerkasDto.isi_ringkas;
    }
    if (updateBerkasDto.is_aktif !== undefined) {
      berkas.isAktif = updateBerkasDto.is_aktif;
    }

    return this.berkasRepository.save(berkas);
  }

  /**
   * Menghapus berkas (soft delete dengan mengubah is_aktif menjadi false)
   */
  async softDelete(id: string): Promise<{ message: string }> {
    const berkas = await this.findOne(id);
    berkas.isAktif = false;
    await this.berkasRepository.save(berkas);

    return { message: `Berkas ${id} berhasil dinonaktifkan` };
  }

  /**
   * Menghapus berkas secara permanen
   */
  async remove(id: string): Promise<{ message: string }> {
    const berkas = await this.findOne(id);
    await this.berkasRepository.remove(berkas);

    return { message: `Berkas ${id} berhasil dihapus` };
  }

  /**
   * Mengaktifkan kembali berkas yang sudah dinonaktifkan
   */
  async restore(id: string): Promise<Berkas> {
    const berkas = await this.berkasRepository.findOne({
      where: { id },
    });

    if (!berkas) {
      throw new NotFoundException(`Berkas dengan ID ${id} tidak ditemukan`);
    }

    berkas.isAktif = true;
    return this.berkasRepository.save(berkas);
  }
}
