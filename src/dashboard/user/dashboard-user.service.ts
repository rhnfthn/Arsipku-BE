import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasi } from 'src/persuratan/entity/naskah_sirkulasi.entity';
import { NaskahEntity } from 'src/persuratan/entity/naskah.entity';

@Injectable()
export class DashboardUserService {
  constructor(
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepo: Repository<NaskahEntity>,
  ) {}

  async getDashboardData(persnum: number): Promise<{
    message: string;
    data: {
      kotak_masuk: number;
      terkirim: number;
      draf: number;
    };
  }> {
    // Count kotak masuk (penerima)
    const kotakMasuk = await this.naskahSirkulasiRepo.count({
      where: {
        idSirkuler: persnum.toString(),
        sirkuler: 'penerima',
      },
    });

    // Count terkirim (pengirim)
    const terkirim = await this.naskahSirkulasiRepo.count({
      where: {
        idSirkuler: persnum.toString(),
        sirkuler: 'pengirim',
      },
    });

    // Count draf from naskah table
    const draf = await this.naskahRepo.count({
      where: {
        status: 'draf',
      },
    });

    return {
      message: 'Data retrieved successfully',
      data: {
        kotak_masuk: kotakMasuk,
        terkirim: terkirim,
        draf: draf,
      },
    };
  }
}
