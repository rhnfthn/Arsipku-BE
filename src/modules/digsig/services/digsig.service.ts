import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDigsigDto, UpdateDigsigDto } from '../dto';
import { StorageService } from '../../storage/services/storage.service';
import axios from 'axios';
import * as mime from 'mime-types';

@Injectable()
export class DigsigService {
  constructor(private readonly storageService: StorageService) {}

  async create() {
    const filename = '1765428155683-aturan_penomoran_naskah_dinas.pdf';
    const fileBuffer = await this.storageService.getFile(
      `/nota-dinas/final/${filename}`,
    );
    return fileBuffer.toString('base64');
  }

  async hitDigsigEndpoint(params: {
    key: string; // key minio (path lengkap)
    filename: string; // filename.pdf
    nomorDokumen: string;
    tanggalDokumen: string;
    klasifikasi: string;
    jenisNaskah: string;
    perihal: string;
    nik: string;
    passphrase: string;
    path_dokumen: string;
    no_wa: string;
  }) {
    // 1. Ambil file dari MinIO
    const buffer = await this.storageService.getFile(params.key);
    const base64File = buffer.toString('base64');

    // 2. Payload sesuai spesifikasi
    const payload = {
      tanggalDokumen: params.tanggalDokumen,
      klasifikasi: params.klasifikasi,
      jenisNaskah: params.jenisNaskah,
      perihal: params.perihal,
      dokumen: [
        {
          nomorDokumen: params.nomorDokumen,
          filename: params.filename,
          data: base64File,
        },
      ],
      nik: params.nik,
      passphrase: params.passphrase,
      no_wa: params.no_wa,
      path_dokumen: params.path_dokumen,
      jenis_ttd_digital: 'Digsig',
      tampilan_ttd_digital: 'INVISIBLE',
      ttd64: '',
      tag: '',
    };

    // 3. Hit endpoint
    const response = await axios.post(
      'http://172.20.16.115:7000/signin', // GANTI endpoint
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );

    return response.data;
  }
}
