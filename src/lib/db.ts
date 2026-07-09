import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

const getPrismaClient = () => {
  const dbUrl = process.env.DATABASE_URL || '';
  
  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    // Connect to PostgreSQL (e.g. Supabase) using pg and @prisma/adapter-pg
    const { Pool } = require('pg');
    const { PrismaPg } = require('@prisma/adapter-pg');
    
    const pool = new Pool({
      connectionString: dbUrl,
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  } else {
    // Fallback to SQLite (using better-sqlite3)
    const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
    const path = require('path');
    const dbPath = path.resolve(process.cwd(), 'dev.db');
    const adapter = new PrismaBetterSqlite3({
      url: `file:${dbPath}`,
    });
    return new PrismaClient({ adapter });
  }
};

if (process.env.NODE_ENV === 'production') {
  prisma = getPrismaClient();
} else {
  // In development, use a global variable so that the value
  // is preserved across hot module reloads.
  const globalWithPrisma = global as typeof globalThis & {
    prisma?: PrismaClient;
  };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = getPrismaClient();
  }
  prisma = globalWithPrisma.prisma;
}

export { prisma };
