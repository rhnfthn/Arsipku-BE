# AGENTS.md — Backend Arsipku

> Single source of truth untuk standar pengembangan backend ArsipKu.
> Path: `arsipku-be/AGENTS.md`

---

## 1. Stack & Versi (LOCKED)

Jangan ganti/upgrade tanpa diskusi.

| Dependency | Versi | Peran |
|---|---|---|
| NestJS | `^10.x` | Framework utama |
| TypeScript | `^5.x` | Bahasa |
| TypeORM | `^0.3.x` | ORM untuk MySQL |
| MySQL2 | `^3.x` | Driver MySQL |
| Mongoose | `^8.x` | ODM untuk MongoDB |
| `@nestjs/mongoose` | `^10.x` | Integrasi Mongoose |
| `class-validator` | `^0.14.x` | Validasi DTO |
| `class-transformer` | `^0.5.x` | Transformasi DTO |
| `rxjs` | `^7.x` | Reactive extensions |
| `uuid` | `^9.x` | UUID generator |
| `dayjs` | `^1.x` | Date utility |
| `bcrypt` | `^5.x` | Hashing password |
| `passport` / `@nestjs/passport` | `^10.x` | Authentication |
| `jwt` / `@nestjs/jwt` | `^10.x` | JWT token |
| `xlsx` | `^0.18.x` | Parsing Excel |

---

## 2. Struktur Folder

```
arsipku-be/src/
├── app.module.ts
├── main.ts
├── config/
│   └── database.config.ts
├── modules/
│   ├── auth/
│   ├── rbac/
│   ├── master-data/
│   ├── naskah/
│   ├── korespondensi/
│   ├── audit/              ← audit trail (MongoDB)
│   │   ├── audit.module.ts
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── schemas/        ← Mongoose schemas
│   │   ├── dto/
│   │   ├── enums/
│   │   ├── decorators/
│   │   └── interceptors/
│   └── ...
├── shared/
│   ├── entities/           ← TypeORM entities untuk MySQL
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── decorators/
└── types/
    └── express.d.ts
```

### Aturan

- Setiap modul punya folder sendiri di `modules/`.
- Dalam modul, pisahkan `controllers/`, `services/`, `dto/`, `entities/` atau `schemas/`.
- Gunakan `shared/` untuk kode yang digunakan lintas modul.
- Database utama Arsipku menggunakan **MySQL + TypeORM**.
- Database audit trail menggunakan **MongoDB + Mongoose**.

---

## 3. Database

### MySQL (Database Utama)

- Database: `arsipku_local_db`
- Primary key: `char(36)` UUID
- JSON data disimpan sebagai `TEXT` dengan transformer `JSON.stringify` / `JSON.parse`
- Enum menggunakan `VARCHAR` dengan string enum TypeScript
- Soft delete menggunakan kolom `deleted_at` jika diperlukan

### MongoDB (Audit Trail)

- Database: `arsipku_audit`
- Collection: `audit_trails`, `audit_anomalies`
- Primary key otomatis `_id` ObjectId
- JSON disimpan langsung sebagai object/subdocument
- Connection string dari `.env`:
  ```env
  MONGODB_URI=mongodb://127.0.0.1:27017/arsipku_audit
  ```

---

## 4. NestJS Conventions

### Module

```typescript
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class NamaModule {}
```

### Controller

```typescript
@Controller('api/nama-modul')
export class NamaController {
  constructor(private readonly namaService: NamaService) {}

  @Get()
  async findAll() { ... }
}
```

### Service

```typescript
@Injectable()
export class NamaService {
  constructor(
    @InjectRepository(NamaEntity)
    private readonly repo: Repository<NamaEntity>,
  ) {}
}
```

### DTO dengan Validasi

```typescript
export class CreateNamaDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
```

---

## 5. Entity Conventions (TypeORM)

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('nama_tabel')
export class NamaEntity {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, transformer: jsonTransformer })
  metadata: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### Transformer JSON

```typescript
export const jsonTransformer = {
  to: (value: any) => JSON.stringify(value),
  from: (value: string) => (value ? JSON.parse(value) : null),
};
```

---

## 6. Schema Conventions (Mongoose)

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditTrailDocument = HydratedDocument<AuditTrail>;

@Schema({ collection: 'audit_trails', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class AuditTrail {
  @Prop()
  userId: string;

  @Prop({ type: Object })
  oldValue: Record<string, any>;

  @Prop({ default: 'SUCCESS' })
  status: string;
}

export const AuditTrailSchema = SchemaFactory.createForClass(AuditTrail);
```

---

## 7. Response Format

Gunakan format response konsisten:

```json
{
  "status": "success",
  "message": "...",
  "data": { ... }
}
```

Atau untuk list:

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 10
}
```

---

## 8. Error Handling

- Gunakan exception filter global.
- Lempar `BadRequestException`, `NotFoundException`, `ForbiddenException`, dll.
- Jangan return error dalam format raw object.

```typescript
throw new NotFoundException('Data tidak ditemukan');
```

---

## 9. Keamanan

- Semua endpoint yang membutuhkan auth wajib pakai `@UseGuards(JwtAuthGuard)`.
- Role-based access gunakan guard atau decorator `@RequireRole()`.
- Jangan expose password, secret, atau data sensitif di response.
- Audit trail mencatat aktivitas penting, tapi jangan log password/token.

---

## 10. Coding Rules

- Gunakan `async/await`, hindari callback hell.
- Naming file snake-case atau kebab-case.
- Nama class PascalCase.
- Nama method camelCase.
- Prefer `readonly` untuk dependency injection.
- Pisahkan logic bisnis di service, jangan di controller.
- Gunakan repository pattern untuk TypeORM.

---

## 11. Environment Variables

Contoh `.env`:

```env
# App
NODE_ENV=development
PORT=3000

# MySQL utama
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=arsipku_local_db

# MongoDB audit
MONGODB_URI=mongodb://127.0.0.1:27017/arsipku_audit

# JWT
JWT_SECRET=secret_key
JWT_EXPIRES_IN=1d
```

---

## 12. Menambah Modul Baru

1. Buat folder di `src/modules/nama-modul/`.
2. Buat `nama-modul.module.ts`.
3. Buat controller, service, dto, entity/schema.
4. Daftarkan module di `app.module.ts`.
5. Jika pakai TypeORM, daftarkan entity di database config.

---

## 13. Testing

- Unit test: `*.spec.ts` di samping file yang di-test.
- E2E test: `test/` folder.
- Jalankan test:
  ```bash
  npm run test
  npm run test:e2e
  ```

---

## 14. Build & Run

```bash
# Install dependencies
npm install

# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod
```

---

## 15. Referensi Modul Penting

| Modul | Path |
|---|---|
| Auth | `src/modules/auth/` |
| RBAC | `src/modules/rbac/` |
| Master Data | `src/modules/master-data/` |
| Naskah | `src/modules/naskah/` |
| Korespondensi | `src/modules/korespondensi/` |
| Audit Trail | `src/modules/audit/` |

---

## 16. Kontak & Diskusi

Jika ada perubahan standar backend, diskusikan terlebih dahulu sebelum mengubah file ini.
