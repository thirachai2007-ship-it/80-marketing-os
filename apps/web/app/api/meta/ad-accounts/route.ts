import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.adAccount.findMany({
    where: {
      metaConnection: {
        status: "ACTIVE",
      },
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      currency: true,
      timezone: true,
      isActive: true,
      accountStatus: true,
      businessId: true,
      updatedAt: true,
      _count: {
        select: {
          pageMappings: true,
        },
      },
    },
  });

  return NextResponse.json({
    accounts,
    total: accounts.length,
    synced: accounts.length > 0,
  });
}
