import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * เปลี่ยนชื่อ Global Singleton ทุกครั้งที่มีการเพิ่ม Prisma Models ชุดใหญ่
 * เพื่อป้องกัน Next.js Development Server นำ Prisma Client รุ่นเก่ากลับมาใช้
 */
const PRISMA_CLIENT_VERSION =
  "audience-library-v1";

type GlobalPrismaStore = {
  prismaAudienceLibraryV1?: PrismaClient;
};

const globalForPrisma =
  globalThis as unknown as GlobalPrismaStore;

const databaseUrl =
  process.env.DATABASE_URL ??
  "file:./prisma/dev.db";

const adapter =
  new PrismaBetterSqlite3({
    url: databaseUrl,
  });

const createPrismaClient = (): PrismaClient => {
  const client =
    new PrismaClient({
      adapter,
    });

  /**
   * ตรวจ Runtime ว่า Generated Client มี Audience Models จริง
   * หากไม่มี จะ Error พร้อมข้อความที่ชัดเจนกว่าการเจอ
   * "Cannot read properties of undefined"
   */
  const runtimeClient =
    client as PrismaClient & {
      audienceAsset?: unknown;
      audienceVersion?: unknown;
      audienceSource?: unknown;
      audienceUsage?: unknown;
      audiencePerformance?: unknown;
    };

  if (
    !runtimeClient.audienceAsset ||
    !runtimeClient.audienceVersion ||
    !runtimeClient.audienceSource ||
    !runtimeClient.audienceUsage ||
    !runtimeClient.audiencePerformance
  ) {
    throw new Error(
      [
        `Prisma Client ${PRISMA_CLIENT_VERSION} ไม่มี Audience Models`,
        "กรุณารัน npx prisma generate",
        "ลบโฟลเดอร์ .next",
        "แล้วรีสตาร์ต npm run dev",
      ].join(" | "),
    );
  }

  return client;
};

const prisma =
  globalForPrisma
    .prismaAudienceLibraryV1 ??
  createPrismaClient();

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForPrisma.prismaAudienceLibraryV1 =
    prisma;
}

export default prisma;