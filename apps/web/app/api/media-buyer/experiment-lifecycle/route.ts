import { NextRequest, NextResponse } from "next/server";

import { createPausedCanary, EXPERIMENT_LIFECYCLE_VERSION, getExperimentOptions, listExperiments, overrideExperiment, type OwnerOverrideAction } from "@/lib/media-buyer/experiment-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const [experiments, options] = await Promise.all([
    listExperiments(request.nextUrl.searchParams.get("campaignDraftId")?.trim() || undefined),
    getExperimentOptions(),
  ]);
  return NextResponse.json({ ok: true, engine: EXPERIMENT_LIFECYCLE_VERSION, experiments, options, safety: { canaryDeliveryStatus: "PAUSED", activationExecuted: false, realSpendUsed: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = String(body.operation ?? "CREATE_CANARY");
    const result = operation === "OVERRIDE"
      ? await overrideExperiment(body as unknown as { experimentId: string; action: OwnerOverrideAction; ownerName: string; reason: string; expectedFingerprint: string })
      : await createPausedCanary(body as unknown as Parameters<typeof createPausedCanary>[0]);
    return NextResponse.json({ ok: true, experiment: result, activationExecuted: false, realSpendUsed: false });
  } catch (error) {
    return NextResponse.json({ ok: false, activationExecuted: false, realSpendUsed: false, error: error instanceof Error ? error.message : "Experiment Lifecycle error" }, { status: 400 });
  }
}
