import {
  MEDIA_BUYER_QUEUE_DEFINITIONS,
  MEDIA_BUYER_QUEUE_STATUSES,
  MEDIA_BUYER_QUEUE_VERSION,
  getMediaBuyerQueue,
} from "@/lib/media-buyer/media-buyer-queue";

export const SPEC_36_EVIDENCE_VERSION = "spec-36-evidence-v1";

export async function getSpec36Evidence() {
  const queue = await getMediaBuyerQueue({ take: 500 });
  const expectedStatuses = [...MEDIA_BUYER_QUEUE_STATUSES];
  const actualStatuses = queue.statuses.map((item) => item.status);
  const countTotal = Object.values(queue.counts).reduce((sum, count) => sum + count, 0);
  const invalidSampleItems = queue.items.filter(
    (item) =>
      !expectedStatuses.includes(item.status) ||
      !item.id.trim() ||
      !item.campaignName.trim() ||
      !item.adAccountId.trim() ||
      !item.reason.trim(),
  );
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (queue.queueVersion !== MEDIA_BUYER_QUEUE_VERSION) gaps.push({ reason: "QUEUE_VERSION_MISMATCH" });
  if (actualStatuses.join("|") !== expectedStatuses.join("|")) gaps.push({ reason: "SEVEN_STATUS_TAXONOMY_MISMATCH" });
  if (Object.keys(MEDIA_BUYER_QUEUE_DEFINITIONS).length !== 7) gaps.push({ reason: "SEVEN_STATUS_DEFINITIONS_MISSING" });
  if (queue.totalItems === 0) gaps.push({ reason: "NO_PRODUCTION_QUEUE_ITEMS" });
  if (countTotal !== queue.totalItems) gaps.push({ reason: "QUEUE_COUNTS_DO_NOT_MATCH_TOTAL" });
  if (invalidSampleItems.length > 0) gaps.push({ reason: "INVALID_QUEUE_ITEM", count: invalidSampleItems.length });

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_36_EVIDENCE_VERSION,
    requirement: "Media Buyer Queue has Ready, Need Review, Creating, Learning, Optimizing, Scaling and Paused states",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      totalItems: queue.totalItems,
      counts: queue.counts,
      statuses: queue.statuses,
      validatedSampleItems: queue.items.length,
      invalidSampleItems: invalidSampleItems.length,
    },
    ui: { route: "/marketing/media-buyer-queue", sidebarEntry: "Media Buyer Queue" },
    policy: queue.policy,
    gapCount: gaps.length,
    gaps,
    safety: queue.safety,
  };
}
