import prisma from "@/lib/prisma";

export const MEDIA_BUYER_QUEUE_VERSION = "media-buyer-queue-v1";
export const MEDIA_BUYER_QUEUE_STATUSES = [
  "READY",
  "NEED_REVIEW",
  "CREATING",
  "LEARNING",
  "OPTIMIZING",
  "SCALING",
  "PAUSED",
] as const;

export type MediaBuyerQueueStatus =
  (typeof MEDIA_BUYER_QUEUE_STATUSES)[number];

const LEARNING_DAYS = 7;
const SCALE_MIN_SPEND_SATANG = 10_000;
const SCALE_MIN_ROAS = 2;

export const MEDIA_BUYER_QUEUE_DEFINITIONS: Record<
  MediaBuyerQueueStatus,
  { label: string; description: string }
> = {
  READY: { label: "Ready", description: "พร้อมเข้าสู่ขั้นตอนสร้างหรือเผยแพร่ตามสิทธิ์ Owner" },
  NEED_REVIEW: { label: "Need Review", description: "รอ Owner ตรวจและอนุมัติ" },
  CREATING: { label: "Creating", description: "AI กำลังสร้างแผน โฆษณา หรือ Creative" },
  LEARNING: { label: "Learning", description: "Campaign เปิดใช้งานไม่เกิน 7 วันและกำลังสะสมผลจริง" },
  OPTIMIZING: { label: "Optimizing", description: "Campaign เปิดใช้งานและกำลังปรับจากผลจริง" },
  SCALING: { label: "Scaling", description: "Campaign มีข้อมูลเพียงพอและ ROAS ถึงเกณฑ์ขยาย" },
  PAUSED: { label: "Paused", description: "หยุดส่งหรือเป็น Draft แบบ PAUSED" },
};

type QueueItem = {
  id: string;
  source: "CAMPAIGN_DRAFT" | "META_CAMPAIGN";
  status: MediaBuyerQueueStatus;
  campaignName: string;
  pageName: string | null;
  adAccountId: string;
  adAccountName: string;
  productCategory: string | null;
  metaCampaignId: string | null;
  effectiveStatus: string | null;
  spendSatang: number;
  purchases: number;
  revenueSatang: number;
  roas: number | null;
  reason: string;
  updatedAt: Date;
};

function draftQueueStatus(status: string): MediaBuyerQueueStatus {
  if (status === "READY_FOR_APPROVAL") return "NEED_REVIEW";
  if (["READY", "APPROVED", "READY_TO_PUBLISH"].includes(status)) return "READY";
  if (["PLANNING", "DRAFT", "BUILDING", "CREATING"].includes(status)) return "CREATING";
  return "PAUSED";
}

function isPaused(status: string | null) {
  return Boolean(status && ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "DELETED"].includes(status));
}

export async function getMediaBuyerQueue(options: { take?: number } = {}) {
  const take = Math.min(Math.max(Math.floor(options.take ?? 100), 1), 500);
  const [drafts, campaigns, resultGroups] = await Promise.all([
    prisma.campaignDraft.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        campaignName: true,
        productCategory: true,
        metaCampaignId: true,
        updatedAt: true,
        page: { select: { name: true } },
        adAccount: { select: { id: true, name: true } },
      },
    }),
    prisma.metaCampaign.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        effectiveStatus: true,
        status: true,
        metaCreatedTime: true,
        createdAt: true,
        updatedAt: true,
        adAccount: { select: { id: true, name: true } },
      },
    }),
    prisma.metaAdInsight.groupBy({
      by: ["campaignId"],
      _sum: { spendSatang: true, purchases: true, revenueSatang: true },
    }),
  ]);

  const linkedCampaignIds = new Set(
    drafts.map((draft) => draft.metaCampaignId).filter((id): id is string => Boolean(id)),
  );
  const results = new Map(
    resultGroups.map((group) => [group.campaignId, group._sum]),
  );
  const now = Date.now();
  const items: QueueItem[] = drafts.map((draft) => {
    const status = draftQueueStatus(draft.status);
    return {
      id: draft.id,
      source: "CAMPAIGN_DRAFT",
      status,
      campaignName: draft.campaignName,
      pageName: draft.page.name,
      adAccountId: draft.adAccount.id,
      adAccountName: draft.adAccount.name,
      productCategory: draft.productCategory,
      metaCampaignId: draft.metaCampaignId,
      effectiveStatus: null,
      spendSatang: 0,
      purchases: 0,
      revenueSatang: 0,
      roas: null,
      reason: MEDIA_BUYER_QUEUE_DEFINITIONS[status].description,
      updatedAt: draft.updatedAt,
    };
  });

  for (const campaign of campaigns) {
    if (linkedCampaignIds.has(campaign.id)) continue;
    const totals = results.get(campaign.id);
    const spendSatang = totals?.spendSatang ?? 0;
    const purchases = totals?.purchases ?? 0;
    const revenueSatang = totals?.revenueSatang ?? 0;
    const roas = spendSatang > 0 ? revenueSatang / spendSatang : null;
    const effectiveStatus = campaign.effectiveStatus || campaign.status;
    const ageDays = Math.max(
      0,
      (now - (campaign.metaCreatedTime || campaign.createdAt).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    const status: MediaBuyerQueueStatus = isPaused(effectiveStatus)
      ? "PAUSED"
      : ageDays <= LEARNING_DAYS
        ? "LEARNING"
        : spendSatang >= SCALE_MIN_SPEND_SATANG && roas !== null && roas >= SCALE_MIN_ROAS
          ? "SCALING"
          : "OPTIMIZING";
    items.push({
      id: campaign.id,
      source: "META_CAMPAIGN",
      status,
      campaignName: campaign.name,
      pageName: null,
      adAccountId: campaign.adAccount.id,
      adAccountName: campaign.adAccount.name,
      productCategory: null,
      metaCampaignId: campaign.id,
      effectiveStatus,
      spendSatang,
      purchases,
      revenueSatang,
      roas,
      reason: MEDIA_BUYER_QUEUE_DEFINITIONS[status].description,
      updatedAt: campaign.updatedAt,
    });
  }

  const counts = Object.fromEntries(
    MEDIA_BUYER_QUEUE_STATUSES.map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  ) as Record<MediaBuyerQueueStatus, number>;
  const sorted = items.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

  return {
    queueVersion: MEDIA_BUYER_QUEUE_VERSION,
    statuses: MEDIA_BUYER_QUEUE_STATUSES.map((status) => ({
      status,
      ...MEDIA_BUYER_QUEUE_DEFINITIONS[status],
      count: counts[status],
    })),
    totalItems: items.length,
    counts,
    items: sorted.slice(0, take),
    policy: {
      learningDays: LEARNING_DAYS,
      scaleMinimumSpendSatang: SCALE_MIN_SPEND_SATANG,
      scaleMinimumRoas: SCALE_MIN_ROAS,
      ownerApprovalRequiredForNeedReview: true,
    },
    safety: {
      readOnlyProjection: true,
      metaMutationExecuted: false,
      budgetChanged: false,
      campaignPublished: false,
    },
  };
}
