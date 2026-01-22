const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function insertApiKey() {
  try {
    const apiKey = await prisma.serviceApiKey.create({
      data: {
        tenantId: 'c6adcec0-cfaf-4716-80c5-cc28ccab57c6',
        name: 'ElevenLabs AI Receptionist',
        keyHash: '4d9f4d03fe82bed09acac729832b83135a1d8963af5d44f14d9c579168d2ce27',
        serviceType: 'ai_agent',
        isActive: true,
      },
    });
    
    console.log('✅ API key created successfully!');
    console.log('ID:', apiKey.id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

insertApiKey();
