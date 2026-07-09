import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

let prisma: PrismaClient;

const getPrismaClient = () => {
  // Resolve path to the SQLite database file in the project root
  const dbPath = path.resolve(process.cwd(), 'dev.db');
  const adapter = new PrismaBetterSqlite3({
    url: `file:${dbPath}`,
  });
  return new PrismaClient({ adapter });
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
