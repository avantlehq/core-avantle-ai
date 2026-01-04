# Avantle Core API

**Multi-tenant control plane for the Avantle Privacy Platform**

Core API provides centralized tenant management, authentication, and configuration for all Avantle products including DPIA, Notes, OSDM, and LMS platforms.

## 🏗️ Architecture

### Control Plane Design
- **Product-Agnostic**: Supports any product with opaque `product_key` identifiers
- **Multi-Tenant**: 3-level hierarchy (Platform → Partner → Tenant)
- **RBAC Security**: 4-tier role system with strict tenant isolation
- **Domain Management**: Custom hostname resolution with SSL verification
- **Usage Tracking**: Comprehensive metrics and quota management

### Technology Stack
- **Framework**: Fastify with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with role-based access control
- **Security**: bcryptjs, CORS, Helmet, Rate limiting
- **API Docs**: OpenAPI/Swagger with interactive UI

### Tenant Types
```typescript
enum TenantType {
  UI = "UI"           // Frontend applications
  API = "API"         // Backend/headless integrations  
  HYBRID = "HYBRID"   // Both UI and API capabilities
}
```

### Role-Based Access Control
```typescript
enum Role {
  PLATFORM_ADMIN = "PLATFORM_ADMIN"   // Full system access
  PARTNER_ADMIN = "PARTNER_ADMIN"     // Partner and tenant management
  TENANT_ADMIN = "TENANT_ADMIN"       // Single tenant administration
  TENANT_USER = "TENANT_USER"         // Standard tenant user
}
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm/pnpm

### Installation
```bash
# Clone repository
git clone https://github.com/avantlehq/core-avantle-ai.git
cd core-avantle-ai

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Seed initial data
npm run db:seed
```

### Development
```bash
# Start development server
npm run dev

# API available at http://localhost:3000
# Swagger docs at http://localhost:3000/docs
```

### Testing
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 📊 Database Schema

### Core Entities
- **Partner**: Top-level organization (e.g., consulting firm, enterprise)
- **Tenant**: Product instance (e.g., client.dpia.avantle.ai)
- **User**: Individual with role-based access to tenants
- **Domain**: Custom hostnames mapped to tenants
- **Plan**: Usage limits and quotas
- **ProductAccess**: Which products each tenant can use

### Key Features
- **Row Level Security (RLS)**: Automatic tenant isolation at database level
- **Audit Logging**: Comprehensive change tracking with correlation IDs
- **Usage Counters**: Granular usage tracking per product/environment/metric
- **Flexible Limits**: JSON-based quota system adaptable to any product

### ER Diagram
```mermaid
erDiagram
    Partner ||--o{ Tenant : "has many"
    Partner ||--o{ User : "created by"
    Tenant ||--o{ User : "has members"
    Tenant ||--o{ Domain : "owns"
    Tenant ||--o{ ProductAccess : "has access"
    Tenant ||--o{ UsageCounter : "tracks usage"
    Plan ||--o{ TenantPlan : "assigned to"
    User ||--o{ AuditLog : "performs actions"
```

## 🔐 API Authentication

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'
```

### Using Bearer Token
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Admin Console Integration
The API provides specialized endpoints for admin console dashboards:

```typescript
// Dashboard stats
GET /admin/stats

// Recent activity feed  
GET /admin/activity

// Domain resolution for product routing
GET /domains/resolve?hostname=client.dpia.avantle.ai
```

## 🏢 Multi-Tenant Usage

### Partner Creation (Platform Admin)
```bash
curl -X POST http://localhost:3000/partners \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Consulting",
    "billing_email": "billing@acme.com"
  }'
```

### Tenant Creation
```bash
curl -X POST http://localhost:3000/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acme-dpia-prod",
    "partner_id": "partner_123",
    "name": "Acme DPIA Production",
    "tenant_type": "UI"
  }'
```

### Domain Registration
```bash
curl -X POST http://localhost:3000/domains \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme-dpia-prod", 
    "hostname": "dpia.acme.com"
  }'
```

### Usage Tracking
```bash
curl -X POST http://localhost:3000/usage/record \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme-dpia-prod",
    "product_key": "dpia", 
    "environment": "PRODUCTION",
    "metric_key": "assessments",
    "value": 1,
    "period_start": "2024-01-01T00:00:00Z"
  }'
```

## 🔌 Product Integration

### Domain Resolution
Products can resolve hostnames to tenant information:

```typescript
// Get tenant info for incoming request
const response = await fetch(`${CORE_API}/domains/resolve?hostname=${req.hostname}`)
const { tenant_id, tenant_type } = await response.json()

// Configure product for specific tenant
const tenantConfig = await loadTenantConfig(tenant_id)
```

### Usage Reporting
Products should report usage metrics:

```typescript
// Report assessment creation
await fetch(`${CORE_API}/usage/record`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tenant_id,
    product_key: 'dpia',
    environment: 'PRODUCTION',
    metric_key: 'assessments',
    value: 1,
    period_start: new Date().toISOString()
  })
})
```

## 📝 API Documentation

### Interactive Docs
- **Swagger UI**: http://localhost:3000/docs
- **OpenAPI Spec**: http://localhost:3000/docs/json

### Key Endpoints

#### Authentication
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info

#### Partners (Platform Admin)
- `GET /partners` - List partners
- `POST /partners` - Create partner
- `PUT /partners/:id` - Update partner

#### Tenants (Platform/Partner Admin)
- `GET /tenants` - List accessible tenants
- `POST /tenants` - Create tenant
- `PUT /tenants/:id` - Update tenant

#### Domains
- `GET /domains` - List domains
- `POST /domains` - Register domain  
- `POST /domains/:id/verify` - Verify domain
- `GET /domains/resolve` - Resolve hostname to tenant

#### Usage Tracking
- `POST /usage/record` - Record usage metric
- `GET /usage/tenant/:id` - Get tenant usage summary
- `GET /usage/global` - Global usage statistics (admin)

#### Plans & Quotas
- `GET /plans` - List available plans
- `POST /plans/attach` - Assign plan to tenant
- `GET /plans/tenant/:id/current` - Get tenant's current plan

#### System (Platform Admin)
- `GET /system/info` - System information
- `GET /system/metrics` - System metrics
- `GET /system/audit-logs` - Audit trail

## 🧪 Testing

### Test Structure
```
src/tests/
├── setup.ts           # Test environment configuration
├── auth.test.ts       # Authentication endpoints
├── partners.test.ts   # Partner management
├── tenants.test.ts    # Tenant operations  
├── domains.test.ts    # Domain management
└── usage.test.ts      # Usage tracking
```

### Test Database
Tests use a separate PostgreSQL database configured in `.env.test`. The test suite automatically:
- Creates/destroys test data for each test
- Mocks bcryptjs for faster execution  
- Runs in isolated environment with proper cleanup

### Running Tests
```bash
# All tests
npm test

# Specific test file
npm test -- auth.test.ts

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📋 Environment Configuration

### Required Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/avantle_core

# JWT Authentication  
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Admin User
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=secure-password

# Server
PORT=3000
NODE_ENV=production

# Security
CORS_ORIGIN=https://admin.avantle.ai
RATE_LIMIT_MAX=100

# System Limits
MAX_TENANTS_PER_PARTNER=100
MAX_DOMAINS_PER_TENANT=50
MAX_API_CLIENTS_PER_TENANT=10
```

### Development vs Production
- **Development**: Uses `.env` with relaxed CORS and higher rate limits
- **Production**: Strict CORS origins, rate limiting, and security headers
- **Testing**: Uses `.env.test` with disabled rate limiting and mock services

## 🚀 Deployment

### Database Migration
```bash
# Generate migration files
npx prisma migrate dev --name migration_name

# Apply to production
npx prisma migrate deploy

# Seed production data
npm run db:seed
```

### Build & Start
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup
1. **Database**: PostgreSQL 14+ with connection string in `DATABASE_URL`
2. **Secrets**: Generate secure `JWT_SECRET` (256-bit recommended)
3. **Admin User**: Configure initial admin credentials
4. **Security**: Set appropriate CORS origins and rate limits
5. **Monitoring**: Configure logging and metrics endpoints

## 🤝 Contributing

### Development Workflow
1. Create feature branch from `main`
2. Write tests for new functionality  
3. Implement feature with proper TypeScript types
4. Ensure all tests pass: `npm test`
5. Run linting: `npm run lint:fix`
6. Submit pull request with description

### Code Standards
- **TypeScript**: Strict mode with proper type definitions
- **Testing**: Comprehensive test coverage with Vitest
- **Security**: Input validation with Zod schemas
- **Documentation**: OpenAPI specs for all endpoints
- **Logging**: Structured logging with correlation IDs

## 📚 Additional Resources

- **Architecture Documentation**: See `docs/` folder for detailed system design
- **API Reference**: Interactive Swagger docs at `/docs` endpoint  
- **Database Schema**: ERD diagrams in `docs/database/` 
- **Product Integration**: Examples in `docs/integration/`
- **Security Guide**: Best practices in `docs/security/`

## 📞 Support

- **Issues**: GitHub Issues for bugs and feature requests
- **Documentation**: In-code comments and OpenAPI specs
- **Contact**: Core team via internal channels

---

**Avantle Core API** - Powering privacy-first multi-tenant platforms across Europe