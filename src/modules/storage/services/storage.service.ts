import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as https from 'https';
import path from 'path';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private bucketName: string;
  private endpoint: string;
  private publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const minioEndpoint =
      this.configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = this.configService.get<string>('MINIO_PORT');
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';

    const protocol = useSSL ? 'https' : 'http';
    // Jika port ada dan tidak kosong, tambahkan port ke endpoint
    this.endpoint =
      port && port.trim() !== ''
        ? `${protocol}://${minioEndpoint}:${port}`
        : `${protocol}://${minioEndpoint}`;

    // Public URL untuk akses file (tanpa port, via reverse proxy)
    this.publicUrl =
      this.configService.get<string>('MINIO_PUBLIC_URL') || this.endpoint;

    const accessKeyId =
      this.configService.get<string>('MINIO_ACCESS_KEY') || '';
    const secretAccessKey =
      this.configService.get<string>('MINIO_SECRET_KEY') || '';

    this.logger.log(`📡 MinIO Configuration:`);
    this.logger.log(`  - Endpoint: ${this.endpoint}`);
    this.logger.log(`  - Public URL: ${this.publicUrl}`);
    this.logger.log(`  - Use SSL: ${useSSL}`);
    this.logger.log(`  - Access Key: ${accessKeyId ? '✓' : '✗'}`);
    this.logger.log(`  - Secret Key: ${secretAccessKey ? '✓' : '✗'}`);

    // Handler untuk self-signed certificate
    const requestHandler = new NodeHttpHandler({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Untuk self-signed certificate
      }),
    });

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: 'us-east-1', // MinIO tidak peduli region, tapi harus diisi
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Wajib untuk MinIO
      requestHandler: useSSL ? requestHandler : undefined,
    });

    this.bucketName =
      this.configService.get<string>('MINIO_BUCKET_NAME') || 'default';
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  /**
   * Memastikan bucket sudah ada, jika belum akan dibuat
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      this.logger.log(`🔍 Checking if bucket '${this.bucketName}' exists...`);
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
      this.logger.log(`✅ MinIO bucket '${this.bucketName}' exists`);
    } catch (error) {
      this.logger.error(`❌ MinIO connection error: ${error.message}`);
      this.logger.error(`   Error name: ${error.name}`);
      this.logger.error(`   Error code: ${error.code || 'N/A'}`);
      this.logger.error(
        `   Status code: ${error.$metadata?.httpStatusCode || 'N/A'}`,
      );

      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        try {
          this.logger.log(`📦 Creating bucket '${this.bucketName}'...`);
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: this.bucketName }),
          );
          this.logger.log(`✅ MinIO bucket '${this.bucketName}' created`);
        } catch (createError) {
          this.logger.error(
            `❌ Failed to create bucket: ${createError.message}`,
          );
        }
      } else {
        this.logger.warn(
          `⚠️  MinIO may not be available. Service will continue but file uploads may fail.`,
        );
      }
    }
  }

  /**
   * Upload file dari Multer ke MinIO
   * @param file - File dari Multer (Express.Multer.File)
   * @param folder - Folder tujuan (opsional)
   * @returns UploadResult dengan key dan URL
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = '',
  ): Promise<UploadResult> {
    if (!file) {
      throw new Error('File tidak ditemukan');
    }
    const allowedMimeTypes = {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'application/msword': ['.doc'],
    };

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = allowedMimeTypes[file.mimetype];

    if (!allowedExts || !allowedExts.includes(ext)) {
      throw new Error(`File tidak valid. MIME: ${file.mimetype}, Ext: ${ext}`);
    }

    const sanitizedFileName = this.sanitizeFileName(file.originalname);
    const key = folder
      ? `${folder}/${Date.now()}-${sanitizedFileName}`
      : `${Date.now()}-${sanitizedFileName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: 'inline', // Enable browser preview instead of download
      }),
    );

    this.logger.log(`✅ File uploaded: ${key}`);

    return {
      key,
      url: await this.getFileUrl(key),
      bucket: this.bucketName,
    };
  }

  /**
   * Upload buffer langsung ke MinIO
   * @param buffer - Buffer data
   * @param filename - Nama file
   * @param contentType - MIME type
   * @param folder - Folder tujuan (opsional)
   * @returns UploadResult dengan key dan URL
   */
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    folder: string = '',
  ): Promise<UploadResult> {
    const sanitizedFileName = this.sanitizeFileName(filename);
    const key = folder
      ? `${folder}/${Date.now()}-${sanitizedFileName}`
      : `${Date.now()}-${sanitizedFileName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: 'inline', // Enable browser preview instead of download
      }),
    );

    this.logger.log(`✅ Buffer uploaded: ${key}`);

    return {
      key,
      url: await this.getFileUrl(key),
      bucket: this.bucketName,
    };
  }

  /**
   * Get signed URL untuk akses file (menggunakan public URL)
   * @param key - Key file di MinIO
   * @param expiresIn - Waktu expired dalam detik (default 1 jam)
   * @returns Signed URL dengan public endpoint
   */
  async getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    // Ganti internal endpoint dengan public URL
    return signedUrl.replace(this.endpoint, this.publicUrl);
  }

  /**
   * Get signed URL untuk preview file (inline, tidak auto-download)
   * Menggunakan ResponseContentDisposition: inline agar browser menampilkan file
   * @param key - Key file di MinIO
   * @param expiresIn - Waktu expired dalam detik (default 24 jam)
   * @returns Signed URL untuk preview
   */
  async getPreviewUrl(key: string, expiresIn: number = 86400): Promise<string> {
    // Determine content type based on file extension
    const extension = key.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';

    if (extension === 'pdf') {
      contentType = 'application/pdf';
    } else if (['jpg', 'jpeg'].includes(extension || '')) {
      contentType = 'image/jpeg';
    } else if (extension === 'png') {
      contentType = 'image/png';
    } else if (extension === 'gif') {
      contentType = 'image/gif';
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: 'inline', // Tampilkan di browser, bukan download
      ResponseContentType: contentType,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    // Ganti internal endpoint dengan public URL
    return signedUrl.replace(this.endpoint, this.publicUrl);
  }

  /**
   * Get public URL (tanpa signature, untuk bucket public)
   * @param key - Key file di MinIO
   * @returns Public URL
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${this.bucketName}/${key}`;
  }

  /**
   * Download file dari MinIO sebagai Buffer
   * @param key - Key file di MinIO
   * @returns Buffer data
   */
  async getFile(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Download file dengan metadata
   * @param key - Key file di MinIO
   * @returns Object dengan buffer dan metadata
   */
  async getFileWithMetadata(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string; contentLength: number }> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
    };
  }

  /**
   * Delete file dari MinIO
   * @param key - Key file di MinIO
   */
  async deleteFile(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    this.logger.log(`✅ File deleted: ${key}`);
  }

  /**
   * Move/copy file dari satu lokasi ke lokasi lain di MinIO
   * @param sourceKey - Key file sumber
   * @param destinationKey - Key file tujuan
   * @returns Result dengan from, to, dan url
   */
  async moveFile(
    sourceKey: string,
    destinationKey: string,
  ): Promise<{ from: string; to: string; url: string }> {
    // 1. COPY
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `/${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
      }),
    );

    // 2. DELETE SOURCE
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: sourceKey,
      }),
    );

    this.logger.log(`📦 File moved: ${sourceKey} → ${destinationKey}`);
    const publicURL = this.getPublicUrl(destinationKey);
    return {
      from: sourceKey,
      to: destinationKey,
      url: publicURL,
    };
  }

  /**
   * List files dalam folder
   * @param prefix - Prefix/folder path
   * @param maxKeys - Jumlah maksimum file (default 1000)
   * @returns Array of file keys
   */
  async listFiles(
    prefix: string = '',
    maxKeys: number = 1000,
  ): Promise<string[]> {
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    );

    return (
      response.Contents?.map((item) => item.Key).filter(
        (key): key is string => key !== undefined,
      ) || []
    );
  }

  /**
   * Check apakah file exists
   * @param key - Key file di MinIO
   * @returns boolean
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cari key file terbaru berdasarkan nama file original.
   * Berguna untuk migrasi/self-heal data lama yang menyimpan file_text sebagai nama file,
   * padahal key upload mengikuti pola: {folder}/{timestamp}-{sanitizedFileName}
   */
  async findLatestKeyByOriginalName(
    originalName: string,
    folder: string = '',
    maxKeys: number = 1000,
  ): Promise<string | null> {
    if (!originalName) return null;

    const sanitized = this.sanitizeFileName(originalName);
    const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';

    const keys = await this.listFiles(prefix, maxKeys);
    if (!keys.length) return null;

    // Candidate keys biasanya diakhiri dengan `-{sanitized}`
    const candidates = keys.filter(
      (k) => k.endsWith(`-${sanitized}`) || k.endsWith(`/${sanitized}`),
    );
    if (!candidates.length) return null;

    // Pilih yang timestamp-nya paling besar (paling baru)
    let bestKey: string = candidates[0];
    let bestTs = -1;

    for (const k of candidates) {
      const base = k.split('/').pop() || '';
      const tsStr = base.split('-')[0];
      const ts = Number(tsStr);
      if (!Number.isNaN(ts) && ts > bestTs) {
        bestTs = ts;
        bestKey = k;
      }
    }

    return bestKey;
  }

  /**
   * Sanitize filename untuk menghindari karakter berbahaya
   */
  private sanitizeFileName(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Generate unique filename dengan UUID
   */
  generateUniqueFileName(originalName: string): string {
    const ext = originalName.split('.').pop();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}.${ext}`;
  }
}
