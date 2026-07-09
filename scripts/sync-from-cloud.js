const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

async function runSync() {
  const cloudUrl = process.env.DATABASE_URL;
  if (!cloudUrl || (!cloudUrl.startsWith('postgresql://') && !cloudUrl.startsWith('postgres://'))) {
    console.error('Error: DATABASE_URL in .env must be a valid PostgreSQL connection string (Supabase) to download data.');
    process.exit(1);
  }

  console.log('Connecting to Supabase Cloud Database...');
  const pool = new Pool({ connectionString: cloudUrl });
  const pgAdapter = new PrismaPg(pool);
  const cloudPrisma = new PrismaClient({ adapter: pgAdapter });

  console.log('Downloading tickets and orders from the cloud...');
  const seats = await cloudPrisma.seat.findMany();
  const orders = await cloudPrisma.order.findMany();
  const tickets = await cloudPrisma.ticket.findMany();
  const promoCodes = await cloudPrisma.promoCode.findMany();

  console.log(`Downloaded: ${seats.length} seats, ${orders.length} orders, ${tickets.length} tickets, ${promoCodes.length} promo codes.`);
  await cloudPrisma.$disconnect();
  await pool.end();

  // Connect to local SQLite database
  console.log('Connecting to local SQLite database (dev.db)...');
  const dbPath = path.resolve(__dirname, '..', 'dev.db');
  const sqliteAdapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  const localPrisma = new PrismaClient({ adapter: sqliteAdapter });

  console.log('Clearing local database tables...');
  // Delete in order to satisfy foreign keys
  await localPrisma.ticket.deleteMany({});
  await localPrisma.order.deleteMany({});
  await localPrisma.seat.deleteMany({});
  await localPrisma.promoCode.deleteMany({});
  console.log('Local database cleared.');

  console.log('Writing cloud data into local SQLite database...');
  
  // Insert PromoCodes
  for (const promo of promoCodes) {
    await localPrisma.promoCode.create({ data: promo });
  }

  // Insert Seats
  for (const seat of seats) {
    await localPrisma.seat.create({ data: seat });
  }

  // Insert Orders
  for (const order of orders) {
    await localPrisma.order.create({ data: order });
  }

  // Insert Tickets
  for (const ticket of tickets) {
    await localPrisma.ticket.create({ data: ticket });
  }

  console.log('Offline database successfully synchronized!');
  await localPrisma.$disconnect();
}

runSync().catch(err => {
  console.error('Synchronization failed:', err);
  process.exit(1);
});
