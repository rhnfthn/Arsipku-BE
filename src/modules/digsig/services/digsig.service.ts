import {
  Injectable,
  NotFoundException,
  HttpException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
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
    try {
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
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error Message:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Response Data:', error.response?.data);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            source: 'external-service',
          },
          status,
        );
      }
      console.error('Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getKTPUser(params: { persnum: string }) {
    try {
      const response = await axios.get(
        `https://api.airnavindonesia.co.id/dataset-dev/hc/personal-ids/${params.persnum}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization:
              'Bearer ZTE3MTdkN2QyMzE4YmQzYzkyMzc4MmQ2YWEwNjYzYTU0NGYxYzRjMmY2YzEwNjcxNTNlODhmODZjMTE0MmE0MjIyZmNmYWJiMDcyZGM5NmRlMjY5ODk5ODAwMmVjNTJlNGMwYjAwODAxZjUzOGQ5MWI1YzhlNTliYzVmY2RlOTY4YzM3OTllMWYxMTAxMDVmYzFhMTAzYjk1YzM2MDVhYTNkM2U3M2FlMGZiZTBmMWZiMTM3ZmNmZjc4ODY5MTNhOWM1MjU3ZmI1MzlmZGMxM2IwN2VmMTJjYWMxMTIwM2ZkMTQ2OGE5MjkyYjM1YzdmOTI5OWQzODEzMzkxZjE0MjVmZjQ1Yzg2MDg3NDA0MzY4N2M3NDNlMjkyYjhmMzRhMjJmYjQwZjA5OGNiMWM5Mjk4ZGM0MzU5YmI1OTM1MThmNTkyMzJiMDc1NzJmZjUxNjA3YzEzN2U5M2RmNzQ4YTIyZDZiOGY0ZThlM2Q2NDJmN2VmZjE5ZGJjODY5MWY2ZDk2Y2FmYTc5NDY5NTk5YTc5MWZjNzVjZjgzYzZhOGJiOGQwYTBlZWI2YjcwYzQwZWRhYjc5YzVlMzhhMWM3ZDVmNmU5YWFmNjFkYmZmMzVjN2U0OWU0NzRhNDcyYjdiYmI4MjRkNTkxNDM3YjhkOWJjYjZkMzZhMTNjMzk5MzQ3ZTAyNzY5ZDc3ODk1ZWNkNjQyY2ZlM2FlNDg0MTYyYg==',
          },
          timeout: 30000,
        },
      );
      const data = response.data?.data ?? [];
      const filterktp = data.find((x) => x.subType === '01');
      if (!filterktp) {
        throw new BadRequestException('Data KTP dengan subType 01 tidak ditemukan');
      }
      return {
        noktp: filterktp.number
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error Message:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Response Data:', error.response?.data);
        const status =
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.response?.data?.errors ||
          'Gagal mengambil data dari service external';

        // 🔥 lempar ulang ke controller
        throw new HttpException(
          {
            success: false,
            message,
            error: error instanceof Error ? error.message : String(error),
          },
          status,
        );
      }
      const msgerror = error.response.message ?? 'Unexpected error';
      console.error('Unexpected Error:', error);
      throw new HttpException(
        {
          success: false,
          message: msgerror,
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
