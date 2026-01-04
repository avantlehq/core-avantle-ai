import bcrypt from 'bcryptjs'
import { getPrisma, connectDatabase } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { appConfig } from '../lib/config.js'
import { 
  Role, 
  PartnerStatus, 
  TenantStatus, 
  TenantType, 
  DomainStatus,
  Environment,
  ProductAccessStatus 
} from '../lib/prisma/index.js'

async function seed() {
  try {
    await connectDatabase()
    const db = getPrisma()

    logger.info('Starting database seed...')

    // 1. Create Platform Admin User
    logger.info('Creating platform admin user...')
    
    const adminPasswordHash = await bcrypt.hash(appConfig.admin.password, 12)
    
    const adminUser = await db.user.upsert({
      where: { email: appConfig.admin.email },
      update: {},
      create: {
        email: appConfig.admin.email,
        name: 'Platform Administrator',
        status: 'ACTIVE',
      },
    })

    logger.info(`Admin user created: ${adminUser.email}`)

    // 2. Create Sample Partner
    logger.info('Creating sample partner...')
    
    const samplePartner = await db.partner.upsert({
      where: { billing_email: 'billing@demo-company.com' },
      update: {},
      create: {
        name: 'Demo Company Ltd',
        billing_email: 'billing@demo-company.com',
        status: PartnerStatus.ACTIVE,
        created_by_user_id: adminUser.id,
      },
    })

    logger.info(`Sample partner created: ${samplePartner.name}`)

    // 3. Create Sample Partner Admin User
    logger.info('Creating partner admin user...')
    
    const partnerAdminPasswordHash = await bcrypt.hash('partneradmin123', 12)
    
    const partnerAdminUser = await db.user.upsert({
      where: { email: 'admin@demo-company.com' },
      update: {},
      create: {
        email: 'admin@demo-company.com',
        name: 'Partner Administrator',
        status: 'ACTIVE',
      },
    })

    // 4. Create Sample Tenants
    logger.info('Creating sample tenants...')

    // UI Tenant
    const uiTenant = await db.tenant.upsert({
      where: { id: 'demo-ui-tenant' },
      update: {},
      create: {
        id: 'demo-ui-tenant',
        partner_id: samplePartner.id,
        name: 'Demo UI Application',
        tenant_type: TenantType.UI,
        status: TenantStatus.ACTIVE,
      },
    })

    // API Tenant
    const apiTenant = await db.tenant.upsert({
      where: { id: 'demo-api-tenant' },
      update: {},
      create: {
        id: 'demo-api-tenant',
        partner_id: samplePartner.id,
        name: 'Demo API Integration',
        tenant_type: TenantType.API,
        status: TenantStatus.ACTIVE,
      },
    })

    // Hybrid Tenant
    const hybridTenant = await db.tenant.upsert({
      where: { id: 'demo-hybrid-tenant' },
      update: {},
      create: {
        id: 'demo-hybrid-tenant',
        partner_id: samplePartner.id,
        name: 'Demo Hybrid Platform',
        tenant_type: TenantType.HYBRID,
        status: TenantStatus.ACTIVE,
      },
    })

    // 5. Create Memberships
    logger.info('Creating memberships...')

    // Partner admin membership for UI tenant
    await db.membership.upsert({
      where: {
        user_id_tenant_id: {
          user_id: partnerAdminUser.id,
          tenant_id: uiTenant.id,
        },
      },
      update: {},
      create: {
        user_id: partnerAdminUser.id,
        tenant_id: uiTenant.id,
        role: Role.PARTNER_ADMIN,
      },
    })

    // 6. Create Sample Domains
    logger.info('Creating sample domains...')

    await db.domain.upsert({
      where: { hostname: 'demo.avantle.ai' },
      update: {},
      create: {
        tenant_id: uiTenant.id,
        hostname: 'demo.avantle.ai',
        status: DomainStatus.VERIFIED,
        verified_at: new Date(),
        last_verified_at: new Date(),
        dns_records: {
          A: ['127.0.0.1'],
          TXT: [`avantle-verification=${uiTenant.id}`],
        },
      },
    })

    await db.domain.upsert({
      where: { hostname: 'api.demo-company.com' },
      update: {},
      create: {
        tenant_id: hybridTenant.id,
        hostname: 'api.demo-company.com',
        status: DomainStatus.PENDING,
        dns_records: null,
      },
    })

    // 7. Create API Client for API tenant (required by tenant type invariant)
    logger.info('Creating API clients...')

    const clientSecret = 'demo-api-client-secret-12345'
    const clientSecretHash = await bcrypt.hash(clientSecret, 12)

    await db.aPIClient.upsert({
      where: { client_id: 'demo-api-client' },
      update: {},
      create: {
        tenant_id: apiTenant.id,
        name: 'Demo API Client',
        client_id: 'demo-api-client',
        client_secret_hash: clientSecretHash,
        status: 'ACTIVE',
      },
    })

    // 8. Create Sample Plans
    logger.info('Creating sample plans...')

    const freePlan = await db.plan.upsert({
      where: { key: 'free' },
      update: {},
      create: {
        key: 'free',
        name: 'Free Plan',
        limits: {
          dpia_sandbox_assessments: 5,
          dpia_prod_assessments: 1,
          notes_sandbox_documents: 10,
          notes_prod_documents: 5,
          storage_mb: 100,
          api_calls_per_month: 1000,
        },
      },
    })

    const basicPlan = await db.plan.upsert({
      where: { key: 'basic' },
      update: {},
      create: {
        key: 'basic',
        name: 'Basic Plan',
        limits: {
          dpia_sandbox_assessments: 25,
          dpia_prod_assessments: 10,
          notes_sandbox_documents: 100,
          notes_prod_documents: 50,
          storage_mb: 1000,
          api_calls_per_month: 10000,
        },
      },
    })

    const proPlan = await db.plan.upsert({
      where: { key: 'pro' },
      update: {},
      create: {
        key: 'pro',
        name: 'Professional Plan',
        limits: {
          dpia_sandbox_assessments: 100,
          dpia_prod_assessments: 50,
          notes_sandbox_documents: 1000,
          notes_prod_documents: 500,
          storage_mb: 10000,
          api_calls_per_month: 100000,
        },
      },
    })

    // 9. Assign Plans to Tenants
    logger.info('Assigning plans to tenants...')

    await db.tenantPlan.upsert({
      where: {
        id: `${uiTenant.id}-${freePlan.id}`,
      },
      update: {},
      create: {
        id: `${uiTenant.id}-${freePlan.id}`,
        tenant_id: uiTenant.id,
        plan_id: freePlan.id,
        effective_from: new Date(),
      },
    })

    await db.tenantPlan.upsert({
      where: {
        id: `${hybridTenant.id}-${basicPlan.id}`,
      },
      update: {},
      create: {
        id: `${hybridTenant.id}-${basicPlan.id}`,
        tenant_id: hybridTenant.id,
        plan_id: basicPlan.id,
        effective_from: new Date(),
      },
    })

    // 10. Create Product Access
    logger.info('Creating product access...')

    const products = ['dpia', 'notes', 'osdm']
    const environments = [Environment.SANDBOX, Environment.PRODUCTION]
    const tenants = [uiTenant, apiTenant, hybridTenant]

    for (const tenant of tenants) {
      for (const product of products) {
        for (const environment of environments) {
          await db.productAccess.upsert({
            where: {
              tenant_id_product_key_environment: {
                tenant_id: tenant.id,
                product_key: product,
                environment: environment,
              },
            },
            update: {},
            create: {
              tenant_id: tenant.id,
              product_key: product,
              environment: environment,
              status: ProductAccessStatus.ACTIVE,
            },
          })
        }
      }
    }

    // 11. Create Sample Usage Counters
    logger.info('Creating sample usage counters...')

    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Sample usage for DPIA
    await db.usageCounter.upsert({
      where: {
        tenant_id_product_key_environment_metric_key_period_start: {
          tenant_id: uiTenant.id,
          product_key: 'dpia',
          environment: Environment.SANDBOX,
          metric_key: 'assessments',
          period_start: thisMonth,
        },
      },
      update: {},
      create: {
        tenant_id: uiTenant.id,
        product_key: 'dpia',
        environment: Environment.SANDBOX,
        metric_key: 'assessments',
        period_start: thisMonth,
        value: BigInt(3),
      },
    })

    // Sample usage for Notes
    await db.usageCounter.upsert({
      where: {
        tenant_id_product_key_environment_metric_key_period_start: {
          tenant_id: hybridTenant.id,
          product_key: 'notes',
          environment: Environment.PRODUCTION,
          metric_key: 'documents',
          period_start: thisMonth,
        },
      },
      update: {},
      create: {
        tenant_id: hybridTenant.id,
        product_key: 'notes',
        environment: Environment.PRODUCTION,
        metric_key: 'documents',
        period_start: thisMonth,
        value: BigInt(15),
      },
    })

    // 12. Create Sample Branding
    logger.info('Creating sample branding...')

    await db.branding.upsert({
      where: { tenant_id: uiTenant.id },
      update: {},
      create: {
        tenant_id: uiTenant.id,
        logo_url: 'https://demo.avantle.ai/logo.png',
        primary_color: '#3b82f6',
        theme_config: {
          dark_mode: true,
          compact_layout: false,
        },
        legal_links: {
          privacy_policy: 'https://demo.avantle.ai/privacy',
          terms_of_service: 'https://demo.avantle.ai/terms',
        },
        footer_text: '© 2024 Demo Company Ltd. All rights reserved.',
      },
    })

    // 13. Create Sample Audit Log Entry
    logger.info('Creating sample audit log...')

    await db.auditLog.create({
      data: {
        tenant_id: uiTenant.id,
        actor_id: adminUser.id,
        actor_type: 'USER',
        entity_type: 'tenant',
        entity_id: uiTenant.id,
        action: 'seed_data_created',
        new_values: {
          message: 'Sample data created during database seed',
        },
        timestamp: new Date(),
      },
    })

    logger.info('Database seed completed successfully!')

    // Print summary
    console.log('\n🎉 Database seeded successfully!')
    console.log('\n📊 Created:')
    console.log(`   • 2 users (admin + partner admin)`)
    console.log(`   • 1 partner (Demo Company Ltd)`)
    console.log(`   • 3 tenants (UI, API, Hybrid)`)
    console.log(`   • 2 domains (1 verified, 1 pending)`)
    console.log(`   • 1 API client`)
    console.log(`   • 3 plans (Free, Basic, Pro)`)
    console.log(`   • Product access for 3 products × 2 environments`)
    console.log(`   • Sample usage counters`)
    console.log(`   • Sample branding configuration`)
    console.log('\n🔐 Login credentials:')
    console.log(`   Platform Admin: ${appConfig.admin.email} / ${appConfig.admin.password}`)
    console.log(`   Partner Admin:  admin@demo-company.com / partneradmin123`)
    console.log('\n🌐 Sample domains:')
    console.log(`   • https://demo.avantle.ai (verified)`)
    console.log(`   • https://api.demo-company.com (pending)`)

  } catch (error) {
    logger.error('Database seed failed', {}, error as Error)
    process.exit(1)
  }
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => {
      process.exit(0)
    })
    .catch((error) => {
      logger.error('Seed script failed', {}, error)
      process.exit(1)
    })
}

export { seed }