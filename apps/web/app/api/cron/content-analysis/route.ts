import { NextResponse } from "next/server";

import {
  getContentAnalysisAutoRunStatus,
  tickContentAnalysisAutoRun,
} from "@/lib/media-buyer/content-analysis-auto-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  return Boolean(
    secret &&
      request.headers.get("authorization") ===
        `Bearer ${secret}`,
  );
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET ยังไม่ได้ตั้งค่า",
      },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const status =
      await getContentAnalysisAutoRunStatus();
    const plan = status.plan;

    if (!plan || plan.status !== "ACTIVE") {
      return NextResponse.json({
        ok: true,
        tickAccepted: false,
        planStatus: plan?.status ?? null,
        message:
          plan?.status === "RUNNING"
            ? "มี Tick กำลังทำงานอยู่แล้ว"
            : "ไม่มีแผน ACTIVE",
        safety: status.safety,
      });
    }

    const result =
      await tickContentAnalysisAutoRun(
        plan.id,
      );

    return NextResponse.json({
      ok: true,
      trigger: "VERCEL_CRON",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        tickAccepted: false,
        error:
          error instanceof Error
            ? error.message
            : "Content Analysis Cron error",
        safety: {
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
          metaMutationExecuted: false,
        },
      },
      { status: 500 },
    );
  }
}
