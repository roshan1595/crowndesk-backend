# CrownDesk Backend

Modern dental practice management system - **Backend API**

## 🚀 Tech Stack

- **Framework:** NestJS 10
- **Database:** PostgreSQL (Neon) + Prisma ORM
- **Authentication:** Clerk (JWT validation)
- **API:** RESTful + GraphQL (future)
- **Cache:** Redis Cloud
- **Queue:** Bull (Redis-based)
- **TypeScript:** Strict mode

## 📦 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+
- PostgreSQL (or Neon account)
- Redis (or Redis Cloud account)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Configure environment variables (see below)

# Generate Prisma client
pnpm prisma generate

# Run database migrations
pnpm prisma migrate deploy

# Seed database (optional)
pnpm prisma db seed
```

### Environment Variables

Create `.env` with:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/crowndesk

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# Redis
REDIS_URL=redis://default:password@host:6379

# Stedi EDI (270/271, 837D, 835)
STEDI_API_KEY=...
STEDI_PARTNER_ID=...

# Stripe Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Open Dental Sync
OPEN_DENTAL_API_KEY=...
OPEN_DENTAL_BASE_URL=https://...

# AWS S3 (Documents)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=crowndesk-documents
AWS_REGION=us-east-1

# AI Service
AI_SERVICE_URL=http://localhost:8001

# App Config
PORT=3001
NODE_ENV=development
```

### Development

```bash
# Start dev server (http://localhost:3001)
pnpm start:dev

# Build for production
pnpm build

# Start production server
pnpm start:prod

# Run tests
pnpm test

# Run e2e tests
pnpm test:e2e

# Lint code
pnpm lint
```

## 📁 Project Structure

```
crowndesk-backend/
├── src/
│   ├── main.ts                  # Application entry
│   ├── app.module.ts            # Root module
│   │
│   ├── auth/                    # Authentication
│   │   ├── clerk.guard.ts       # JWT validation
│   │   └── tenant.decorator.ts  # Multi-tenant
│   │
│   ├── patients/                # Patient module
│   │   ├── patients.controller.ts
│   │   ├── patients.service.ts
│   │   ├── patients.repository.ts
│   │   └── dto/                 # Data transfer objects
│   │
│   ├── appointments/            # Appointment module
│   ├── insurance/               # Insurance module
│   │   ├── eligibility/         # 270/271 EDI
│   │   └── policies/            # Policy management
│   │
│   ├── claims/                  # Claims processing
│   │   ├── submission/          # 837D EDI
│   │   ├── status/              # 276/277 EDI
│   │   └── remittance/          # 835 ERA
│   │
│   ├── billing/                 # Billing & invoicing
│   ├── treatment-plans/         # Treatment planning
│   ├── procedures/              # Procedure codes (CDT)
│   │
│   ├── pms-sync/                # Open Dental sync
│   │   ├── polling/             # Polling service
│   │   ├── writeback/           # Writeback (Phase 2)
│   │   └── conflict/            # Conflict resolution
│   │
│   ├── analytics/               # Analytics & reporting
│   ├── audit/                   # Audit logging
│   ├── webhooks/                # Webhook handlers
│   │
│   ├── prisma/                  # Prisma schema & migrations
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── common/                  # Shared utilities
│   │   ├── filters/             # Exception filters
│   │   ├── interceptors/        # Response interceptors
│   │   ├── pipes/               # Validation pipes
│   │   └── decorators/          # Custom decorators
│   │
│   └── config/                  # Configuration
│       ├── database.config.ts
│       ├── redis.config.ts
│       └── stedi.config.ts
│
├── scripts/
│   └── database/                # SQL scripts
│       ├── init-db.sql
│       └── init-db-prod.sql
│
├── shared-types/                # Shared with frontend
├── test/                        # Tests
└── docs/                        # Documentation
```

## 🔗 Key Features

### Multi-Tenant Architecture
Every request is isolated by `tenantId` (from Clerk `orgId`):

```typescript
@Get()
@UseGuards(ClerkGuard)
async findAll(@TenantId() tenantId: string) {
  return this.patientsService.findAll(tenantId);
}
```

### Patient Management
- CRUD operations
- Search with filters
- Family account linking
- Demographics & contact info

### Appointment Scheduling
- Create/update/cancel appointments
- Conflict detection
- Status workflow tracking
- Calendar view data

### Insurance Eligibility (270/271 EDI)
- Real-time verification via Stedi
- Parse 271 responses
- Store benefits information
- Coverage calculations

### Claims Processing (837D EDI)
- Build and submit claims
- Batch submission
- Status tracking (276/277)
- Payment posting (835 ERA)

### Billing & Invoicing
- Generate invoices
- Payment processing (Stripe)
- Statement generation
- Aging reports

### Open Dental Sync
- Polling-based sync (read)
- Conflict detection
- Approval-gated writeback (Phase 2)

### Audit Logging
All sensitive operations logged:
- Who did what, when
- Data changes tracked
- Compliance ready

## 🔐 Authentication

Uses **Clerk** for JWT validation:

```typescript
// All routes protected by default
@Controller('patients')
@UseGuards(ClerkGuard)
export class PatientsController {
  // Routes automatically validate JWT
}
```

JWT payload includes:
- `sub`: User ID
- `org_id`: Tenant ID (for multi-tenant isolation)
- `org_role`: User role

## 🗄️ Database

**PostgreSQL** with **Prisma ORM**:

```bash
# Create migration
pnpm prisma migrate dev --name add_patient_table

# Apply migrations
pnpm prisma migrate deploy

# Studio (GUI)
pnpm prisma studio

# Reset database (DEV ONLY)
pnpm prisma migrate reset
```

### Key Tables
- `tenants` - Organizations
- `users` - Staff members
- `patients` - Patient records
- `appointments` - Scheduling
- `insurance_policies` - Insurance info
- `eligibility_checks` - 270/271 results
- `claims` - Claims (837D)
- `invoices` - Billing
- `payments` - Payments
- `treatment_plans` - Treatment plans
- `procedure_codes` - CDT codes
- `audit_logs` - Audit trail

## 🔌 External Integrations

### Stedi (EDI)
- **270/271:** Insurance eligibility verification
- **837D:** Dental claim submission
- **835:** ERA payment remittance
- **276/277:** Claim status inquiry

### Open Dental
- Polling-based sync (every 5 minutes)
- Patient, appointment, procedure sync
- Writeback with approval (Phase 2)

### Stripe
- Subscription billing (practice subscriptions)
- Patient payment processing (future)

### AWS S3
- Document storage (X-rays, scans, forms)
- Signed URL generation

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

**Current Production:** https://crowndesk-backend-aaal.vercel.app

### Environment Variables (Production)
Set all environment variables in Vercel dashboard.

### Database Migrations
```bash
# Run in production
pnpm prisma migrate deploy
```

## 📊 API Endpoints

### Health Check
```
GET /health
```

### Patients
```
GET    /api/patients              # List patients
POST   /api/patients              # Create patient
GET    /api/patients/:id          # Get patient
PATCH  /api/patients/:id          # Update patient
DELETE /api/patients/:id          # Delete patient
```

### Appointments
```
GET    /api/appointments          # List appointments
POST   /api/appointments          # Create appointment
PATCH  /api/appointments/:id      # Update appointment
DELETE /api/appointments/:id      # Cancel appointment
```

### Insurance
```
POST   /api/insurance/verify      # Verify eligibility (270/271)
GET    /api/insurance/policies/:id # Get policy
```

### Claims
```
POST   /api/claims                # Submit claim (837D)
GET    /api/claims/:id/status     # Check status (276)
```

See full API documentation in `/docs/07-BACKEND/`

## 🧪 Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

## 📚 Documentation

- [API Documentation](./docs/07-BACKEND/)
- [Architecture](./docs/architecture/)
- [Integrations](./docs/integrations/)
- [Development Guide](./docs/development/)

## 🆘 Troubleshooting

### Database connection issues
```bash
# Test connection
pnpm prisma db pull

# Check DATABASE_URL format
postgresql://user:password@host:5432/database
```

### Port 3001 already in use
```bash
# Find process
netstat -ano | findstr :3001

# Kill process (Windows)
taskkill /PID <PID> /F
```

### Prisma schema changes
```bash
# After changing schema.prisma
pnpm prisma generate
pnpm prisma migrate dev
```

## 📞 Related Repositories

- **Frontend:** [crowndesk-frontend](https://github.com/roshan1595/crowndesk-frontend)
- **AI Service:** [crowndesk-ai-service](https://github.com/roshan1595/crowndesk-ai-service)

## 📄 License

Proprietary - CrownDesk V2

---

**Built with ❤️ for dental practices**
