# CLAUDE.md

Context for Claude Code working with Core-Avantle-AI repository - Multi-Tenant Control Plane API.

## 🚀 **PROJECT OVERVIEW: Core-Avantle-AI Control Plane API**

**Core-Avantle-AI** - RESTful API backend serving as the multi-tenant control plane for the Avantle Privacy Platform ecosystem.

**Current Status: VERSION 1.0.2 - GitHub Integration & Production Deployment**

### Latest Achievements (January 4, 2026)
- ✅ **GITHUB INTEGRATION**: Repository created and connected to avantlehq/core-avantle-ai
- ✅ **VERSION MANAGEMENT**: Added comprehensive version tracking system
- ✅ **DEPLOYMENT READY**: Configured for stable Vercel production deployment
- ✅ **GIT WORKFLOW**: Established proper Git workflow with remote origin
- ✅ **CHANGELOG SYSTEM**: Complete version history tracking implemented
- ✅ **CONSISTENCY**: Aligned with avantle.ai and dpia.avantle.ai version standards

### Foundation Achievements  
- ✅ **Multi-Tenant Architecture**: Partner → Tenant → Runtime hierarchy
- ✅ **RESTful API**: Comprehensive endpoint coverage with OpenAPI documentation
- ✅ **Authentication System**: JWT-based auth with role-based access control
- ✅ **Database Integration**: Prisma ORM with SQLite for development
- ✅ **Security Framework**: RBAC with 4-tier permission system

### Production Status
**URL**: https://core-avantle-ezuyyhjei-ramix24s-projects.vercel.app

**Core Features Complete:**
- ✅ **Partner Management**: Full CRUD operations for partner organizations
- ✅ **Tenant Management**: Complete tenant lifecycle management  
- ✅ **Admin Dashboard**: Statistics and monitoring endpoints
- ✅ **Authentication**: JWT token generation and validation
- ✅ **Domain Management**: Custom domain configuration for tenants
- ✅ **Usage Tracking**: API usage analytics and monitoring

**Technical Stack:**
- Framework: Fastify + TypeScript
- Database: Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- Authentication: JWT with bcryptjs password hashing
- API Documentation: Swagger/OpenAPI 3.0
- Deployment: Vercel serverless functions
- Testing: Vitest with coverage reporting
- Version Management: Semantic versioning with changelog system

## Architecture Context

### Multi-Tier Platform Architecture
```
Partner Browser → avantle.ai (Frontend) → core.avantle.ai (Control Plane API) → dpia.avantle.ai (Runtime)
```

**Core API Role:**
- **Control Plane Backend** - Central API for platform administration
- **Multi-Tenant Management** - Partner and tenant lifecycle management
- **Authentication Authority** - JWT token generation and validation
- **Usage Monitoring** - API analytics and platform statistics

### Role-Based Access Control (RBAC)
- **Platform Admin** - Full system administration across all partners
- **Partner Admin** - Partner-specific management and tenant creation
- **Tenant Admin** - Tenant-specific management and user administration  
- **Tenant User** - Basic tenant access and usage

### API Endpoints Structure
- **Authentication**: `/auth/login`, `/auth/refresh`, `/auth/validate`
- **Partners**: `/partners` (CRUD operations)
- **Tenants**: `/tenants` (CRUD operations with partner isolation)
- **Admin**: `/admin/stats`, `/admin/activity`, `/admin/system`
- **Health**: `/health`, `/api/health` (monitoring endpoints)
- **Domains**: `/domains` (custom domain management)
- **Usage**: `/usage` (analytics and tracking)

## Technical Architecture

### API Design Principles
- **RESTful Standards**: Consistent HTTP methods and status codes
- **JSON-First**: All requests/responses in JSON format
- **Error Handling**: Standardized error responses with correlation IDs
- **Rate Limiting**: Per-endpoint rate limiting for API protection
- **CORS Support**: Cross-origin requests for frontend integration

### Database Schema
- **Partners**: Organization-level entities with billing information
- **Tenants**: Product instances under partner management
- **Users**: Authentication and role-based access
- **Domains**: Custom domain configurations for whitelabel access
- **Usage**: API usage tracking and analytics data

### Security Implementation
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs for secure password storage
- **RBAC Middleware**: Role-based access control for all endpoints
- **Request Validation**: Zod schema validation for all inputs
- **CORS Protection**: Configured cross-origin resource sharing

## Development Workflow

### Version Management Rules
**⚠️ MANDATORY: Always update version after EVERY deployment (including debug/fix deployments)!**

**STRICT VERSION POLICY:**
1. **Every Git Push = Version Bump** - No exceptions, even for small fixes
2. **Always Report Version** - Write the new version number in chat after every deployment
3. **Update Both Files** - `src/lib/version.ts` + `package.json` 
4. **Complete Changelog** - Add entry to CHANGELOG with date and changes
5. **Semantic Versioning** - Use x.y.z format (major.minor.patch)

**Version Update Process:**
1. Update `src/lib/version.ts` (VERSION, VERSION_NAME, CHANGELOG entry)
2. Update `package.json` version to match
3. Commit with detailed version bump message including new version number
4. Push to production (auto-deploys to Vercel)
5. **ALWAYS write in chat: "🚀 Deployed VERSION X.Y.Z - Description"**

### Development Commands
```bash
npm run dev           # Start dev server with watch mode
npm run build         # Build for production (Vercel handles this)
npm run test          # Run test suite with Vitest
npm run test:coverage # Run tests with coverage report
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run database migrations
npm run lint          # Run TypeScript linting
git add . && git commit -m "message" && git push origin main
```

### File Structure
```
core-avantle-ai/
├── src/
│   ├── routes/           # API endpoint handlers
│   ├── middleware/       # Authentication, RBAC, error handling
│   ├── services/         # Business logic layer
│   ├── lib/              # Utilities and configuration
│   ├── types/            # TypeScript type definitions
│   ├── schemas/          # Zod validation schemas
│   └── server.ts         # Main application entry point
├── prisma/
│   └── schema.prisma     # Database schema definition
├── tests/                # Test suite
└── vercel.json           # Deployment configuration
```

## Business Context

### Platform Ecosystem
- **core.avantle.ai**: Multi-tenant control plane API (this project)
- **avantle.ai**: Control plane frontend interface
- **dpia.avantle.ai**: GDPR assessment runtime platform
- **Partner domains**: Whitelabel CNAME routing (e.g., gdpr.havelka.sk)

### Target Integrations
- **Frontend Applications**: React/Next.js admin consoles
- **Partner APIs**: Third-party integrations via REST API
- **Analytics Platforms**: Usage tracking and monitoring systems
- **Authentication Systems**: SSO and enterprise identity providers

### Business Value
- **Scalable SaaS**: Multi-tenant architecture for unlimited growth
- **API-First**: Headless architecture enabling multiple frontend experiences
- **Enterprise Ready**: RBAC, audit trails, and compliance features
- **White-Label**: Custom domain support for partner branding

## 🎯 **DEVELOPMENT STATUS**

### **VERSION 1.0.2: GITHUB INTEGRATION & PRODUCTION DEPLOYMENT READY ✅**
- **GIT INTEGRATION**: Connected to GitHub with proper remote configuration
- **VERSION SYSTEM**: Complete version management with changelog tracking
- **DEPLOYMENT CONFIG**: Prepared for stable Vercel production deployment
- **API FOUNDATION**: Full REST API with authentication and multi-tenant support

### **DEPLOYMENT REQUIREMENTS**

#### **Database Configuration** 🔧
- **Development**: SQLite with Prisma for local development
- **Production**: PostgreSQL on Vercel/Supabase for scalability
- **Migrations**: Prisma migrations for schema updates
- **Seeding**: Initial data setup for development and testing

#### **Environment Variables** 📋
- **DATABASE_URL**: Production database connection string
- **JWT_SECRET**: Secret key for JWT token signing
- **VERCEL_ENV**: Environment detection for proper configuration
- **CORS_ORIGIN**: Allowed origins for cross-origin requests

#### **Vercel Configuration** ⚙️
- **API Routes**: Configured for serverless function deployment
- **Build Process**: No build step required for direct TypeScript execution
- **Environment**: Automatic environment variable injection
- **Custom Domains**: Support for core.avantle.ai production domain

**Local Path**: `C:\Users\rasti\Projects\avantlehq\core-avantle-ai\`

## Version History

### v1.0.2 "GitHub Integration & Production Deployment" (2026-01-04)
- 🔧 **GITHUB INTEGRATION**: Repository created and connected to avantlehq/core-avantle-ai
- 📋 **VERSION MANAGEMENT**: Added comprehensive version tracking system
- 🚀 **DEPLOYMENT READY**: Configured for stable Vercel production deployment
- 🔗 **GIT WORKFLOW**: Established proper Git workflow with remote origin
- 📊 **CHANGELOG SYSTEM**: Complete version history tracking implemented
- 🎯 **CONSISTENCY**: Aligned with avantle.ai and dpia.avantle.ai version standards

### v1.0.1 "Production Deployment Documentation" (2026-01-04)
- 📚 **DOCUMENTATION**: Added production deployment documentation
- 🚀 **VERCEL DEPLOYMENT**: Core API deployed to Vercel platform
- 🔧 **SERVERLESS CONFIG**: Configured for serverless deployment
- ⚙️ **DEPLOYMENT FIX**: Fixed Vercel deployment configuration issues

### v1.0.0 "Core API Foundation" (2026-01-04)
- 🚀 **INITIAL RELEASE**: Core API with multi-tenant architecture
- 🏢 **PARTNER MANAGEMENT**: Full CRUD operations for partner organizations
- 🏗️ **TENANT MANAGEMENT**: Complete tenant lifecycle management
- 🔐 **AUTHENTICATION**: JWT-based auth with role-based access control
- 🎯 **API ENDPOINTS**: RESTful API with comprehensive endpoint coverage
- 📊 **ADMIN DASHBOARD**: Admin statistics and monitoring endpoints
- 🛡️ **SECURITY**: RBAC with 4-tier permission system
- 🔧 **FASTIFY FRAMEWORK**: High-performance API server with TypeScript
- 💾 **DATABASE**: Prisma ORM with SQLite for development