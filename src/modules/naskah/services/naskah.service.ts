import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../entities/naskah.entity';
import { NaskahSirkulasi } from '../../naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../naskah-lampiran/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../naskah-referensi/entities/naskah_referensi.entity';
import { DiEntity } from '../../disposisi/entities/di.entity';
import { CreateNaskahDto } from '../dto/naskah/create_naskah.dto';
import { UpdateNaskahDto } from '../dto/naskah/update_naskah.dto';
import {
  NaskahDetailResponseDto,
  SirkulasiDetailDto,
  LampiranDetailDto,
  ReferensiDetailDto,
  DisposisiDetailDto,
} from '../dto/naskah/naskah-detail.dto';

// Label untuk jenis naskah
const JENIS_LABELS: Record<string, string> = {
  ND: 'Nota Dinas',
  SDI: 'Surat Dinas Internal',
  SDE: 'Surat Dinas Eksternal',
  DI: 'Disposisi',
  KA: 'Kajian',
};

@Injectable()
export class NaskahService {
  constructor(
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(DiEntity)
    private diRepository: Repository<DiEntity>,
  ) {}

  async create(createNaskahDto: CreateNaskahDto): Promise<NaskahEntity> {
    const naskah = new NaskahEntity();
    naskah.id = uuidv4();
    Object.assign(naskah, createNaskahDto);

    return await this.naskahRepository.save(naskah);
  }

  async findAll(
    jenis?: string,
    status?: string,
    year?: number,
  ): Promise<NaskahEntity[]> {
    const query = this.naskahRepository.createQueryBuilder('naskah');

    if (jenis) {
      query.where('naskah.jenis = :jenis', { jenis });
    }

    if (status) {
      query.andWhere('naskah.status = :status', { status });
    }

    if (year) {
      query.andWhere('YEAR(naskah.tanggal) = :year', { year });
    }

    return await query.orderBy('naskah.tanggal', 'DESC').getMany();
  }

  async findOne(id: string): Promise<NaskahEntity> {
    const naskah = await this.naskahRepository.findOne({
      where: { id },
    });

    if (!naskah) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    return naskah;
  }

  async findByJenis(
    jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
  ): Promise<NaskahEntity[]> {
    return await this.naskahRepository.find({
      where: { jenis },
      order: { tanggal: 'DESC' },
    });
  }

  async update(
    id: string,
    updateNaskahDto: UpdateNaskahDto,
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    Object.assign(naskah, updateNaskahDto);
    return await this.naskahRepository.save(naskah);
  }

  async remove(id: string): Promise<void> {
    const naskah = await this.findOne(id);
    await this.naskahRepository.remove(naskah);
  }

  async updateStatus(
    id: string,
    status: 'draf' | 'final' | 'final_tte',
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    naskah.status = status;
    return await this.naskahRepository.save(naskah);
  }

  /**
   * Get Detail Naskah - Global untuk semua jenis naskah
   * 
   * Mengambil semua data terkait naskah:
   * - Data utama dari tabel naskah
   * - Sirkulasi (pengirim, penerima, tembusan)
   * - Lampiran files
   * - Referensi surat
   * - Data spesifik per jenis (DI, ND, dll)
   */
  async getDetail(naskahId: string): Promise<NaskahDetailResponseDto> {
    // 1. Get data naskah utama
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${naskahId} tidak ditemukan`);
    }

    // 2. Get sirkulasi (pengirim, penerima, tembusan)
    const sirkulasiList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const pengirim = sirkulasiList.find((s) => s.sirkuler === 'pengirim');
    const penerima = sirkulasiList.filter((s) => s.sirkuler === 'penerima');
    const tembusan = sirkulasiList.filter((s) => s.sirkuler === 'tembusan');

    // 3. Get lampiran files
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // 4. Get referensi surat
    const referensiList = await this.naskahReferensiRepository.find({
      where: { id_naskah: naskahId },
    });

    // 5. Get data spesifik per jenis
    let detailDisposisi: DisposisiDetailDto | null = null;

    if (naskah.jenis === 'DI') {
      const diData = await this.diRepository.findOne({
        where: { idNaskah: naskahId },
      });

      if (diData) {
        detailDisposisi = {
          id: diData.id,
          kop_logo: diData.kopLogo,
          kop_judul: diData.kopJudul,
          nama_jabatan: diData.namaJabatan,
          nomor_agenda: diData.nomorAgenda,
          tanggal_agenda: diData.tanggalAgenda,
          surat_dari: diData.suratDari,
          tanggal: diData.tanggal,
          nomor: diData.nomor,
          perihal: diData.perihal,
          klasifikasi: diData.klasifikasi,
          kepada_yth: diData.kepadaYth,
          disposisi: diData.disposisi,
          catatan: diData.catatan,
          paraf: diData.paraf,
        };
      }
    }

    // Build response
    return {
      success: true,
      message: 'Berhasil mengambil detail naskah',
      data: {
        // Data utama
        id: naskah.id,
        jenis: naskah.jenis,
        jenis_label: JENIS_LABELS[naskah.jenis] || naskah.jenis,
        klasifikasi: naskah.klasifikasi,
        klasifikasi_text: naskah.klasifikasi_text,
        sifat: naskah.sifat,
        nomor: naskah.nomor,
        tanggal: naskah.tanggal,
        perihal: naskah.perihal,
        konten: naskah.konten,
        lampiran: naskah.lampiran,
        status: naskah.status,

        // Sirkulasi
        pengirim: pengirim ? this.mapSirkulasi(pengirim) : null,
        penerima: penerima.map((p) => this.mapSirkulasi(p)),
        tembusan: tembusan.map((t) => this.mapSirkulasi(t)),

        // Lampiran files
        lampiran_files: lampiranList.map((l) => this.mapLampiran(l)),

        // Referensi surat
        referensi: referensiList.map((r) => this.mapReferensi(r)),

        // Data spesifik per jenis
        detail_disposisi: detailDisposisi,
        detail_nota_dinas: null, // TODO: implement jika ada tabel nd
      },
    };
  }

  /**
   * Map NaskahSirkulasi entity to SirkulasiDetailDto
   */
  private mapSirkulasi(s: NaskahSirkulasi): SirkulasiDetailDto {
    return {
      id: s.id,
      sirkuler: s.sirkuler,
      company: s.company,
      company_text: s.companyText,
      area: s.area,
      area_text: s.areaText,
      sub_area: s.subArea,
      sub_area_text: s.subAreaText,
      organization: s.organization,
      organization_text: s.organizationText,
      position: s.position,
      position_text: s.positionText,
      position_status: s.positionStatus,
      id_sirkuler: s.idSirkuler,
      nama_sirkuler: s.namaSirkuler,
      send_read_time: s.sendReadTime,
      send_read_user: s.sendReadUser,
      is_draft: s.isDraft ?? false,
      flag_favorit: !!s.flagFavorit,
      flag_arsip: !!s.flagArsip,
    };
  }

  /**
   * Map NaskahLampiranEntity to LampiranDetailDto
   */
  private mapLampiran(l: NaskahLampiranEntity): LampiranDetailDto {
    return {
      id: l.id,
      file_name: l.file_name,
      file_pdf: l.file_pdf,
      jenis: l.jenis,
    };
  }

  /**
   * Map NaskahReferensiEntity to ReferensiDetailDto
   */
  private mapReferensi(r: NaskahReferensiEntity): ReferensiDetailDto {
    return {
      id: r.id,
      ref_jenis: r.ref_jenis,
      ref_pengirim: r.ref_pengirim,
      ref_tanggal: r.ref_tanggal,
      ref_nomor: r.ref_nomor,
      ref_perihal: r.ref_perihal,
    };
  }
}
