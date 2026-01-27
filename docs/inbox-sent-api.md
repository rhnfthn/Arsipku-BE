# Inbox-Sent API Documentation

## Endpoint

**GET** `/naskah_sirkulasi/inbox-sent/:position_id`

Fetches both inbox (received) and sent messages for a given position ID, combined into a single sorted list with pagination.

---

## Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `position_id` | string | **Required.** The position ID to fetch messages for. |

---

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number for pagination. |
| `limit` | number | `10` | Number of items per page. |
| `source` | enum | - | Filter by source: `inbox` or `sent`. If omitted, returns both. |
| `jenis` | enum | - | Filter by document type: `ND`, `SDI`, `SDE`, `DI`, `KA`. |
| `status_baca` | enum | - | Filter by read status: `terbaca` or `belum_terbaca`. |
| `is_favorit` | boolean | - | Filter by favorit flag. Use `true` or `false`. |
| `is_arsip` | boolean | - | Filter by arsip (archive) flag. Use `true` or `false`. |

---

## Response

### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "message": "Berhasil mengambil data gabungan inbox dan sent",
  "data": [
    {
      "id_sirkulasi": "uuid-string",
      "id_naskah": "uuid-string",
      "source": "inbox",
      "jenis": "ND",
      "jenis_label": "Nota Dinas",
      "nomor": "ND/001/2026",
      "tanggal": "2026-01-27",
      "perihal": "Subject of the document",
      "sifat": "biasa",
      "status": "final",
      "lampiran": 2,
      "pengirim": {
        "position_id": "pos-123",
        "position_text": "Manager",
        "organization_text": "Department A",
        "nama": "John Doe"
      },
      "penerima": {
        "position_id": "pos-456",
        "persnum": 12345,
        "nama": "Jane Smith",
        "position_text": "Staff",
        "organization_text": "Department B"
      },
      "kepada": [...],
      "status_baca": "terbaca",
      "read_time": "2026-01-27T10:30:00Z",
      "is_favorit": false,
      "is_arsip": false,
      "is_note": false,
      "is_tindak_lanjut": false,
      "is_locked": false,
      "labels": ["Label 1", "Parent > Child"],
      "created_at": "2026-01-27T09:00:00Z",
      "updated_at": "2026-01-27T09:00:00Z",
      "is_priority": false
    },
    {
      "id_naskah": "uuid-string",
      "source": "sent",
      "jenis": "SDI",
      "jenis_label": "Surat Dinas Internal",
      "nomor": "SDI/002/2026",
      "tanggal": "2026-01-26",
      "perihal": "Sent document subject",
      "sifat": "segera",
      "status": "final_tte",
      "lampiran": 1,
      "pengirim": {
        "position_id": "pos-456",
        "position_text": "Manager",
        "organization_text": "Department B",
        "nama": "Jane Smith"
      },
      "penerima": [
        {
          "position_id": "pos-789",
          "position_text": "Director",
          "organization_text": "HQ",
          "nama": "Bob Johnson",
          "status_baca": "terbaca",
          "read_time": "2026-01-26T14:00:00Z"
        }
      ],
      "summary_baca": {
        "total": 1,
        "terbaca": 1,
        "belum_terbaca": 0
      },
      "favorit": true,
      "note": false,
      "arsip": false,
      "is_favorit": true,
      "is_arsip": false,
      "is_note": false,
      "is_tindak_lanjut": false,
      "is_locked": false,
      "labels": [],
      "created_at": "2026-01-26T08:00:00Z",
      "updated_at": "2026-01-26T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "total_pages": 15
  }
}
```

---

## Field Descriptions

### Common Fields

| Field | Type | Description |
|-------|------|-------------|
| `id_naskah` | string | Unique ID of the document. |
| `source` | enum | Indicates the origin: `inbox` or `sent`. |
| `jenis` | enum | Document type code. |
| `jenis_label` | string | Human-readable document type label. |
| `nomor` | string \| null | Document number. |
| `tanggal` | date | Document date. |
| `perihal` | string \| null | Document subject. |
| `sifat` | string | Document priority (e.g., `biasa`, `segera`). |
| `status` | string | Document status (`final`, `final_tte`). |
| `lampiran` | number | Number of attachments. |
| `is_favorit` | boolean | Whether the item is marked as favorite. |
| `is_arsip` | boolean | Whether the item is archived. |
| `is_note` | boolean | Whether the item has a note. |
| `labels` | string[] | Labels assigned to the document. |
| `created_at` | datetime | Creation timestamp. |
| `updated_at` | datetime | Last update timestamp. |

### Inbox-specific Fields

| Field | Type | Description |
|-------|------|-------------|
| `id_sirkulasi` | string | Unique sirkulasi ID (for inbox items). |
| `penerima` | object | Current user's recipient info. |
| `kepada` | array | All recipients of the document. |
| `status_baca` | enum | Read status: `terbaca` or `belum_terbaca`. |
| `read_time` | datetime \| null | When the item was read. |
| `is_tindak_lanjut` | boolean | Follow-up flag. |
| `is_locked` | boolean | Whether the item is locked. |
| `is_priority` | boolean | Priority flag (only for `DI` type). |

### Sent-specific Fields

| Field | Type | Description |
|-------|------|-------------|
| `penerima` | array | List of recipients with their read status. |
| `summary_baca` | object | Summary of read status across all recipients. |
| `favorit` | boolean | (Legacy) Favorite flag. |
| `note` | boolean | (Legacy) Note flag. |
| `arsip` | boolean | (Legacy) Archive flag. |

---

## Example Requests

### Get all items (inbox + sent)
```
GET /naskah_sirkulasi/inbox-sent/pos-123?page=1&limit=20
```

### Get inbox only
```
GET /naskah_sirkulasi/inbox-sent/pos-123?source=inbox&page=1&limit=10
```

### Get sent only
```
GET /naskah_sirkulasi/inbox-sent/pos-123?source=sent&page=1&limit=10
```

### Filter by document type
```
GET /naskah_sirkulasi/inbox-sent/pos-123?jenis=ND
```

### Get only favorited items
```
GET /naskah_sirkulasi/inbox-sent/pos-123?is_favorit=true
```

### Get archived items from inbox
```
GET /naskah_sirkulasi/inbox-sent/pos-123?source=inbox&is_arsip=true
```

### Combined filters
```
GET /naskah_sirkulasi/inbox-sent/pos-123?source=sent&jenis=SDI&is_favorit=true&page=2&limit=5
```
