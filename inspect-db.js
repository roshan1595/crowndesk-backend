const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function inspectDatabase() {
  try {
    console.log('\n=== PHONE NUMBERS ===');
    const phoneNumbers = await prisma.phoneNumber.findMany({
      take: 10,
      include: {
        agent: {
          select: {
            id: true,
            agentName: true,
            agentType: true,
            status: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Total phone numbers found: ${phoneNumbers.length}`);
    phoneNumbers.forEach(pn => {
      console.log(`\nPhone: ${pn.phoneNumber}`);
      console.log(`  ID: ${pn.id}`);
      console.log(`  Friendly Name: ${pn.friendlyName}`);
      console.log(`  Status: ${pn.status}`);
      console.log(`  Provider: ${pn.provider}`);
      console.log(`  Assigned Agent ID: ${pn.assignedAgentId || 'None'}`);
      console.log(`  Assigned Agent: ${pn.agent?.agentName || 'None'}`);
      console.log(`  Voice: ${pn.voiceEnabled}, SMS: ${pn.smsEnabled}`);
      console.log(`  Created: ${pn.createdAt}`);
    });

    console.log('\n\n=== AGENT CONFIGS ===');
    const agents = await prisma.agentConfig.findMany({
      take: 10,
      include: {
        phoneNumbers: {
          select: {
            phoneNumber: true,
            friendlyName: true,
            status: true,
          }
        },
        _count: {
          select: {
            calls: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Total agents found: ${agents.length}`);
    agents.forEach(agent => {
      console.log(`\nAgent: ${agent.agentName}`);
      console.log(`  ID: ${agent.id}`);
      console.log(`  Type: ${agent.agentType}`);
      console.log(`  Category: ${agent.agentCategory}`);
      console.log(`  Status: ${agent.status}`);
      console.log(`  Retell Agent ID: ${agent.retellAgentId || 'None'}`);
      console.log(`  Phone Numbers: ${agent.phoneNumbers.length}`);
      agent.phoneNumbers.forEach(pn => {
        console.log(`    - ${pn.phoneNumber} (${pn.status})`);
      });
      console.log(`  Total Calls: ${agent._count.calls}`);
      console.log(`  Created: ${agent.createdAt}`);
    });

    console.log('\n\n=== TENANTS ===');
    const tenants = await prisma.tenant.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        clerkOrgId: true,
        status: true,
        _count: {
          select: {
            phoneNumbers: true,
            agentConfigs: true,
            users: true,
          }
        }
      }
    });
    console.log(`Total tenants found: ${tenants.length}`);
    tenants.forEach(tenant => {
      console.log(`\nTenant: ${tenant.name}`);
      console.log(`  ID: ${tenant.id}`);
      console.log(`  Clerk Org ID: ${tenant.clerkOrgId}`);
      console.log(`  Status: ${tenant.status}`);
      console.log(`  Phone Numbers: ${tenant._count.phoneNumbers}`);
      console.log(`  Agents: ${tenant._count.agentConfigs}`);
      console.log(`  Users: ${tenant._count.users}`);
    });

  } catch (error) {
    console.error('Error inspecting database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

inspectDatabase();
