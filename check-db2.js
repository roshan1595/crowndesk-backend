const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== PROCEDURE CODES BY TENANT ===');
    const codesByTenant = await prisma.procedureCode.groupBy({
      by: ['tenantId'],
      _count: { id: true },
    });
    console.log(JSON.stringify(codesByTenant, null, 2));

    console.log('\n=== TENANTS ===');
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, status: true }
    });
    console.log(JSON.stringify(tenants, null, 2));
    
    console.log('\n=== INSURANCE POLICIES - RAW DATA ===');
    const policies = await prisma.insurancePolicy.findMany({ 
      take: 2,
      select: { 
        id: true, 
        payerName: true, 
        planName: true, 
        memberId: true,
        patientId: true,
        tenantId: true 
      }
    });
    console.log(JSON.stringify(policies, null, 2));
    
    console.log('\n=== TREATMENT PLANS ===');
    const plans = await prisma.treatmentPlan.count();
    console.log('Total treatment plans:', plans);
    
    console.log('\n=== PMS MAPPINGS ===');
    const mappings = await prisma.pmsMapping.groupBy({
      by: ['entityType'],
      _count: { id: true },
    });
    console.log(JSON.stringify(mappings, null, 2));
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
