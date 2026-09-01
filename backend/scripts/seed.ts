/**
 * Database Seeding Script
 * 
 * Creates demo devices for testing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Check if devices already exist
  const existingDevices = await prisma.device.count();
  if (existingDevices > 0) {
    console.log(`Found ${existingDevices} existing devices, skipping seed`);
    return;
  }

  // Create demo devices
  const devices = [
    {
      id: 'sim-device-001',
      name: 'Raspberry Pi Sensor Hub 1',
      location: 'Building A, Floor 2',
    },
    {
      id: 'sim-device-002',
      name: 'Raspberry Pi Sensor Hub 2',
      location: 'Building B, Floor 1',
    },
    {
      id: 'sim-device-003',
      name: 'Raspberry Pi Sensor Hub 3',
      location: 'Building C, Floor 3',
    },
  ];

  for (const deviceData of devices) {
    const device = await prisma.device.upsert({
      where: { id: deviceData.id },
      update: {},
      create: deviceData,
    });
    console.log(`Created device: ${device.name} (${device.id})`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

