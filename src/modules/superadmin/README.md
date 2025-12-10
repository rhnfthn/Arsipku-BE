# Admin Module - User Management System

## 📋 Overview

Module untuk manajemen user roles (Admin & Superadmin) dengan audit trail lengkap.

## 🎯 Features

✅ **User Management**
- Search dan list semua karyawan dari `pa_personal`
- Filter by role (admin/superadmin) 
- Filter by nama, username, atau persnum

✅ **Role Assignment**
- Assign role admin/superadmin ke user
- Remove role (revert ke user biasa)
- Hanya Superadmin yang bisa assign/remove

✅ **Audit Trail**
- Setiap assignment/removal dicatat di `user_role_history`
- Tracking siapa yang assign, kapan, dan action apa

✅ **Security**
- Guard-based access control
- Admin bisa view list, Superadmin bisa assign/remove
- Integration dengan existing auth system

## 📊 Database Schema

### Table: `user_role`
```sql
id            CHAR(36) PRIMARY KEY
persnum       INT NOT NULL UNIQUE
role          ENUM('admin', 'superadmin')
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

### Table: `user_role_history`
```sql
id            CHAR(36) PRIMARY KEY
persnum       INT NOT NULL
role          VARCHAR(20)
action        ENUM('assigned', 'removed')
assigned_by   INT NOT NULL
created_at    TIMESTAMP
```

## 🔌 API Endpoints

### 1. GET /admin/users
**List all users with their roles**

**Access:** Admin & Superadmin

**Query Parameters:**
- `search` (optional): Search by name, username, or persnum
- `role` (optional): Filter by role ('admin' | 'superadmin')

**Response:**
```json
{
  "success": true,
  "message": "Berhasil mengambil data pengguna",
  "data": {
    "users": [
      {
        "persnum": 12345,
        "name": "Budi Manager",
        "uname": "budi.manager",
        "role": "admin",
        "status": "aktif",
        "assigned_at": "2025-12-10T10:00:00Z"
      }
    ],
    "summary": {
      "total": 100,
      "total_admin": 5,
      "total_superadmin": 2,
      "total_regular_users": 93
    }
  }
}
```

### 2. POST /admin/users/:persnum/role
**Assign role to user**

**Access:** Superadmin only

**Path Parameters:**
- `persnum`: User's persnum (number)

**Body:**
```json
{
  "role": "admin"  // or "superadmin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role admin berhasil diberikan kepada user",
  "data": {
    "persnum": 12345,
    "role": "admin",
    "assigned_by": 99999,
    "assigned_at": "2025-12-10T10:00:00Z"
  }
}
```

### 3. DELETE /admin/users/:persnum/role
**Remove role from user**

**Access:** Superadmin only

**Path Parameters:**
- `persnum`: User's persnum (number)

**Response:**
```json
{
  "success": true,
  "message": "Role admin berhasil dihapus, user kembali menjadi user biasa",
  "data": {
    "persnum": 12345,
    "previous_role": "admin",
    "removed_by": 99999,
    "removed_at": "2025-12-10T10:00:00Z"
  }
}
```

## 🔐 Access Control Matrix

| Endpoint | Admin | Superadmin | User |
|----------|-------|------------|------|
| GET /admin/users | ✅ | ✅ | ❌ |
| POST /admin/users/:persnum/role | ❌ | ✅ | ❌ |
| DELETE /admin/users/:persnum/role | ❌ | ✅ | ❌ |

## 🔄 Integration Flow

### Login Flow (Automatic Role Detection)
```
1. User login via SSO/Direct
2. AuthService checks pa_personal (persnum)
3. AuthService checks user_role table
4. If found → role = 'admin' or 'superadmin'
5. If not found → role = 'user' (default)
6. JWT generated with role in payload
7. Guards automatically enforce access based on role
```

### Assignment Flow
```
1. Superadmin opens User Management page
2. Search user by name/persnum
3. Click "Assign Role" button
4. Select role (Admin/Superadmin)
5. POST /admin/users/:persnum/role
6. Record saved to user_role
7. History logged to user_role_history
8. Next login, user will have new role
```

## 🛡️ Guards Used

- **JwtAuthGuard** (Global): Validate JWT token
- **RolesGuard**: Check user.role from JWT payload
- **@Roles('admin', 'superadmin')**: Decorator untuk restrict endpoints

## 📝 Migration

Run migration file:
```bash
# Location: db/migrations/20251210_create_user_role_tables.sql
mysql -u username -p database_name < db/migrations/20251210_create_user_role_tables.sql
```

## 🧪 Testing

### Test Scenarios

**1. List Users**
```bash
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3000/admin/users?search=budi
```

**2. Assign Admin Role**
```bash
curl -X POST \
  -H "Authorization: Bearer <superadmin_token>" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' \
  http://localhost:3000/admin/users/12345/role
```

**3. Remove Role**
```bash
curl -X DELETE \
  -H "Authorization: Bearer <superadmin_token>" \
  http://localhost:3000/admin/users/12345/role
```

## 📌 Notes

- ✅ **Secure**: Hanya Superadmin yang bisa assign/remove
- ✅ **Audit Trail**: Semua action tercatat dengan timestamp & actor
- ✅ **No Hardcode**: Semua admin dari database, bukan hardcode
- ✅ **Integration**: Seamless dengan existing auth system
- ⚠️ **Active Users Only**: Hanya user dengan `end_date = '9999-12-31'` yang bisa di-assign
- ⚠️ **Unique Constraint**: 1 user = 1 role (tidak bisa dobel)

## 🚀 Future Enhancements (Optional)

- [ ] Role expiry (temporary admin)
- [ ] Email notification saat di-assign/remove
- [ ] Dashboard admin statistics
- [ ] Bulk assignment
- [ ] Permission override per user
