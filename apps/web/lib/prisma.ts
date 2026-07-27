import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

const PRISMA_CLIENT_VERSION =
  "postgres-audience-library-v1";

type GlobalPrismaStore = {
  prismaPostgresAudienceLibraryV1?: PrismaClient;
};

const globalForPrisma =
  globalThis as unknown as GlobalPrismaStore;

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "ไม่พบ DATABASE_URL กรุณาตั้งค่า Neon PostgreSQL connection string",
  );
}

if (
  !databaseUrl.startsWith("postgresql://") &&
  !databaseUrl.startsWith("postgres://")
) {
  throw new Error(
    "DATABASE_URL ต้องเป็น PostgreSQL URL และห้ามเป็น file: SQLite",
  );
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const createPrismaClient =
  (): PrismaClient => {
    const client =
      new PrismaClient({
        adapter,
      });

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
    .prismaPostgresAudienceLibraryV1 ??
  createPrismaClient();

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForPrisma
    .prismaPostgresAudienceLibraryV1 =
    prisma;
}

export default prisma;