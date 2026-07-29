import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  AUTONOMY_KERNEL_VERSION,
  runAutonomyKernel,
} from "@/lib/media-buyer/autonomy-kernel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function equalSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization =
    request.headers.get("authorization")?.trim() || "";

  return Boolean(
    secret &&
      equalSecret(authorization, `Bearer ${secret}`),
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result = await runAutonomyKernel();

    return NextResponse.json({
      ...result,
      kernelVersion: AUTONOMY_KERNEL_VERSION,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        kernelVersion: AUTONOMY_KERNEL_VERSION,
        error:
          error instanceof Error
            ? error.message
            : "Autonomy Kernel failed",
        safety: {
          metaMutationExecuted: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
      },
      {
        status: 500,
      },
    );
  }
}
