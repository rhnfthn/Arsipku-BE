# Search v2 API Documentation (Meilisearch)

The `/search/v2` endpoint provides fast, typo-tolerant search powered by Meilisearch.

## Base URL

```
GET /search/v2
```

## Authentication

Requires JWT Bearer token in Authorization header.

```
Authorization: Bearer <your_jwt_token>
```

---

## Query Parameters

### Search Terms

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyword` | string | Main search term (searches perihal, nomor, pengirim, klasifikasi) |
| `perihal` | string | Search specifically in perihal/subject |
| `hasWords` | string | Must contain these words |
| `doesntHave` | string | Exclude documents containing these words |
| `from` | string | Search in sender name/organization |
| `to` | string | Search in recipient name/organization |
| `nomor` | string | Search by document number |

### Filters

| Parameter | Type | Values | Description |
|-----------|------|--------|-------------|
| `jenis` | string | `ND`, `SDI`, `SDE`, `DI`, `KA` | Document type filter |
| `sifat` | string | `sangat_rahasia`, `rahasia`, `terbatas`, `biasa`, `terbuka` | Confidentiality level |
| `status` | string | `draf`, `final`, `final_tte` | Document status |
| `klasifikasi` | string | - | Classification code |
| `hasAttachment` | boolean | `true`, `false` | Filter by attachment presence |
| `scope` | string | `inbox`, `sent`, `draft`, `all`, `active` | Filter by folder/source |

### Date Filters

| Parameter | Type | Format | Description |
|-----------|------|--------|-------------|
| `dateFrom` | string | `YYYY-MM-DD` | Start date range |
| `dateTo` | string | `YYYY-MM-DD` | End date range |
| `dateWithin` | enum | `1d`, `3d`, `1w`, `2w`, `1m`, `2m`, `6m`, `1y` | Relative date range |
| `dateReference` | string | `YYYY-MM-DD` | Reference date for dateWithin |

### Organization Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `areaFrom` | string | Filter by sender's area |
| `subAreaFrom` | string | Filter by sender's sub-area |
| `organizationFrom` | string | Filter by sender's organization |

### Pagination & Sorting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sortBy` | string | `tanggal` | Sort field (`tanggal`, `nomor`, `created`) |
| `sortOrder` | string | `DESC` | Sort direction (`ASC`, `DESC`) |
| `position_id` | string | JWT position | Override user position for search |

---

## Response Format

```json
{
  "success": true,
  "message": "Ditemukan 42 naskah",
  "data": {
    "items": [
      {
        "id": "uuid",
        "jenis": "ND",
        "jenisText": "Nota Dinas",
        "nomor": "ND/123/2025",
        "tanggal": "2025-01-15T00:00:00.000Z",
        "perihal": "Permohonan Cuti Tahunan",
        "sifat": "biasa",
        "status": "final_tte",
        "klasifikasi": "001.01",
        "klasifikasiText": "001.01",
        "pengirim": {
          "nama": "John Doe",
          "jabatan": "Manager IT",
          "organization": "Divisi Teknologi Informasi",
          "area": "Kantor Pusat"
        },
        "penerima": [
          {
            "nama": "Jane Smith",
            "jabatan": "Direktur SDM",
            "organization": "Divisi SDM"
          }
        ],
        "lampiranCount": 2,
        "hasAttachment": true,
        "finalPdf": "/storage/naskah/final/123.pdf",
        "source": "inbox",
        "sourceLabel": "Kotak Masuk",
        "userRoles": ["penerima"],
        "isRead": true,
        "isArchived": false,
        "isFavorite": false,
        "createdAt": "2025-01-15T08:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    },
    "filters": {
      "applied": ["scope: inbox", "jenis: ND"],
      "keyword": "cuti"
    }
  }
}
```

---

## Example Requests

### Basic Search

```bash
GET /search/v2?keyword=permohonan
```

### Search with Filters

```bash
GET /search/v2?keyword=nota&jenis=ND&sifat=biasa&scope=inbox
```

### Date Range Search

```bash
GET /search/v2?dateFrom=2025-01-01&dateTo=2025-01-31&sortBy=tanggal&sortOrder=DESC
```

### Pagination

```bash
GET /search/v2?keyword=laporan&page=2&limit=10
```

---

## Additional Endpoints

### Health Check

```
GET /search/v2/health
```

Response:
```json
{
  "success": true,
  "message": "Meilisearch is healthy",
  "data": {
    "available": true
  }
}
```

### Index Statistics

```
GET /search/v2/stats
```

Response:
```json
{
  "success": true,
  "message": "Index stats retrieved",
  "data": {
    "numberOfDocuments": 1234,
    "isIndexing": false,
    "fieldDistribution": {}
  }
}
```

---

## Error Responses

### Meilisearch Unavailable

```json
{
  "success": false,
  "message": "Meilisearch is not available. Please check configuration.",
  "data": {
    "items": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
    "filters": { "applied": [] }
  }
}
```

### Authentication Error

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

## Differences from `/search` (SQL)

| Feature | `/search` (SQL) | `/search/v2` (Meilisearch) |
|---------|-----------------|---------------------------|
| Typo tolerance | ❌ | ✅ |
| Fuzzy matching | ❌ | ✅ |
| Speed | Slower for large datasets | Faster (indexed) |
| Relevance ranking | Basic | Advanced |
| Real-time updates | Immediate | ~1s delay |

Both endpoints accept the same query parameters and return the same response format for compatibility.
