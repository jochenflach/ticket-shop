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
  console.log("Seeding seats in database...");

  // Clear existing seats
  await prisma.seat.deleteMany({});
  console.log('Deleted existing seats.');

  const seats = [];

  for (let row = 1; row <= 16; row++) {
    for (let number = 1; number <= 20; number++) {
      let category = 'KAT2';
      let price = 24.0;

      if (row <= 6) {
        category = 'KAT1';
        price = 40.0;
      }

      const id = `R${row}-S${number}`;

      seats.push({
        id,
        row,
        number,
        category,
        price,
      });
    }
  }

  // Create all seats
  for (const seat of seats) {
    await prisma.seat.create({
      data: seat,
    });
  }

  console.log(`Successfully seeded ${seats.length} seats.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
