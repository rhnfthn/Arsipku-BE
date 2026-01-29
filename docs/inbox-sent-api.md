# Inbox-Sent API Documentation

## Endpoint

**GET** `/naskah_sirkulasi/inbox-sent`

Fetches both inbox (received) and sent messages for the authenticated user, combined into a single sorted list with pagination.

> **Authentication Required**: This endpoint requires a valid JWT Bearer token. The position ID is automatically extracted from the authenticated user's token.

---

## Authentication

**Header Required:**
```
Authorization: Bearer <your_jwt_token>
```

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
      "is_favorit": false,
      "is_arsip": false,
      ...
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

### Error Response (Unauthorized)

**Status Code:** `401 Unauthorized`

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

## Example Requests

### Get all items (inbox + sent)
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/naskah_sirkulasi/inbox-sent?page=1&limit=20"
```

### Get inbox only
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/naskah_sirkulasi/inbox-sent?source=inbox"
```

### Get only favorited items
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/naskah_sirkulasi/inbox-sent?is_favorit=true"
```

### Combined filters
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/naskah_sirkulasi/inbox-sent?source=sent&jenis=SDI&page=2&limit=5"
```
