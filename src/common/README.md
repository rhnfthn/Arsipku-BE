# Common Module - Best Practices Implementation

Implementasi best practices untuk NestJS dengan struktur folder `common/` yang terorganisir.

## 📁 Struktur Folder

```
src/common/
├── decorators/          # Custom decorators
│   ├── current-user.decorator.ts
│   ├── roles.decorator.ts
│   ├── public.decorator.ts
│   └── index.ts
├── filters/            # Exception filters
│   ├── http-exception.filter.ts
│   ├── all-exceptions.filter.ts
│   └── index.ts
├── guards/             # Route guards
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── index.ts
├── interceptors/       # Interceptors
│   ├── logging.interceptor.ts
│   ├── transform-response.interceptor.ts
│   ├── timeout.interceptor.ts
│   └── index.ts
├── pipes/              # Custom pipes
│   ├── validation.pipe.ts
│   ├── parse-int.pipe.ts
│   └── index.ts
├── interfaces/         # Shared interfaces
│   ├── response.interface.ts
│   ├── user.interface.ts
│   ├── pagination.interface.ts
│   └── index.ts
├── middleware/         # Custom middleware
│   ├── logger.middleware.ts
│   └── index.ts
├── enums/             # Application enums
│   ├── gender.enum.ts
│   ├── organization.enum.ts
│   └── index.ts
└── index.ts           # Export all
```

## 🎯 Usage Examples

### 1. Decorators

#### @CurrentUser() - Get current authenticated user
```typescript
import { CurrentUser } from 'src/common/decorators';

@Controller('profile')
export class ProfileController {
  @Get()
  getProfile(@CurrentUser() user: any) {
    return user;
  }

  // Get specific property
  @Get('id')
  getUserId(@CurrentUser('id') userId: string) {
    return userId;
  }
}
```

#### @Roles() - Role-based access control
```typescript
import { Roles } from 'src/common/decorators';
import { RolesGuard } from 'src/common/guards';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin', 'superadmin')
  getAllUsers() {
    return 'Only admin and superadmin can access';
  }
}
```

#### @Public() - Skip authentication
```typescript
import { Public } from 'src/common/decorators';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
```

### 2. Guards

#### JWT Auth Guard - Protect routes
```typescript
import { JwtAuthGuard } from 'src/common/guards';

// Apply to entire controller
@Controller('protected')
@UseGuards(JwtAuthGuard)
export class ProtectedController {
  @Get()
  getData() {
    return 'This is protected';
  }
}

// Or apply to specific routes
@Controller('mixed')
export class MixedController {
  @Public()
  @Get('public')
  publicRoute() {
    return 'Public access';
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  privateRoute() {
    return 'Requires authentication';
  }
}
```

#### Roles Guard - Role-based authorization
```typescript
import { JwtAuthGuard, RolesGuard } from 'src/common/guards';
import { Roles } from 'src/common/decorators';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('dashboard')
  @Roles('admin')
  adminDashboard() {
    return 'Admin only';
  }

  @Delete('users/:id')
  @Roles('superadmin')
  deleteUser(@Param('id') id: string) {
    return 'Superadmin only';
  }
}
```

### 3. Interceptors

Interceptors sudah applied globally di `main.ts`:
- ✅ `TransformResponseInterceptor` - Auto wraps responses

Response otomatis menjadi:
```json
{
  "success": true,
  "data": { ... }
}
```

Untuk logging per controller/route:
```typescript
import { LoggingInterceptor } from 'src/common/interceptors';

@Controller('products')
@UseInterceptors(LoggingInterceptor)
export class ProductsController {
  // All routes will be logged
}
```

### 4. Filters

Exception filters sudah applied globally di `main.ts`.

Error response format:
```json
{
  "success": false,
  "statusCode": 404,
  "timestamp": "2025-12-07T12:00:00.000Z",
  "message": "Resource not found",
  "error": "Not Found"
}
```

Custom exception:
```typescript
throw new HttpException(
  {
    success: false,
    message: 'Custom error message',
    errors: ['Detail 1', 'Detail 2']
  },
  HttpStatus.BAD_REQUEST
);
```

### 5. Interfaces

```typescript
import { ApiResponse, PaginatedResponse } from 'src/common/interfaces';

// Standard response
async findOne(id: string): Promise<ApiResponse<User>> {
  const user = await this.userRepository.findOne(id);
  return {
    success: true,
    data: user,
    message: 'User found'
  };
}

// Paginated response
async findAll(page: number, limit: number): Promise<PaginatedResponse<User>> {
  const [users, total] = await this.userRepository.findAndCount({
    skip: (page - 1) * limit,
    take: limit
  });

  return {
    success: true,
    data: users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}
```

## 🚀 Global Configuration

File `main.ts` sudah dikonfigurasi dengan:

1. ✅ Global Exception Filters (error handling)
2. ✅ Global Response Interceptor (consistent response format)
3. ✅ Global Validation Pipe (DTO validation)
4. ✅ CORS enabled

## 📝 Next Steps

### Implement Authentication (JWT)
Untuk menggunakan guards secara optimal, install dependencies:

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt
```

Lalu buat auth module dengan JWT strategy.

### Apply Guards Globally
Untuk protect semua routes by default:

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
```

Dengan ini, semua routes protected by default, kecuali yang pakai `@Public()`.

## 🎨 Benefits

1. ✅ **Consistent Error Handling** - Semua error format sama
2. ✅ **Consistent Response Format** - Semua success response wrapped
3. ✅ **Reusable Components** - Guards, interceptors, pipes bisa dipakai dimana saja
4. ✅ **Type Safety** - Interfaces untuk type checking
5. ✅ **Scalable** - Mudah menambah decorators/guards baru
6. ✅ **Maintainable** - Code terorganisir dan mudah di-maintain
7. ✅ **Production Ready** - Best practices untuk production
