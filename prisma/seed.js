require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const dbUrl = process.env.DATABASE_URL || '';
let prisma;

if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
  const { Pool } = require('pg');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const path = require('path');
  const dbPath = path.resolve(__dirname, '..', 'dev.db');
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  prisma = new PrismaClient({ adapter });
}

async function main() {
  console.log("Cleaning database...");
  await prisma.ticket.deleteMany({});
  await prisma.seatLock.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.seat.deleteMany({});
  await prisma.seatmapLayout.deleteMany({});
  console.log("Database cleaned.");

  const layoutId = 'default-layout';
  const defaultBlocks = [
    {
      id: 'A',
      rowPrefix: 'A',
      rows: 6,
      seatsPerRow: 20,
      startX: 40,
      startY: 106,
      category: 'KAT1',
      price: 40.0,
      curvature: -0.18,
    },
    {
      id: 'B',
      rowPrefix: 'B',
      rows: 10,
      seatsPerRow: 20,
      startX: 40,
      startY: 282,
      category: 'KAT2',
      price: 24.0,
      curvature: 0,
    }
  ];

  console.log("Seeding default layout...");
  await prisma.seatmapLayout.create({
    data: {
      id: layoutId,
      name: "Musical Standard (320 Plätze)",
      blocks: JSON.stringify(defaultBlocks),
    }
  });

  console.log("Seeding seats associated with layout...");
  const seats = [];

  for (let row = 1; row <= 16; row++) {
    for (let number = 1; number <= 20; number++) {
      let category = 'KAT2';
      let price = 24.0;

      if (row <= 6) {
        category = 'KAT1';
        price = 40.0;
      }

      // Prefix seat ID with layout ID for absolute uniqueness
      const id = `${layoutId}-R${row}-S${number}`;

      // Calculate standard SVG coordinates matching the original layout
      const isRightSide = number > 10;
      const x = 40 + (number - 1) * 25 + (isRightSide ? 30 : 0);
      const baseY = 90 + (row - 1) * 28 + (row >= 7 ? 24 : 0);
      let y = baseY;
      if (row <= 6) {
        const colOffset = number - 10.5;
        const curveY = colOffset * colOffset * 0.18;
        y += (16.2 - curveY);
      }

      seats.push({
        id,
        layoutId,
        row,
        number,
        category,
        price,
        x,
        y,
      });
    }
  }

  // Create all seats in bulk
  await prisma.seat.createMany({
    data: seats,
  });
  console.log(`Seeded ${seats.length} seats for the default layout.`);

  console.log("Seeding default events...");
  await prisma.event.create({
    data: {
      id: 'event-samstag',
      title: 'Das Wilde Weib - Samstagsshow',
      date: new Date('2026-10-24T19:30:00Z'),
      description: 'Samstagsaufführung in der Stadthalle. Einlass ab 18:30 Uhr, Beginn um 19:30 Uhr.',
      layoutId: layoutId,
    }
  });

  await prisma.event.create({
    data: {
      id: 'event-sonntag',
      title: 'Das Wilde Weib - Sonntags-Matinée',
      date: new Date('2026-10-25T14:30:00Z'),
      description: 'Sonntagsaufführung in der Stadthalle. Einlass ab 13:30 Uhr, Beginn um 14:30 Uhr.',
      layoutId: layoutId,
    }
  });
  console.log("Seeded 2 default events successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
