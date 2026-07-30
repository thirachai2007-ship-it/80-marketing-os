import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const EXPERIMENT_LIFECYCLE_VERSION = "experiment-lifecycle-v2";
const PAUSED_CANARY_REVISION_STATUSES = ["READY_TO_RENDER", "READY_FOR_APPROVAL"] as const;
export type ExperimentStatus = "PAUSED" | "READY_FOR_ACTIVATION" | "CANCELLED";
export type OwnerOverrideAction = "PAUSE" | "APPROVE_FOR_LATER_ACTIVATION" | "CANCEL";

type ExperimentRecord = {
  experimentId: string;
  campaignDraftId: string;
  name: string;
  hypothesis: string;
  controlCreativeRevisionId: string;
  challengerCreativeRevisionId: string;
  trafficPercent: number;
  minimumSpendSatang: number;
  status: ExperimentStatus;
  fingerprint: string;
  createdAt: string;
  lastOverride?: { action: OwnerOverrideAction; ownerName: string; reason: string; createdAt: string };
};

function parseRecord(value: string | null): ExperimentRecord | null {
  try { return value ? JSON.parse(value) as ExperimentRecord : null; } catch { return null; }
}

export async function createPausedCanary(input: {
  campaignDraftId: string;
  name: string;
  hypothesis: string;
  controlCreativeRevisionId: string;
  challengerCreativeRevisionId: string;
  trafficPercent?: number;
  minimumSpendSatang?: number;
}) {
  const name = input.name?.normalize("NFKC").trim().slice(0, 120);
  const hypothesis = input.hypothesis?.normalize("NFKC").trim().slice(0, 500);
  if (!name || !hypothesis) throw new Error("ต้องระบุชื่อ Experiment และสมมติฐาน");

  const draft = await prisma.campaignDraft.findUnique({ where: { id: input.campaignDraftId }, select: { id: true, pageId: true, status: true } });
  if (!draft) throw new Error("ไม่พบ Campaign Draft");
  if (input.controlCreativeRevisionId === input.challengerCreativeRevisionId) throw new Error("Control และ Challenger ต้องเป็นคนละ Revision");

  const revisions = await prisma.creativeRevision.findMany({
    where: {
      id: { in: [input.controlCreativeRevisionId, input.challengerCreativeRevisionId] },
      status: { in: [...PAUSED_CANARY_REVISION_STATUSES] },
    },
    select: { id: true, creativeAsset: { select: { pageId: true } } },
  });
  if (revisions.length !== 2) {
    throw new Error("Revision ทั้งสองรายการต้องอยู่ในสถานะ READY_TO_RENDER หรือ READY_FOR_APPROVAL");
  }
  if (revisions.some((revision) => revision.creativeAsset.pageId !== draft.pageId)) {
    throw new Error("Control และ Challenger ต้องเป็น Creative ของเพจเดียวกับ Campaign Draft");
  }

  const experimentId = `exp_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const base = {
    experimentId,
    campaignDraftId: input.campaignDraftId,
    name,
    hypothesis,
    controlCreativeRevisionId: input.controlCreativeRevisionId,
    challengerCreativeRevisionId: input.challengerCreativeRevisionId,
    trafficPercent: Math.min(Math.max(Math.floor(input.trafficPercent ?? 10), 1), 25),
    minimumSpendSatang: Math.max(Math.floor(input.minimumSpendSatang ?? 0), 0),
    status: "PAUSED" as const,
    createdAt,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  const record: ExperimentRecord = { ...base, fingerprint };

  await prisma.decisionLog.create({ data: {
    campaignDraftId: input.campaignDraftId,
    decisionType: "EXPERIMENT_LIFECYCLE",
    action: "CREATE_PAUSED_CANARY_V1",
    reason: "สร้าง Canary แบบ PAUSED เพื่อรอ Owner ตรวจสอบ",
    confidence: 100,
    inputJson: JSON.stringify(input),
    outputJson: JSON.stringify(record),
    policyJson: JSON.stringify({ canaryStatus: "PAUSED", activationAllowed: false, ownerOverrideRequired: true, realSpendUsed: false, metaMutationExecuted: false }),
    policyReference: "Master Spec 73",
  }});
  return record;
}

export async function getExperimentOptions() {
  const [campaignDrafts, creativeRevisions] = await Promise.all([
    prisma.campaignDraft.findMany({
      where: { status: { notIn: ["CANCELLED", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        pageId: true,
        campaignName: true,
        productCategory: true,
        status: true,
        page: { select: { name: true } },
      },
    }),
    prisma.creativeRevision.findMany({
      where: {
        status: { in: [...PAUSED_CANARY_REVISION_STATUSES] },
        creativeAsset: { isActive: true },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        version: true,
        revisionType: true,
        creativeAsset: { select: { pageId: true, name: true, assetType: true, page: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    campaignDrafts: campaignDrafts.map(({ page, ...draft }) => ({ ...draft, pageName: page.name })),
    creativeRevisions: creativeRevisions.map((revision) => ({
      id: revision.id,
      version: revision.version,
      revisionType: revision.revisionType,
      pageId: revision.creativeAsset.pageId,
      pageName: revision.creativeAsset.page.name,
      assetName: revision.creativeAsset.name,
      assetType: revision.creativeAsset.assetType,
    })),
  };
}

export async function listExperiments(campaignDraftId?: string) {
  const logs = await prisma.decisionLog.findMany({
    where: { decisionType: "EXPERIMENT_LIFECYCLE", ...(campaignDraftId ? { campaignDraftId } : {}) },
    orderBy: { createdAt: "desc" }, take: 200,
  });
  const latest = new Map<string, ExperimentRecord>();
  for (const log of logs) {
    const record = parseRecord(log.outputJson);
    if (record && !latest.has(record.experimentId)) latest.set(record.experimentId, record);
  }
  return [...latest.values()];
}

export async function overrideExperiment(input: {
  experimentId: string;
  action: OwnerOverrideAction;
  ownerName: string;
  reason: string;
  expectedFingerprint: string;
}) {
  const current = (await listExperiments()).find((item) => item.experimentId === input.experimentId);
  if (!current) throw new Error("ไม่พบ Experiment");
  if (current.fingerprint !== input.expectedFingerprint) throw new Error("Experiment ถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่");
  const ownerName = input.ownerName.normalize("NFKC").trim();
  const reason = input.reason.normalize("NFKC").trim();
  if (!ownerName || !reason) throw new Error("ต้องระบุ Owner และเหตุผลของ Override");

  const status: ExperimentStatus = input.action === "CANCEL" ? "CANCELLED" : input.action === "APPROVE_FOR_LATER_ACTIVATION" ? "READY_FOR_ACTIVATION" : "PAUSED";
  const createdAt = new Date().toISOString();
  const nextBase = { ...current, status, lastOverride: { action: input.action, ownerName, reason, createdAt } };
  const fingerprint = createHash("sha256").update(JSON.stringify(nextBase)).digest("hex");
  const next = { ...nextBase, fingerprint };
  await prisma.decisionLog.create({ data: {
    campaignDraftId: current.campaignDraftId,
    decisionType: "EXPERIMENT_LIFECYCLE",
    action: `OWNER_OVERRIDE_${input.action}_V1`, reason, confidence: 100,
    inputJson: JSON.stringify(input), outputJson: JSON.stringify(next),
    policyJson: JSON.stringify({ explicitOwnerOverride: true, activationExecuted: false, canaryDeliveryStatus: "PAUSED", realSpendUsed: false, metaMutationExecuted: false }),
    policyReference: "Master Spec 73",
  }});
  return next;
}
