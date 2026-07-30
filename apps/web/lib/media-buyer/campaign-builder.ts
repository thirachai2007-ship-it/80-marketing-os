import { createHash } from "node:crypto";

import {
  selectCampaignCandidates,
  type CandidateProductCategory,
  type SelectedCampaignCandidate,
} from "@/lib/media-buyer/candidate-selector";
import { resolveFallbackCreativeMode } from "@/lib/media-buyer/content-fallback-policy";
import prisma from "@/lib/prisma";

export const CAMPAIGN_BUILDER_VERSION =
  "campaign-builder-v2";

const DEFAULT_ALLOCATIONS: Record<
  CandidateProductCategory,
  number
> = {
  COTTON_DTF: 20,
  DTG: 15,
  PRINTED_SHIRT: 40,
  APRON: 10,
  STICKER: 15,
};

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN Sticker",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type AudienceRole =
  | "PROSPECTING"
  | "RETARGETING"
  | "EXPANSION";

type PlacementPlan = {
  placements: string[];
  rationale: string;
};

type SchedulePlan = {
  timezone: string;
  scheduleStart: string;
  scheduleEnd: string;
  activeDays: number[];
  holidayAware: boolean;
};

type SelectedAudience = {
  id: string;
  audienceType: string;
  approvalStatus: string;
  learningStatus: string;
  strategyName: string | null;
  allocationPercent: number;
  role: AudienceRole;
  metadataJson: string;
};

export type BuildCampaignOptions = {
  pageId: string;
  productCategory: CandidateProductCategory;
  forceRebuild?: boolean;
};

export type BuildCampaignResult = {
  builderVersion: string;

  status:
    | "CREATED"
    | "EXISTING"
    | "SKIPPED"
    | "FAILED";

  pageId: string;
  pageName?: string;
  productCategory: CandidateProductCategory;

  campaignDraftId?: string;
  campaignName?: string;
  adSetName?: string;
  objective?: string;

  selectedAds?: number;
  selectedAudienceAssetIds?: string[];

  forecastDailyBudgetSatang?: number;
  forecastLearningSpendSatang?: number;
  forecastLifeCycleDays?: number;

  campaignFingerprint?: string;
  campaignConfidence?: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;

  reason?: string;
};

export type BuildCampaignBatchOptions = {
  batchSize?: number;
  pageId?: string;
  adAccountId?: string;
  productCategory?: CandidateProductCategory;
  forceRebuild?: boolean;
};

export type BuildCampaignBatchResult = {
  builderVersion: string;
  scanned: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;
  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  results: BuildCampaignResult[];
};

function normalizePageName(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(value ?? DEFAULT_BATCH_SIZE),
      1,
    ),
    MAX_BATCH_SIZE,
  );
}

function isStickerOnlyPage(
  pageName: string,
): boolean {
  const normalizedPageName =
    normalizePageName(pageName);

  return STICKER_ONLY_PAGE_NAMES.some(
    (restrictedName) =>
      normalizedPageName.includes(
        normalizePageName(restrictedName),
      ),
  );
}

function getBangkokDateLabel(): string {
  const parts =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

  const year =
    parts.find(
      (part) => part.type === "year",
    )?.value ?? "0000";

  const month =
    parts.find(
      (part) => part.type === "month",
    )?.value ?? "00";

  const day =
    parts.find(
      (part) => part.type === "day",
    )?.value ?? "00";

  return `${year}${month}${day}`;
}

function calculateBudgetSatang(
  pageBudgetSatang: number,
  allocationPercent: number,
): number {
  if (
    pageBudgetSatang <= 0 ||
    allocationPercent <= 0
  ) {
    return 0;
  }

  return Math.floor(
    pageBudgetSatang *
      (allocationPercent / 100),
  );
}

function getCampaignName(input: {
  pageName: string;
  productCategory: CandidateProductCategory;
  fingerprint: string;
}): string {
  return [
    "80AI",
    input.pageName,
    input.productCategory,
    getBangkokDateLabel(),
    input.fingerprint.slice(0, 8),
  ].join(" | ");
}

function getAdSetName(input: {
  productCategory: CandidateProductCategory;
  audienceCount: number;
}): string {
  return [
    "80AI",
    input.productCategory,
    `${input.audienceCount}-AUD`,
    "08:45-18:00",
    "MON-SAT",
  ].join(" | ");
}

function chooseObjective(
  candidates: SelectedCampaignCandidate[],
): string {
  const objectives =
    candidates
      .map(
        (candidate) =>
          normalizeText(
            candidate.analysis
              .suggestedObjective,
          ).toUpperCase(),
      )
      .filter(Boolean);

  if (
    objectives.some(
      (value) =>
        value.includes("SALES") ||
        value.includes("CONVERSION"),
    )
  ) {
    return "OUTCOME_SALES";
  }

  if (
    objectives.some(
      (value) =>
        value.includes("MESSAGE") ||
        value.includes("ENGAGEMENT"),
    )
  ) {
    return "OUTCOME_ENGAGEMENT";
  }

  if (
    objectives.some(
      (value) =>
        value.includes("LEAD"),
    )
  ) {
    return "OUTCOME_LEADS";
  }

  return "OUTCOME_LEADS";
}

function chooseCreativeMode(
  candidate: SelectedCampaignCandidate,
): string {
  if (candidate.selectionMode === "WINNING_FALLBACK") {
    return resolveFallbackCreativeMode(candidate.selectionMode, "EXISTING_POST");
  }
  if (
    candidate.analysis
      .recommendation ===
      "USE_EXISTING_POST" &&
    candidate.analysis.useExistingPost
  ) {
    return "EXISTING_POST";
  }

  if (
    candidate.analysis
      .recommendation ===
      "CREATE_DARK_POST" &&
    candidate.analysis
      .darkPostEligible
  ) {
    return "DARK_POST_REQUIRED";
  }

  throw new Error(
    `Candidate ${candidate.id} ไม่มี Creative Mode ที่อนุญาต`,
  );
}

function buildCandidateAudit(
  candidate: SelectedCampaignCandidate,
) {
  return {
    contentId: candidate.id,
    pageId: candidate.pageId,
    pageName: candidate.pageName,
    productCategory:
      candidate.productCategory,

    AIAnalysis: {
      totalScore:
        candidate.analysis.totalScore,
      recommendation:
        candidate.analysis
          .recommendation,
      useExistingPost:
        candidate.analysis
          .useExistingPost,
      darkPostEligible:
        candidate.analysis
          .darkPostEligible,
      suggestedObjective:
        candidate.analysis
          .suggestedObjective,
      summary:
        candidate.analysis.summary,
    },

    priority: candidate.priority,
    selectionReason:
      candidate.selectionReason,
    creativeFamilyKey:
      candidate.creativeFamilyKey,
    audienceKeys:
      candidate.audienceKeys,
    previousWinner:
      candidate.previousWinner,
    wasPreviouslyUsed:
      candidate.wasPreviouslyUsed,
    isOldContent:
      candidate.isOldContent,
    isDuplicate:
      candidate.isDuplicate,
  };
}

function safeParseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // คืน Object ว่าง
  }

  return {};
}

function readAllocationPercent(
  metadataJson: string,
): number {
  const metadata =
    safeParseObject(metadataJson);

  const direct =
    metadata.allocationPercent;

  if (
    typeof direct === "number" &&
    Number.isFinite(direct)
  ) {
    return Math.min(
      Math.max(Math.round(direct), 0),
      100,
    );
  }

  const strategy =
    metadata.strategy;

  if (
    strategy &&
    typeof strategy === "object" &&
    !Array.isArray(strategy)
  ) {
    const value =
      (
        strategy as Record<
          string,
          unknown
        >
      ).allocationPercent;

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return Math.min(
        Math.max(Math.round(value), 0),
        100,
      );
    }
  }

  return 0;
}

function audienceRole(
  audienceType: string,
): AudienceRole {
  const normalized =
    normalizeText(
      audienceType,
    ).toUpperCase();

  if (
    normalized === "RETARGETING" ||
    normalized.includes("ENGAGEMENT") ||
    normalized === "WEBSITE_VISITOR"
  ) {
    return "RETARGETING";
  }

  if (normalized === "LOOKALIKE") {
    return "EXPANSION";
  }

  return "PROSPECTING";
}

function choosePlacementPlan(input: {
  candidates: SelectedCampaignCandidate[];
  selectedAudiences: SelectedAudience[];
}): PlacementPlan {
  const hasVideo =
    input.candidates.some(
      (candidate) =>
        normalizeText(
          candidate.mediaType,
        ).toUpperCase() ===
        "VIDEO",
    );

  const hasRetargeting =
    input.selectedAudiences.some(
      (audience) =>
        audience.role ===
        "RETARGETING",
    );

  const placements = hasVideo
    ? [
        "FACEBOOK_FEED",
        "INSTAGRAM_FEED",
        "FACEBOOK_REELS",
        "INSTAGRAM_REELS",
        "FACEBOOK_STORIES",
        "INSTAGRAM_STORIES",
      ]
    : [
        "FACEBOOK_FEED",
        "INSTAGRAM_FEED",
        "FACEBOOK_MARKETPLACE",
      ];

  if (hasRetargeting) {
    placements.push(
      "MESSENGER_INBOX",
    );
  }

  return {
    placements:
      [...new Set(placements)],

    rationale:
      hasVideo
        ? "มี Video Creative จึงเพิ่ม Reels และ Stories"
        : "Creative หลักเป็นภาพ จึงเน้น Feed และ Marketplace",
  };
}

function createSchedulePlan(): SchedulePlan {
  return {
    timezone:
      "Asia/Bangkok",

    scheduleStart:
      "08:45",

    scheduleEnd:
      "18:00",

    activeDays: [
      1,
      2,
      3,
      4,
      5,
      6,
    ],

    holidayAware:
      true,
  };
}

function createFingerprint(input: {
  pageId: string;
  adAccountId: string;
  productCategory: CandidateProductCategory;
  objective: string;
  candidateIds: string[];
  audienceIds: string[];
  schedule: SchedulePlan;
}): string {
  const raw =
    JSON.stringify({
      pageId:
        input.pageId,
      adAccountId:
        input.adAccountId,
      productCategory:
        input.productCategory,
      objective:
        input.objective,
      candidateIds:
        [...input.candidateIds].sort(),
      audienceIds:
        [...input.audienceIds].sort(),
      schedule:
        input.schedule,
    });

  return createHash("sha256")
    .update(raw)
    .digest("hex");
}

function calculateCampaignConfidence(input: {
  candidateCount: number;
  minimumAds: number;
  averageCandidateScore: number;
  audienceCount: number;
  approvedAudienceCount: number;
}): number {
  let confidence = 50;

  if (
    input.candidateCount >=
    input.minimumAds
  ) {
    confidence += 15;
  }

  if (
    input.averageCandidateScore >=
    85
  ) {
    confidence += 15;
  } else if (
    input.averageCandidateScore >=
    80
  ) {
    confidence += 10;
  }

  if (input.audienceCount >= 2) {
    confidence += 10;
  }

  if (
    input.approvedAudienceCount ===
      input.audienceCount &&
    input.audienceCount > 0
  ) {
    confidence += 10;
  }

  return Math.min(
    Math.max(
      Math.round(confidence),
      0,
    ),
    100,
  );
}

function normalizeAudienceAllocations(
  audiences: SelectedAudience[],
): SelectedAudience[] {
  if (audiences.length === 0) {
    return [];
  }

  const total =
    audiences.reduce(
      (sum, audience) =>
        sum +
        Math.max(
          audience.allocationPercent,
          0,
        ),
      0,
    );

  let assigned = 0;

  return audiences.map(
    (audience, index) => {
      const allocationPercent =
        index ===
        audiences.length - 1
          ? 100 - assigned
          : total > 0
            ? Math.round(
                (
                  audience.allocationPercent /
                  total
                ) *
                  100,
              )
            : Math.floor(
                100 /
                  audiences.length,
              );

      assigned += allocationPercent;

      return {
        ...audience,
        allocationPercent,
      };
    },
  );
}

/**
 * AI Campaign Builder v2
 *
 * เพิ่มจาก v1:
 * - Audience Asset integration
 * - Audience allocation
 * - Placement planning
 * - Objective intelligence
 * - Campaign fingerprint
 * - Confidence score
 * - Learning status integration
 *
 * Safety:
 * - ไม่เรียก Meta API
 * - ไม่ Publish
 * - ไม่ใช้เงินจริง
 * - ทุก Draft เป็น PAUSED
 */
export async function buildCampaignDraft(
  options: BuildCampaignOptions,
): Promise<BuildCampaignResult> {
  const page =
    await prisma.managedPage.findUnique({
      where: {
        id:
          options.pageId,
      },

      select: {
        id: true,
        name: true,
        isActive: true,
        adAccountId: true,
        forecastDailyBudgetSatang:
          true,

        adAccount: {
          select: {
            id: true,
            isActive: true,
            timezone: true,
          },
        },

        productPolicies: {
          where: {
            productCategory:
              options.productCategory,
            isEnabled: true,
          },

          select: {
            productCategory: true,
            allocationPercent: true,
            minimumScore: true,
            minimumAds: true,
            maximumAds: true,
            allowExistingPost: true,
            allowDarkPost: true,
            useOldWinningContent: true,
            isEnabled: true,
          },
        },
      },
    });

  const safety = {
    ownerApprovalRequired:
      true as const,
    campaignPublished:
      false as const,
    realSpendUsed:
      false as const,
    budgetChanged:
      false as const,
  };

  if (!page) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        options.pageId,
      productCategory:
        options.productCategory,
      ...safety,
      reason:
        "ไม่พบ ManagedPage ที่ระบุ",
    };
  }

  if (!page.isActive) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      ...safety,
      reason:
        "เพจนี้ถูกปิดใช้งาน",
    };
  }

  if (
    isStickerOnlyPage(page.name) &&
    options.productCategory !==
      "STICKER"
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      ...safety,
      reason:
        "Master Spec ข้อ 51: เพจนี้สร้าง Campaign ได้เฉพาะสติกเกอร์",
    };
  }

  if (
    !page.adAccountId ||
    !page.adAccount ||
    !page.adAccount.isActive
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      ...safety,
      reason:
        "Ad Account Mapping ยังไม่พร้อมใช้งาน",
    };
  }

  if (
    page.forecastDailyBudgetSatang <=
    0
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      ...safety,
      reason:
        "ยังไม่ได้กำหนด Forecast Daily Budget ของเพจ",
    };
  }

  const existingDraft =
    await prisma.campaignDraft.findFirst({
      where: {
        pageId:
          page.id,
        adAccountId:
          page.adAccountId,
        productCategory:
          options.productCategory,
        status: {
          in: [
            "PLANNING",
            "PAUSED",
            "READY_FOR_APPROVAL",
          ],
        },
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      select: {
        id: true,
        campaignName: true,
        adSetName: true,
        objective: true,
        status: true,
        forecastDailyBudgetSatang:
          true,
        forecastLearningSpendSatang:
          true,
        forecastLifeCycleDays:
          true,

        audienceUsages: {
          select: {
            audienceAssetId:
              true,
          },
        },

        ads: {
          select: {
            id: true,
          },
        },
      },
    });

  if (
    existingDraft &&
    !options.forceRebuild
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "EXISTING",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      campaignDraftId:
        existingDraft.id,
      campaignName:
        existingDraft.campaignName,
      adSetName:
        existingDraft.adSetName,
      objective:
        existingDraft.objective,
      selectedAds:
        existingDraft.ads.length,
      selectedAudienceAssetIds:
        existingDraft.audienceUsages.map(
          (item) =>
            item.audienceAssetId,
        ),
      forecastDailyBudgetSatang:
        existingDraft.forecastDailyBudgetSatang,
      forecastLearningSpendSatang:
        existingDraft.forecastLearningSpendSatang ??
        undefined,
      forecastLifeCycleDays:
        existingDraft.forecastLifeCycleDays ??
        undefined,
      ...safety,
      reason:
        `มี Campaign Draft สถานะ ${existingDraft.status} สำหรับเพจและสินค้านี้อยู่แล้ว`,
    };
  }

  const configuredPolicy =
    page.productPolicies[0];

  const minimumScore =
    configuredPolicy?.minimumScore ??
    80;

  const minimumAds =
    configuredPolicy?.minimumAds ??
    3;

  const maximumAds =
    Math.max(
      configuredPolicy?.maximumAds ??
        3,
      minimumAds,
    );

  const allowExistingPost =
    configuredPolicy
      ?.allowExistingPost ?? true;

  const allowDarkPost =
    configuredPolicy
      ?.allowDarkPost ?? true;

  const useOldWinningContent =
    configuredPolicy
      ?.useOldWinningContent ?? true;

  const allocationPercent =
    isStickerOnlyPage(page.name)
      ? 100
      : configuredPolicy
          ?.allocationPercent ??
        DEFAULT_ALLOCATIONS[
          options.productCategory
        ];

  const forecastDailyBudgetSatang =
    calculateBudgetSatang(
      page.forecastDailyBudgetSatang,
      allocationPercent,
    );

  if (
    forecastDailyBudgetSatang <= 0
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      forecastDailyBudgetSatang,
      ...safety,
      reason:
        "Forecast Budget ของสินค้าประเภทนี้เป็น 0",
    };
  }

  const selectorResult =
    await selectCampaignCandidates({
      pageId:
        page.id,
      productCategory:
        options.productCategory,
      minimumScore,
      minimumAds,
      maximumAds,
      allowExistingPost,
      allowDarkPost,
      useOldWinningContent,
      candidateLimit:
        300,
    });

  if (
    !selectorResult
      .hasEnoughCandidates
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      selectedAds:
        selectorResult
          .selectedCandidateCount,
      forecastDailyBudgetSatang,
      ...safety,
      reason:
        `Candidate Selector เลือกได้ ${selectorResult.selectedCandidateCount} โพสต์ แต่ต้องการขั้นต่ำ ${minimumAds} โพสต์`,
    };
  }

  const rawAudiences =
    await prisma.audienceAsset.findMany({
      where: {
        adAccountId:
          page.adAccountId,
        pageId:
          page.id,
        productCategory:
          options.productCategory,
        isActive:
          true,
        status: {
          in: [
            "DRAFT",
            "READY",
            "ACTIVE",
          ],
        },
      },

      orderBy: [
        {
          updatedAt:
            "desc",
        },
      ],

      take:
        6,

      select: {
        id: true,
        audienceType: true,
        approvalStatus: true,
        learningStatus: true,
        metadataJson: true,

        versions: {
          where: {
            isSelected:
              true,
          },

          orderBy: {
            version:
              "desc",
          },

          take: 1,

          select: {
            strategyName: true,
          },
        },
      },
    });

  if (
    rawAudiences.length === 0
  ) {
    return {
      builderVersion:
        CAMPAIGN_BUILDER_VERSION,
      status:
        "SKIPPED",
      pageId:
        page.id,
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      selectedAds:
        selectorResult
          .selectedCandidateCount,
      forecastDailyBudgetSatang,
      ...safety,
      reason:
        "ยังไม่มี Audience Asset สำหรับเพจและสินค้านี้",
    };
  }

  const selectedAudiences =
    normalizeAudienceAllocations(
      rawAudiences
        .map(
          (audience): SelectedAudience => ({
            id:
              audience.id,
            audienceType:
              audience.audienceType,
            approvalStatus:
              audience.approvalStatus,
            learningStatus:
              audience.learningStatus,
            strategyName:
              audience.versions[0]
                ?.strategyName ??
              null,
            allocationPercent:
              readAllocationPercent(
                audience.metadataJson,
              ),
            role:
              audienceRole(
                audience.audienceType,
              ),
            metadataJson:
              audience.metadataJson,
          }),
        )
        .sort((left, right) => {
          const ranking =
            (status: string) => {
              switch (status) {
                case "WINNING":
                  return 1;
                case "SEED_CANDIDATE":
                  return 2;
                case "STABLE":
                  return 3;
                case "COLLECTING_DATA":
                  return 4;
                case "NEED_OPTIMIZATION":
                  return 5;
                default:
                  return 6;
              }
            };

          return (
            ranking(
              left.learningStatus,
            ) -
            ranking(
              right.learningStatus,
            )
          );
        })
        .slice(0, 4),
    );

  const selectedCandidates =
    selectorResult.selectedCandidates;

  const objective =
    chooseObjective(
      selectedCandidates,
    );

  const schedulePlan =
    createSchedulePlan();

  const placementPlan =
    choosePlacementPlan({
      candidates:
        selectedCandidates,
      selectedAudiences,
    });

  const campaignFingerprint =
    createFingerprint({
      pageId:
        page.id,
      adAccountId:
        page.adAccountId,
      productCategory:
        options.productCategory,
      objective,
      candidateIds:
        selectedCandidates.map(
          (candidate) =>
            candidate.id,
        ),
      audienceIds:
        selectedAudiences.map(
          (audience) =>
            audience.id,
        ),
      schedule:
        schedulePlan,
    });

  const campaignName =
    getCampaignName({
      pageName:
        page.name,
      productCategory:
        options.productCategory,
      fingerprint:
        campaignFingerprint,
    });

  const adSetName =
    getAdSetName({
      productCategory:
        options.productCategory,
      audienceCount:
        selectedAudiences.length,
    });

  const forecastLearningSpendSatang =
    forecastDailyBudgetSatang *
    7;

  const forecastLifeCycleDays =
    14;

  const averageCandidateScore =
    selectedCandidates.reduce(
      (sum, candidate) =>
        sum +
        candidate.analysis
          .totalScore,
      0,
    ) /
    selectedCandidates.length;

  const campaignConfidence =
    calculateCampaignConfidence({
      candidateCount:
        selectedCandidates.length,
      minimumAds,
      averageCandidateScore,
      audienceCount:
        selectedAudiences.length,
      approvedAudienceCount:
        selectedAudiences.filter(
          (audience) =>
            audience.approvalStatus ===
            "APPROVED",
        ).length,
    });

  const completedAt =
    new Date();

  const campaignDraft =
    await prisma.$transaction(
      async (tx) => {
        const createdDraft =
          await tx.campaignDraft.create({
            data: {
              pageId:
                page.id,
              adAccountId:
                page.adAccountId!,
              productCategory:
                options.productCategory,
              campaignName,
              adSetName,
              objective,
              forecastDailyBudgetSatang,
              forecastLearningSpendSatang,
              forecastLifeCycleDays,
              timezone:
                schedulePlan.timezone,
              scheduleStart:
                schedulePlan.scheduleStart,
              scheduleEnd:
                schedulePlan.scheduleEnd,
              activeDaysJson:
                JSON.stringify(
                  schedulePlan.activeDays,
                ),
              status:
                "PAUSED",
            },
          });

        for (
          const audience of
            selectedAudiences
        ) {
          await tx.audienceUsage.create({
            data: {
              audienceAssetId:
                audience.id,
              campaignDraftId:
                createdDraft.id,
              role:
                audience.role,
              status:
                "PLANNED",
              allocationPercent:
                audience.allocationPercent,
              budgetSatang:
                Math.floor(
                  (
                    forecastDailyBudgetSatang *
                    audience.allocationPercent
                  ) /
                    100,
                ),
              metadataJson:
                JSON.stringify({
                  builderVersion:
                    CAMPAIGN_BUILDER_VERSION,
                  strategyName:
                    audience.strategyName,
                  learningStatus:
                    audience.learningStatus,
                  approvalStatus:
                    audience.approvalStatus,
                  placementPlan:
                    placementPlan.placements,
                }),
            },
          });
        }

        for (
          let index = 0;
          index <
          selectedCandidates.length;
          index += 1
        ) {
          const candidate =
            selectedCandidates[index];

          const creativeMode =
            chooseCreativeMode(
              candidate,
            );

          await tx.campaignDraftAd.create({
            data: {
              campaignDraftId:
                createdDraft.id,
              contentId:
                candidate.id,
              darkPostCopyId:
                null,
              adNumber:
                index + 1,
              creativeMode,
              adName: [
                campaignName,
                `AD-${index + 1}`,
                `AI-${candidate.analysis.totalScore}`,
                `PRIORITY-${candidate.priority.finalPriorityScore}`,
              ].join(" | "),
              primaryText:
                creativeMode ===
                "EXISTING_POST"
                  ? null
                  : candidate.message,
              headline:
                null,
              description:
                null,
              callToAction:
                "SEND_MESSAGE",
              metaCreativeId:
                null,
              metaAdId:
                null,
              status:
                "PLANNED",
            },
          });

          await tx.pageContent.update({
            where: {
              id:
                candidate.id,
            },
            data: {
              wasPreviouslyUsed:
                true,
              campaignStatus:
                "PLANNED",
            },
          });
        }

        await tx.decisionLog.create({
          data: {
            campaignDraftId:
              createdDraft.id,
            decisionType:
              "CAMPAIGN_BUILDING",
            action:
              "CREATE_PAUSED_CAMPAIGN_DRAFT_V2",
            reason:
              `Campaign Builder v2 สร้าง Draft จาก ${selectedCandidates.length} Creative และ ${selectedAudiences.length} Audience โดยไม่มีการใช้เงินจริง`,
            confidence:
              campaignConfidence,
            inputJson:
              JSON.stringify({
                builderVersion:
                  CAMPAIGN_BUILDER_VERSION,
                selectorVersion:
                  selectorResult.selectorVersion,
                pageId:
                  page.id,
                pageName:
                  page.name,
                adAccountId:
                  page.adAccountId,
                productCategory:
                  options.productCategory,
                campaignFingerprint,
                productPolicy: {
                  minimumScore,
                  minimumAds,
                  maximumAds,
                  allowExistingPost,
                  allowDarkPost,
                  useOldWinningContent,
                  allocationPercent,
                },
                pageForecastDailyBudgetSatang:
                  page.forecastDailyBudgetSatang,
                audiencePlan:
                  selectedAudiences,
                placementPlan,
                schedulePlan,
                selectorSummary: {
                  rawCandidateCount:
                    selectorResult
                      .rawCandidateCount,
                  eligibleCandidateCount:
                    selectorResult
                      .eligibleCandidateCount,
                  selectedCandidateCount:
                    selectorResult
                      .selectedCandidateCount,
                  rejectedCandidateCount:
                    selectorResult
                      .rejectedCandidates
                      .length,
                },
                selectedCandidates:
                  selectedCandidates.map(
                    buildCandidateAudit,
                  ),
              }),
            outputJson:
              JSON.stringify({
                campaignDraftId:
                  createdDraft.id,
                campaignName,
                adSetName,
                objective,
                campaignFingerprint,
                campaignConfidence,
                selectedAds:
                  selectedCandidates.length,
                selectedAudienceAssetIds:
                  selectedAudiences.map(
                    (audience) =>
                      audience.id,
                  ),
                forecastDailyBudgetSatang,
                forecastLearningSpendSatang,
                forecastLifeCycleDays,
                placementPlan,
                schedulePlan,
                status:
                  "PAUSED",
                ownerApprovalRequired:
                  true,
                campaignPublished:
                  false,
                realSpendUsed:
                  false,
                createdAt:
                  completedAt.toISOString(),
              }),
            policyJson:
              JSON.stringify({
                noRealSpend:
                  true,
                campaignCreatedInMeta:
                  false,
                ownerApprovalRequired:
                  true,
                initialCampaignStatus:
                  "PAUSED",
                mappedAdAccountOnly:
                  true,
                samePageContentOnly:
                  true,
                productSeparation:
                  true,
                audienceLearningIntegrated:
                  true,
                campaignFingerprintEnabled:
                  true,
                schedule:
                  schedulePlan,
                placementPlan:
                  placementPlan.placements,
                netProfitFirst:
                  true,
              }),
            policyReference:
              "Master Spec 7-19, 29-59, 64, 66-72",
          },
        });

        return createdDraft;
      },
    );

  return {
    builderVersion:
      CAMPAIGN_BUILDER_VERSION,
    status:
      "CREATED",
    pageId:
      page.id,
    pageName:
      page.name,
    productCategory:
      options.productCategory,
    campaignDraftId:
      campaignDraft.id,
    campaignName,
    adSetName,
    objective,
    selectedAds:
      selectedCandidates.length,
    selectedAudienceAssetIds:
      selectedAudiences.map(
        (audience) =>
          audience.id,
      ),
    forecastDailyBudgetSatang,
    forecastLearningSpendSatang,
    forecastLifeCycleDays,
    campaignFingerprint,
    campaignConfidence,
    ...safety,
    reason:
      "สร้าง Campaign Draft v2 สำเร็จ โดยยังไม่ Publish และยังไม่ใช้เงินจริง",
  };
}

export async function runCampaignBuilderBatch(
  options:
    BuildCampaignBatchOptions = {},
): Promise<BuildCampaignBatchResult> {
  const pages =
    await prisma.managedPage.findMany({
      where: {
        isActive:
          true,
        adAccountId: {
          not:
            null,
        },
        ...(options.pageId
          ? {
              id:
                options.pageId,
            }
          : {}),
        ...(options.adAccountId
          ? {
              adAccountId:
                options.adAccountId,
            }
          : {}),
        productPolicies: {
          some: {
            isEnabled:
              true,
            ...(options.productCategory
              ? {
                  productCategory:
                    options.productCategory,
                }
              : {}),
          },
        },
      },

      orderBy: {
        updatedAt:
          "asc",
      },

      take:
        normalizeBatchSize(
          options.batchSize,
        ),

      select: {
        id: true,

        productPolicies: {
          where: {
            isEnabled:
              true,
            ...(options.productCategory
              ? {
                  productCategory:
                    options.productCategory,
                }
              : {}),
          },

          select: {
            productCategory:
              true,
          },
        },
      },
    });

  const jobs =
    pages.flatMap(
      (page) =>
        page.productPolicies.map(
          (policy) => ({
            pageId:
              page.id,
            productCategory:
              policy.productCategory as
                CandidateProductCategory,
          }),
        ),
    );

  const results:
    BuildCampaignResult[] =
    [];

  for (const job of jobs) {
    try {
      results.push(
        await buildCampaignDraft({
          pageId:
            job.pageId,
          productCategory:
            job.productCategory,
          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        builderVersion:
          CAMPAIGN_BUILDER_VERSION,
        status:
          "FAILED",
        pageId:
          job.pageId,
        productCategory:
          job.productCategory,
        ownerApprovalRequired:
          true,
        campaignPublished:
          false,
        realSpendUsed:
          false,
        budgetChanged:
          false,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown Campaign Builder v2 error",
      });
    }
  }

  return {
    builderVersion:
      CAMPAIGN_BUILDER_VERSION,
    scanned:
      jobs.length,
    created:
      results.filter(
        (item) =>
          item.status ===
          "CREATED",
      ).length,
    existing:
      results.filter(
        (item) =>
          item.status ===
          "EXISTING",
      ).length,
    skipped:
      results.filter(
        (item) =>
          item.status ===
          "SKIPPED",
      ).length,
    failed:
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length,
    ownerApprovalRequired:
      true,
    campaignPublished:
      false,
    realSpendUsed:
      false,
    budgetChanged:
      false,
    results,
  };
}
