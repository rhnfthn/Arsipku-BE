# Search V3 API Documentation (SQL-Only)

The `/search/v3` endpoint provides advanced search capabilities using **SQL-only** implementation with Meilisearch-like features.

## Overview

Search V3 is designed as a pure SQL alternative to Meilisearch-based Search V2, providing:

- **LIKE-based typo tolerance** - Flexible pattern matching
- **Relevance ranking** - Score-based result ordering (0-100)
- **Highlighting** - Matched keywords wrapped in `<em>` tags
- **Faceted search** - Filter counts for sidebar navigation

## Base URL

```
GET /search/v3
```

## Authentication

Requires JWT Bearer token in Authorization header.

```
Authorization: Bearer <your_jwt_token>
```

## Access Control

Search results are **automatically filtered** based on the authenticated user's position. Users only see documents where they are involved as:

- **Pengirim** (Sender)
- **Penerima** (Recipient)  
- **Tembusan** (CC)

This is enforced via the `naskah_sirkulasi` table join which filters by user's position ID.

---

## Query Parameters

### Search Terms

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyword` | string | Main search term (searches perihal, nomor, klasifikasi) |
| `perihal` | string | Search specifically in perihal/subject |
| `hasWords` | string | Must contain these words (space-separated) |
| `doesntHave` | string | Exclude documents containing these words (space-separated) |
| `from` | string | Search in sender name/position/organization |
| `to` | string | Search in recipient name/position/organization |
| `nomor` | string | Search by document number |

### Filters

| Parameter | Type | Values | Description |
|-----------|------|--------|-------------|
| `jenis` | enum | `ND`, `SDI`, `SDE`, `DI`, `KA`, `K` | Document type filter |
| `sifat` | enum | `sangat_rahasia`, `rahasia`, `terbatas`, `biasa`, `terbuka` | Confidentiality level |
| `status` | enum | `draf`, `final`, `final_tte` | Document status |
| `klasifikasi` | string | - | Classification code (partial match) |
| `hasAttachment` | boolean | `true`, `false` | Filter by attachment presence |
| `scope` | enum | `inbox`, `sent`, `draft`, `all`, `active`, `archived`, `favorite`, `priority` | Filter by folder/source |

#### Jenis (Document Type) Reference

| Code | Description |
|------|-------------|
| `ND` | Nota Dinas |
| `SDI` | Surat Dinas Internal |
| `SDE` | Surat Dinas Eksternal |
| `DI` | Disposisi Internal |
| `KA` | Kajian |
| `K` | Konsep |

#### Scope Filter Behavior

| Scope | Description |
|-------|-------------|
| `all` | All final naskah user has access to |
| `active` | All naskah excluding archived |
| `inbox` | Naskah where user is penerima/tembusan (excluding archived) |
| `sent` | Naskah where user is pengirim (excluding archived) |
| `draft` | Draft naskah only (excluding archived) |
| `archived` | Archived naskah only |
| `favorite` | Favorited naskah only |
| `priority` | Priority disposisi only (jenis=DI with is_priority=1, excluding archived) |

### Date Filters

| Parameter | Type | Format | Description |
|-----------|------|--------|-------------|
| `dateFrom` | string | `YYYY-MM-DD` | Start date range |
| `dateTo` | string | `YYYY-MM-DD` | End date range |
| `dateWithin` | enum | See below | Relative date range |
| `dateReference` | string | `YYYY-MM-DD` | Reference date for dateWithin |

#### DateWithin Values

| Value | Description |
|-------|-------------|
| `1_day` | Within 1 day |
| `3_days` | Within 3 days |
| `1_week` | Within 1 week |
| `2_weeks` | Within 2 weeks |
| `1_month` | Within 1 month |
| `2_months` | Within 2 months |
| `6_months` | Within 6 months |
| `1_year` | Within 1 year |

### Organization Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `areaFrom` | string | Filter by sender's area |
| `subAreaFrom` | string | Filter by sender's sub-area |
| `organizationFrom` | string | Filter by sender's organization |

### Hierarchical Label Filter (Gmail-style)

Filter documents by labels that support hierarchy (e.g., `Parent/Child/Grandchild`). Filtering by a parent label includes all nested children.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `label` | string | `Work/Projects/Q1` | Full label path, slash-separated |

#### Label Filter Behavior

- **Parent Filter:** `label=Work` returns all documents labeled `Work`, `Work/Projects`, `Work/Invoices`, etc.
- **Exact Path:** The path must match the hierarchy structure exactly.

#### Usage Examples

```bash
# Filter by top-level label (includes all sub-labels)
GET /search/v3?label=Work

# Filter by nested label
GET /search/v3?label=Work/Projects/Q1

# Combine with other filters
GET /search/v3?label=Work&scope=inbox&jenis=ND
```

### Unread Status Filter

Filter documents based on whether they have been read by the current user.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `isRead` | boolean | `false` | `true` for read, `false` for unread items |

#### isRead Filter Behavior

- **Context:** Filters based on the **current user's** read status in the `naskah_sirkulasi` table.
- **Combination:** Can be combined with other filters like `scope` or `label`.

#### Usage Examples

```bash
# Filter for UNREAD documents in Inbox
GET /search/v3?isRead=false&scope=inbox

# Filter for READ documents regardless of location
GET /search/v3?isRead=true

# Combine with label filter
GET /search/v3?isRead=false&label=Work/Urgent
```

### Pagination & Sorting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (min: 1) |
| `limit` | number | 20 | Items per page (min: 1, max: 100) |
| `sortBy` | string | `tanggal` | Sort field |
| `sortOrder` | enum | `DESC` | Sort direction (`ASC`, `DESC`) |
| `position_id` | string | JWT position | Override user position for search |

#### Sort Fields

| Value | Description |
|-------|-------------|
| `tanggal` | Document date |
| `nomor` | Document number |
| `perihal` | Subject |
| `jenis` | Document type |
| `created` | Created timestamp |

> **Note:** When `keyword` is provided, results are first sorted by `relevance_score DESC`, then by the specified sort field.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "message": "Ditemukan 42 naskah",
  "data": {
    "items": [
      {
        "id": "uuid-naskah",
        "id_sirkulasi": "uuid-sirkulasi",
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
        "read_time": "2025-01-15T10:30:00.000Z",
        "isArchived": false,
        "isFavorite": false,
        "priority": false,
        "relevance_score": 100,
        "createdAt": "2025-01-15T08:30:00.000Z",
        "_formatted": {
          "perihal": "Permohonan <em>Cuti</em> Tahunan",
          "nomor": "ND/123/2025"
        }
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
    },
    "facets": {
      "jenis": {
        "ND": 25,
        "SDI": 10,
        "SDE": 7
      },
      "status": {
        "final": 15,
        "final_tte": 27
      },
      "sifat": {
        "biasa": 30,
        "terbatas": 8,
        "rahasia": 4
      },
      "label": {
        "Work": 50,
        "Work/Projects": 25,
        "Personal": 15
      },
      "isRead": {
        "true": 37,
        "false": 5
      }
    }
  }
}
```

### Response Fields

#### Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Naskah UUID |
| `id_sirkulasi` | string | Sirkulasi UUID (for toggle-flag API) |
| `jenis` | string | Document type code |
| `jenisText` | string | Document type label |
| `nomor` | string | Document number |
| `tanggal` | Date | Document date |
| `perihal` | string | Subject |
| `sifat` | string | Confidentiality level |
| `status` | string | Document status |
| `klasifikasi` | string | Classification code |
| `klasifikasiText` | string | Classification label |
| `pengirim` | object | Sender information |
| `penerima` | array | Recipients list |
| `lampiranCount` | number | Attachment count |
| `hasAttachment` | boolean | Has attachments flag |
| `finalPdf` | string | Final PDF path |
| `source` | enum | Source type (`inbox`, `sent`, `draft`, `cc`) |
| `sourceLabel` | string | Source label in Indonesian |
| `userRoles` | array | User's roles in this document |
| `isRead` | boolean | Read status flag |
| `read_time` | Date | Actual read timestamp |
| `isArchived` | boolean | Archive status |
| `isFavorite` | boolean | Favorite status |
| `priority` | boolean | Priority flag (only for jenis=DI, otherwise false) |
| `relevance_score` | number | Relevance score (0-100) |
| `createdAt` | Date | Creation timestamp |
| `_formatted` | object | Highlighted fields with `<em>` tags |

#### Source Values

| Value | Label | Description |
|-------|-------|-------------|
| `inbox` | Kotak Masuk | User is recipient |
| `sent` | Terkirim | User is sender |
| `draft` | Draft | Document is draft |
| `cc` | Tembusan | User is CC |

---

## Example Requests

### Basic Search

```bash
GET /search/v3?keyword=permohonan
```

### Search with Filters

```bash
GET /search/v3?keyword=nota&jenis=ND&sifat=biasa&scope=inbox
```

### Date Range Search

```bash
GET /search/v3?dateFrom=2025-01-01&dateTo=2025-01-31&sortBy=tanggal&sortOrder=DESC
```

### Date Within Search

```bash
GET /search/v3?dateWithin=1_week&dateReference=2025-01-15
```

### Advanced Text Search

```bash
# Must contain "laporan" but not "bulanan"
GET /search/v3?hasWords=laporan&doesntHave=bulanan
```

### Sender/Recipient Search

```bash
# From specific sender
GET /search/v3?from=John%20Doe

# To specific recipient
GET /search/v3?to=Divisi%20SDM
```

### Organization Filter

```bash
GET /search/v3?areaFrom=Kantor%20Pusat&organizationFrom=Divisi%20IT
```

### Pagination

```bash
GET /search/v3?keyword=laporan&page=2&limit=10
```

### Custom Position

```bash
# Use different position (for delegation/multiple positions)
GET /search/v3?keyword=rapat&position_id=pos-uuid-123
```

---

## Relevance Scoring

When `keyword` is provided, results are scored based on match position:

| Match Type | Score |
|------------|-------|
| Perihal starts with keyword | 100 |
| Nomor starts with keyword | 90 |
| Klasifikasi starts with keyword | 80 |
| Contains keyword anywhere | 50 |

Results are sorted by `relevance_score DESC` first, then by the specified sort field.

---

## Highlighting

When `keyword` is provided, the `_formatted` object contains highlighted versions of `perihal` and `nomor` fields with matched keywords wrapped in `<em>` tags:

```json
{
  "_formatted": {
    "perihal": "Permohonan <em>Cuti</em> Tahunan",
    "nomor": "ND/<em>123</em>/2025"
  }
}
```

---

## Faceted Search

The response includes `facets` object with counts for sidebar filter navigation:

```json
{
  "facets": {
    "jenis": {
      "ND": 25,
      "SDI": 10,
      "SDE": 7
    },
    "status": {
      "final": 15,
      "final_tte": 27
    },
    "sifat": {
      "biasa": 30,
      "terbatas": 8,
      "rahasia": 4
    },
    "label": {
      "Work": 50,
      "Work/Projects": 25,
      "Work/Projects/Q1": 10,
      "Personal": 30
    },
    "isRead": {
      "true": 150,
      "false": 5
    }
  }
}
```

### Facet Descriptions

| Facet | Description |
|-------|-------------|
| `jenis` | Document type counts |
| `status` | Document status counts |
| `sifat` | Confidentiality level counts |
| `label` | Hierarchical label path counts (full paths like "Work/Projects") |
| `isRead` | Read/unread counts based on current user's read status |

Facets are calculated based on the user's accessible documents only.

---

## Error Responses

### Authentication Error

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Validation Error

```json
{
  "statusCode": 400,
  "message": [
    "page must not be less than 1",
    "limit must not be greater than 100"
  ],
  "error": "Bad Request"
}
```

---

## Comparison: V2 (Meilisearch) vs V3 (SQL)

| Feature | `/search/v2` (Meilisearch) | `/search/v3` (SQL) |
|---------|---------------------------|-------------------|
| Typo tolerance | ✅ Native fuzzy | ✅ LIKE-based |
| Fuzzy matching | ✅ Advanced | ⚠️ Basic wildcard |
| Speed (large dataset) | ✅ Very fast (indexed) | ⚠️ Depends on DB |
| Relevance ranking | ✅ Advanced ML | ✅ Score-based |
| Highlighting | ✅ Native | ✅ Regex-based |
| Faceted search | ✅ Native | ✅ COUNT queries |
| Real-time updates | ⚠️ ~1s delay | ✅ Immediate |
| External dependency | ❌ Requires Meilisearch | ✅ None (SQL only) |
| `id_sirkulasi` field | ❌ | ✅ |
| `read_time` timestamp | ❌ | ✅ |
| `relevance_score` | ❌ | ✅ |

### When to Use V3

- When Meilisearch is unavailable or not configured
- When you need immediate consistency (no sync delay)
- When you need `id_sirkulasi` for toggle-flag operations
- When you need the actual `read_time` timestamp
- For smaller datasets where SQL performance is acceptable

### When to Use V2

- For large datasets requiring fast search
- When typo tolerance is critical
- When advanced relevance ranking is needed

---

## Technical Details

### Database Tables

- `naskah` - Main document table
- `naskah_sirkulasi` - Document circulation/routing table

### Query Structure

1. **Base filter**: User position access via `naskah_sirkulasi.position`
2. **Scope filter**: Applies based on `scope` parameter
3. **Search filters**: LIKE patterns for text search
4. **Count query**: Gets total matching documents
5. **Main query**: Fetches paginated results with relevance scoring
6. **Facet queries**: Separate COUNT GROUP BY queries

### Performance Considerations

- Uses `DISTINCT` to prevent duplicate results from multiple sirkulasi entries
- Pengirim/penerima info fetched in batch queries to reduce N+1 issues
- Facet queries use minimal WHERE clauses for better performance

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-15 | Initial release |
| 1.1.0 | 2026-02-04 | Added `id_sirkulasi`, `read_time`, `relevance_score` fields |
