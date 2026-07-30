import {
  calculateCampaignPriority,
  isEligibleCampaignCandidate,
  type CampaignPriorityBreakdown,
} from "@/lib/media-buyer/campaign-priority";
import { calibrateAiScore } from "@/lib/media-buyer/score-calibration";

import prisma from "@/lib/prisma";
import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import {
  chooseFreshOrWinningFallback,
  isFreshContent,
} from "@/lib/media-buyer/content-fallback-policy";

export const CANDIDATE_SELECTOR_VERSION =
  "candidate-selector-v3.1";

export type CandidateProductCategory =
  | "COTTON_DTF"
  | "DTG"
  | "PRINTED_SHIRT"
  | "APRON"
  | "STICKER";

export type CandidateSelectorOptions = {
  pageId: string;
  productCategory: CandidateProductCategory;

  minimumScore: number;
  minimumAds: number;
  maximumAds: number;

  allowExistingPost: boolean;
  allowDarkPost: boolean;
  useOldWinningContent: boolean;

  candidateLimit?: number;
};

type CandidateAudiencePlan = {
  strategy: string;
  confidence: number;
  gender: string;
  ageMin: number;
  ageMax: number;
  businessTypesJson: string;
  interestsJson: string;
};

type CandidateAnalysis = {
  id: string;
  totalScore: number;
  recommendation: string;
  useExistingPost: boolean;
  darkPostEligible: boolean;
  suggestedObjective: string | null;
  summary: string;
  confidence?: string;
  audienceFitScore?: number;
  audiencePlan: CandidateAudiencePlan | null;
};

type CandidatePolicyInput = {
  id: string;
  createdTime: Date | null;

  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  isDuplicate: boolean;
  isOldContent: boolean;

  productConfidence: number | null;

  analysis: CandidateAnalysis;
};

type CreativeAssetEngineMetadata = {
  creativeScore?: number;
  rankingScore?: number;
  rankLabel?: string;
  heroCreative?: boolean;
  darkPostCandidate?: boolean;
  evergreenCandidate?: boolean;
  seasonalCandidate?: boolean;
};

export type SelectedCampaignCandidate = {
  id: string;
  pageId: string;
  pageName: string;

  message: string;
  postId: string;
  objectStoryId: string;

  permalinkUrl: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  createdTime: Date | null;

  fingerprint: string | null;
  contentFingerprint: string | null;
  messageHash: string | null;
  imageHash: string | null;
  videoHash: string | null;

  productCategory: string;
  productConfidence: number | null;

  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  isDuplicate: boolean;
  isOldContent: boolean;

  creativeAssetId: string;
  creativeRevisionId: string | null;
  creativeAssetStatus: string;
  creativeApprovalStatus: string;
  creativeScore: number;
  rankingScore: number;
  rankLabel: string;
  heroCreative: boolean;
  evergreenCandidate: boolean;
  seasonalCandidate: boolean;

  analysis: CandidateAnalysis;

  priority: CampaignPriorityBreakdown;

  audienceKeys: string[];
  creativeFamilyKey: string;

  selectionReason: string;
  selectionMode: "FRESH" | "WINNING_FALLBACK";
};

export type CandidateRejection = {
  contentId: string;
  creativeAssetId?: string;
  reason: string;
};

export type CandidateSelectorResult = {
  selectorVersion: string;

  pageId: string;
  productCategory: CandidateProductCategory;

  rawCandidateCount: number;
  eligibleCandidateCount: number;
  selectedCandidateCount: number;

  minimumAds: number;
  maximumAds: number;

  hasEnoughCandidates: boolean;

  selectedCandidates:
    SelectedCampaignCandidate[];

  rejectedCandidates:
    CandidateRejection[];
};

function normalizeLimit(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return 200;
  }

  return Math.min(
    Math.max(
      Math.floor(value ?? 200),
      1,
    ),
    500,
  );
}

function normalizeKey(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
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
    // Return empty object.
  }

  return {};
}

function safeParseStringArray(
  value?: string | null,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is string =>
          typeof item === "string",
      )
      .map(normalizeKey)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function numberValue(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function booleanValue(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function stringValue(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function readCreativeEngineMetadata(
  metadataJson?: string | null,
): CreativeAssetEngineMetadata {
  const root =
    safeParseObject(
      metadataJson,
    );

  const engine =
    root.creativeAssetEngine;

  if (
    !engine ||
    typeof engine !== "object" ||
    Array.isArray(engine)
  ) {
    return {};
  }

  const value =
    engine as Record<string, unknown>;

  return {
    creativeScore:
      numberValue(
        value.creativeScore,
        0,
      ),

    rankingScore:
      numberValue(
        value.rankingScore,
        0,
      ),

    rankLabel:
      stringValue(
        value.rankLabel,
        "UNRANKED",
      ),

    heroCreative:
      booleanValue(
        value.heroCreative,
        false,
      ),

    darkPostCandidate:
      booleanValue(
        value.darkPostCandidate,
        false,
      ),

    evergreenCandidate:
      booleanValue(
        value.evergreenCandidate,
        false,
      ),

    seasonalCandidate:
      booleanValue(
        value.seasonalCandidate,
        false,
      ),
  };
}

function buildCreativeFamilyKey(input: {
  creativeAssetId: string;
  creativeRevisionId: string | null;
  mediaType: string;
  imageHash: string | null;
  videoHash: string | null;
  contentFingerprint: string | null;
  fingerprint: string | null;
}): string {
  const mediaType =
    normalizeKey(input.mediaType);

  if (input.creativeRevisionId) {
    return [
      mediaType,
      "REVISION",
      input.creativeRevisionId,
    ].join(":");
  }

  if (input.imageHash) {
    return [
      mediaType,
      "IMAGE",
      input.imageHash,
    ].join(":");
  }

  if (input.videoHash) {
    return [
      mediaType,
      "VIDEO",
      input.videoHash,
    ].join(":");
  }

  if (input.contentFingerprint) {
    return [
      mediaType,
      "CONTENT",
      input.contentFingerprint,
    ].join(":");
  }

  if (input.fingerprint) {
    return [
      mediaType,
      "MASTER",
      input.fingerprint,
    ].join(":");
  }

  return [
    mediaType,
    "ASSET",
    input.creativeAssetId,
  ].join(":");
}

function buildAudienceKeys(
  analysis: CandidateAnalysis,
): string[] {
  const keys = new Set<string>();

  const strategy =
    normalizeKey(
      analysis.audiencePlan?.strategy,
    );

  if (strategy) {
    keys.add(`strategy:${strategy}`);
  }

  const businessTypes =
    safeParseStringArray(
      analysis.audiencePlan
        ?.businessTypesJson,
    );

  for (
    const businessType of businessTypes
  ) {
    keys.add(
      `business:${businessType}`,
    );
  }

  const interests =
    safeParseStringArray(
      analysis.audiencePlan
        ?.interestsJson,
    );

  for (const interest of interests) {
    keys.add(
      `interest:${interest}`,
    );
  }

  return [...keys];
}

function buildPriorityInput(
  candidate: CandidatePolicyInput,
) {
  return {
    totalScore:
      candidate.analysis.totalScore,

    createdTime:
      candidate.createdTime,

    previousWinner:
      candidate.previousWinner,

    wasPreviouslyUsed:
      candidate.wasPreviouslyUsed,

    isDuplicate:
      candidate.isDuplicate,

    isOldContent:
      candidate.isOldContent,

    productConfidence:
      candidate.productConfidence,

    recommendation:
      candidate.analysis.recommendation,

    useExistingPost:
      candidate.analysis.useExistingPost,

    darkPostEligible:
      candidate.analysis
        .darkPostEligible,
  };
}

function validateCandidatePolicy(input: {
  candidate: CandidatePolicyInput;

  creativeAssetStatus: string;
  creativeApprovalStatus: string;
  creativeScore: number;
  rankingScore: number;
  rankLabel: string;
  hasRevision: boolean;

  minimumScore: number;
  allowExistingPost: boolean;
  allowDarkPost: boolean;
  useOldWinningContent: boolean;
}): string | null {
  const {
    candidate,
    creativeAssetStatus,
    creativeApprovalStatus,
    creativeScore,
    rankingScore,
    rankLabel,
    hasRevision,
    minimumScore,
    allowExistingPost,
    allowDarkPost,
    useOldWinningContent,
  } = input;

  if (candidate.isDuplicate) {
    return "เป็นคอนเทนต์ซ้ำ";
  }

  if (!hasRevision) {
    return "CreativeAsset ยังไม่มี CreativeRevision";
  }

  if (
    creativeAssetStatus !== "READY" &&
    creativeAssetStatus !==
      "NEED_OPTIMIZATION"
  ) {
    return `CreativeAsset status=${creativeAssetStatus} ยังไม่พร้อมคัดเลือก`;
  }

  if (
    creativeApprovalStatus ===
      "REJECTED" ||
    creativeApprovalStatus ===
      "ARCHIVED"
  ) {
    return `CreativeAsset approvalStatus=${creativeApprovalStatus} ไม่อนุญาตให้ใช้`;
  }

  const calibratedScore = calibrateAiScore(
    candidate.analysis.totalScore,
    candidate.analysis.recommendation,
  ).score;

  if (calibratedScore < minimumScore) {
    return `คะแนนปรับเทียบ ${calibratedScore} (AI ดิบ ${candidate.analysis.totalScore}) ต่ำกว่าเกณฑ์ ${minimumScore}`;
  }

  if (
    creativeScore > 0 &&
    creativeScore < minimumScore
  ) {
    return `Creative Score ${creativeScore} ต่ำกว่าเกณฑ์ ${minimumScore}`;
  }

  if (
    rankingScore > 0 &&
    rankingScore < 70
  ) {
    return `Ranking Score ${rankingScore} ต่ำกว่าเกณฑ์ทดสอบ 70`;
  }

  if (
    rankLabel === "LOW_PRIORITY"
  ) {
    return "Creative ถูกจัดเป็น LOW_PRIORITY";
  }

  if (
    candidate.analysis.recommendation ===
      "REJECT" ||
    candidate.analysis.recommendation ===
      "DO_NOT_USE"
  ) {
    return "AI แนะนำว่าไม่ควรใช้ Creative นี้";
  }

  if (
    candidate.analysis.recommendation ===
      "USE_EXISTING_POST" &&
    !candidate.analysis.useExistingPost
  ) {
    return "ผลวิเคราะห์ไม่อนุญาตให้ใช้ Existing Post";
  }

  if (
    candidate.analysis.recommendation ===
      "USE_EXISTING_POST" &&
    !allowExistingPost
  ) {
    return "Product Policy ไม่อนุญาต Existing Post";
  }

  if (
    candidate.analysis.recommendation ===
      "CREATE_DARK_POST" &&
    !candidate.analysis.darkPostEligible
  ) {
    return "ผลวิเคราะห์ไม่อนุญาต Dark Post";
  }

  if (
    candidate.analysis.recommendation ===
      "CREATE_DARK_POST" &&
    !allowDarkPost
  ) {
    return "Product Policy ไม่อนุญาต Dark Post";
  }

  if (
    candidate.isOldContent &&
    !candidate.previousWinner &&
    !useOldWinningContent
  ) {
    return "เป็นคอนเทนต์เก่าและ Policy ไม่อนุญาตให้นำกลับมาใช้";
  }

  const eligible =
    isEligibleCampaignCandidate({
      ...buildPriorityInput(candidate),
      minimumScore,
    });

  if (!eligible) {
    return "ไม่ผ่าน Candidate Eligibility Policy";
  }

  return null;
}

function compareCandidates(
  first: SelectedCampaignCandidate,
  second: SelectedCampaignCandidate,
): number {
  const priorityDifference =
    second.priority.finalPriorityScore -
    first.priority.finalPriorityScore;

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const rankingDifference =
    second.rankingScore -
    first.rankingScore;

  if (rankingDifference !== 0) {
    return rankingDifference;
  }

  const creativeDifference =
    second.creativeScore -
    first.creativeScore;

  if (creativeDifference !== 0) {
    return creativeDifference;
  }

  const totalDifference =
    calibrateAiScore(
      second.analysis.totalScore,
      second.analysis.recommendation,
    ).score -
    calibrateAiScore(
      first.analysis.totalScore,
      first.analysis.recommendation,
    ).score;

  if (totalDifference !== 0) {
    return totalDifference;
  }

  const winnerDifference =
    Number(second.previousWinner) -
    Number(first.previousWinner);

  if (winnerDifference !== 0) {
    return winnerDifference;
  }

  const firstCreatedTime =
    first.createdTime?.getTime() ?? 0;

  const secondCreatedTime =
    second.createdTime?.getTime() ?? 0;

  return (
    secondCreatedTime -
    firstCreatedTime
  );
}

function countAudienceOverlap(
  candidate: SelectedCampaignCandidate,
  selected:
    SelectedCampaignCandidate[],
): number {
  if (
    candidate.audienceKeys.length === 0
  ) {
    return 0;
  }

  const usedKeys =
    new Set(
      selected.flatMap(
        (item) =>
          item.audienceKeys,
      ),
    );

  return candidate.audienceKeys.filter(
    (key) =>
      usedKeys.has(key),
  ).length;
}

function selectDiversifiedCandidates(
  rankedCandidates:
    SelectedCampaignCandidate[],
  maximumAds: number,
): SelectedCampaignCandidate[] {
  const selected:
    SelectedCampaignCandidate[] = [];

  const remaining =
    [...rankedCandidates];

  const usedCreativeFamilies =
    new Set<string>();

  const usedAssets =
    new Set<string>();

  while (
    selected.length < maximumAds &&
    remaining.length > 0
  ) {
    const candidatesWithNewCreative =
      remaining.filter(
        (candidate) =>
          !usedCreativeFamilies.has(
            candidate.creativeFamilyKey,
          ) &&
          !usedAssets.has(
            candidate.creativeAssetId,
          ),
      );

    const candidatePool =
      candidatesWithNewCreative.length > 0
        ? candidatesWithNewCreative
        : remaining;

    candidatePool.sort(
      (first, second) => {
        const firstOverlap =
          countAudienceOverlap(
            first,
            selected,
          );

        const secondOverlap =
          countAudienceOverlap(
            second,
            selected,
          );

        if (
          firstOverlap !== secondOverlap
        ) {
          return (
            firstOverlap -
            secondOverlap
          );
        }

        return compareCandidates(
          first,
          second,
        );
      },
    );

    const chosen =
      candidatePool[0];

    if (!chosen) {
      break;
    }

    selected.push(chosen);

    usedCreativeFamilies.add(
      chosen.creativeFamilyKey,
    );

    usedAssets.add(
      chosen.creativeAssetId,
    );

    const chosenIndex =
      remaining.findIndex(
        (candidate) =>
          candidate.creativeAssetId ===
            chosen.creativeAssetId &&
          candidate.creativeRevisionId ===
            chosen.creativeRevisionId,
      );

    if (chosenIndex >= 0) {
      remaining.splice(
        chosenIndex,
        1,
      );
    }
  }

  return selected;
}

function buildSelectionReason(
  candidate: {
    analysis: CandidateAnalysis;
    priority: CampaignPriorityBreakdown;
    previousWinner: boolean;
    wasPreviouslyUsed: boolean;
    isOldContent: boolean;
    creativeScore: number;
    rankingScore: number;
    rankLabel: string;
    creativeAssetStatus: string;
  },
): string {
  const reasons: string[] = [
    `AI Score ${candidate.analysis.totalScore}`,
    `Creative Score ${candidate.creativeScore}`,
    `Ranking Score ${candidate.rankingScore}`,
    `Rank ${candidate.rankLabel}`,
    `Asset ${candidate.creativeAssetStatus}`,
    `Priority Score ${candidate.priority.finalPriorityScore}`,
  ];

  if (
    candidate.priority.freshnessBonus >
    0
  ) {
    reasons.push(
      `Freshness +${candidate.priority.freshnessBonus}`,
    );
  }

  if (candidate.previousWinner) {
    reasons.push(
      `Previous Winner +${candidate.priority.previousWinnerBonus}`,
    );
  }

  if (
    candidate.priority
      .productConfidenceBonus > 0
  ) {
    reasons.push(
      `Product Confidence +${candidate.priority.productConfidenceBonus}`,
    );
  }

  if (
    candidate.priority
      .recommendationBonus > 0
  ) {
    reasons.push(
      `Recommendation +${candidate.priority.recommendationBonus}`,
    );
  }

  if (candidate.wasPreviouslyUsed) {
    reasons.push(
      `Previously Used -${candidate.priority.previouslyUsedPenalty}`,
    );
  }

  if (candidate.isOldContent) {
    reasons.push(
      "Old Content",
    );
  }

  return reasons.join(" | ");
}

/**
 * Candidate Selector v3
 *
 * Source of truth:
 * CreativeAsset
 * -> CreativeRevision
 * -> ContentAnalysis
 * -> PageContent
 *
 * Campaign Builder compatibility:
 * candidate.id remains PageContent.id because
 * CampaignDraftAd.contentId points to PageContent.
 */
export async function selectCampaignCandidates(
  options: CandidateSelectorOptions,
): Promise<CandidateSelectorResult> {
  const candidateLimit =
    normalizeLimit(
      options.candidateLimit,
    );

  const maximumAds =
    Math.max(
      options.maximumAds,
      options.minimumAds,
      1,
    );

  const rawAssets =
    await prisma.creativeAsset.findMany({
      where: {
        pageId:
          options.pageId,

        productCategory:
          options.productCategory,

        isActive:
          true,

        status: {
          in: [
            "READY",
            "NEED_OPTIMIZATION",
          ],
        },

        sourceContentId: {
          not:
            null,
        },

        sourceAnalysisId: {
          not:
            null,
        },

        sourceContent: {
          is: {
            createdTime: { gte: getContentAnalysisCutoff() },
            isDuplicate: false,
          },
        },
      },

      orderBy: [
        {
          updatedAt:
            "desc",
        },
      ],

      take:
        candidateLimit,

      select: {
        id: true,
        pageId: true,
        productCategory: true,
        status: true,
        approvalStatus: true,
        mediaType: true,
        metadataJson: true,
        currentVersion: true,

        sourceContent: {
          select: {
            id: true,
            pageId: true,
            pageName: true,

            message: true,
            postId: true,
            objectStoryId: true,

            permalinkUrl: true,
            mediaType: true,
            mediaUrl: true,
            thumbnailUrl: true,
            createdTime: true,

            fingerprint: true,
            contentFingerprint: true,
            messageHash: true,
            imageHash: true,
            videoHash: true,

            productCategory: true,
            productConfidence: true,

            previousWinner: true,
            wasPreviouslyUsed: true,
            isDuplicate: true,
            isOldContent: true,
          },
        },

        sourceAnalysis: {
          select: {
            id: true,
            totalScore: true,
            recommendation: true,
            useExistingPost: true,
            darkPostEligible: true,
            suggestedObjective: true,
            summary: true,
            confidence: true,
            audienceFitScore: true,

            audiencePlan: {
              select: {
                strategy: true,
                confidence: true,
                gender: true,
                ageMin: true,
                ageMax: true,
                businessTypesJson: true,
                interestsJson: true,
              },
            },
          },
        },

        revisions: {
          // ใช้ Revision ล่าสุดโดยตรง
          // ไม่กรอง isSelected เพราะข้อมูลเดิมมีค่า false ทุกแถว
          orderBy: [
            {
              version:
                "desc",
            },
          ],

          take:
            1,

          select: {
            id: true,
            version: true,
            status: true,
            approvalStatus: true,
            revisionType: true,
            mediaUrl: true,
            thumbnailUrl: true,
            primaryText: true,
            headline: true,
          },
        },
      },
    });

  const eligibleCandidates:
    SelectedCampaignCandidate[] = [];

  const rejectedCandidates:
    CandidateRejection[] = [];

  const seenRevisionIds =
    new Set<string>();

  for (const asset of rawAssets) {
    const content =
      asset.sourceContent;

    const analysis =
      asset.sourceAnalysis;

    const revision =
      asset.revisions[0] ??
      null;

    if (!content) {
      rejectedCandidates.push({
        contentId:
          asset.id,
        creativeAssetId:
          asset.id,
        reason:
          "CreativeAsset ไม่มี Source PageContent",
      });

      continue;
    }

    if (!analysis) {
      rejectedCandidates.push({
        contentId:
          content.id,
        creativeAssetId:
          asset.id,
        reason:
          "CreativeAsset ไม่มี Source ContentAnalysis",
      });

      continue;
    }

    if (
      content.pageId !==
        options.pageId
    ) {
      rejectedCandidates.push({
        contentId:
          content.id,
        creativeAssetId:
          asset.id,
        reason:
          "Source PageContent อยู่คนละเพจ",
      });

      continue;
    }

    if (
      asset.productCategory !==
        options.productCategory
    ) {
      rejectedCandidates.push({
        contentId:
          content.id,
        creativeAssetId:
          asset.id,
        reason:
          `CreativeAsset category=${asset.productCategory} ไม่ตรงกับ ${options.productCategory}`,
      });

      continue;
    }

    const engineMetadata =
      readCreativeEngineMetadata(
        asset.metadataJson,
      );

    const creativeScore =
      engineMetadata.creativeScore ??
      analysis.totalScore;

    const rankingScore =
      engineMetadata.rankingScore ??
      analysis.totalScore;

    const rankLabel =
      engineMetadata.rankLabel ??
      (
        rankingScore >= 90
          ? "HERO"
          : rankingScore >= 85
            ? "TOP_TIER"
            : rankingScore >= 80
              ? "READY"
              : rankingScore >= 70
                ? "TEST"
                : "LOW_PRIORITY"
      );

    const candidateAnalysis:
      CandidateAnalysis = {
      id:
        analysis.id,

      totalScore:
        analysis.totalScore,

      recommendation:
        analysis.recommendation,

      useExistingPost:
        analysis.useExistingPost,

      darkPostEligible:
        analysis.darkPostEligible,

      suggestedObjective:
        analysis.suggestedObjective,

      summary:
        analysis.summary,

      confidence:
        analysis.confidence,

      audienceFitScore:
        analysis.audienceFitScore,

      audiencePlan:
        analysis.audiencePlan,
    };

    const candidateWithAnalysis:
      CandidatePolicyInput = {
      id:
        content.id,

      createdTime:
        content.createdTime,

      previousWinner:
        content.previousWinner,

      wasPreviouslyUsed:
        content.wasPreviouslyUsed,

      isDuplicate:
        content.isDuplicate,

      isOldContent:
        content.isOldContent,

      productConfidence:
        content.productConfidence,

      analysis:
        candidateAnalysis,
    };

    const rejectionReason =
      validateCandidatePolicy({
        candidate:
          candidateWithAnalysis,

        creativeAssetStatus:
          asset.status,

        creativeApprovalStatus:
          asset.approvalStatus,

        creativeScore,

        rankingScore,

        rankLabel,

        hasRevision:
          Boolean(revision),

        minimumScore:
          options.minimumScore,

        allowExistingPost:
          options.allowExistingPost,

        allowDarkPost:
          options.allowDarkPost,

        useOldWinningContent:
          options.useOldWinningContent,
      });

    if (rejectionReason) {
      rejectedCandidates.push({
        contentId:
          content.id,
        creativeAssetId:
          asset.id,
        reason:
          rejectionReason,
      });

      continue;
    }

    if (
      revision &&
      seenRevisionIds.has(
        revision.id,
      )
    ) {
      rejectedCandidates.push({
        contentId:
          content.id,
        creativeAssetId:
          asset.id,
        reason:
          "CreativeRevision ซ้ำกับ Candidate ที่ผ่านเข้ารอบแล้ว",
      });

      continue;
    }

    if (revision) {
      seenRevisionIds.add(
        revision.id,
      );
    }

    const priority =
      calculateCampaignPriority(
        buildPriorityInput(
          candidateWithAnalysis,
        ),
      );

    const creativeFamilyKey =
      buildCreativeFamilyKey({
        creativeAssetId:
          asset.id,

        creativeRevisionId:
          revision?.id ??
          null,

        mediaType:
          asset.mediaType ||
          content.mediaType,

        imageHash:
          content.imageHash,

        videoHash:
          content.videoHash,

        contentFingerprint:
          content.contentFingerprint,

        fingerprint:
          content.fingerprint,
      });

    const audienceKeys =
      buildAudienceKeys(
        candidateAnalysis,
      );

    const selectedCandidate:
      SelectedCampaignCandidate = {
      id:
        content.id,

      pageId:
        content.pageId,

      pageName:
        content.pageName,

      message:
        revision?.primaryText ||
        content.message,

      postId:
        content.postId,

      objectStoryId:
        content.objectStoryId,

      permalinkUrl:
        content.permalinkUrl,

      mediaType:
        asset.mediaType ||
        content.mediaType,

      mediaUrl:
        revision?.mediaUrl ||
        content.mediaUrl,

      thumbnailUrl:
        revision?.thumbnailUrl ||
        content.thumbnailUrl,

      createdTime:
        content.createdTime,

      fingerprint:
        content.fingerprint,

      contentFingerprint:
        content.contentFingerprint,

      messageHash:
        content.messageHash,

      imageHash:
        content.imageHash,

      videoHash:
        content.videoHash,

      productCategory:
        asset.productCategory,

      productConfidence:
        content.productConfidence,

      previousWinner:
        content.previousWinner,

      wasPreviouslyUsed:
        content.wasPreviouslyUsed,

      isDuplicate:
        content.isDuplicate,

      isOldContent:
        content.isOldContent,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision?.id ??
        null,

      creativeAssetStatus:
        asset.status,

      creativeApprovalStatus:
        asset.approvalStatus,

      creativeScore,

      rankingScore,

      rankLabel,

      heroCreative:
        engineMetadata.heroCreative ??
        rankLabel === "HERO",

      evergreenCandidate:
        engineMetadata.evergreenCandidate ??
        false,

      seasonalCandidate:
        engineMetadata.seasonalCandidate ??
        false,

      analysis:
        candidateAnalysis,

      priority,

      audienceKeys,

      creativeFamilyKey,

      selectionReason:
        buildSelectionReason({
          analysis:
            candidateAnalysis,

          priority,

          previousWinner:
            content.previousWinner,

          wasPreviouslyUsed:
            content.wasPreviouslyUsed,

          isOldContent:
            content.isOldContent,

          creativeScore,

          rankingScore,

          rankLabel,

          creativeAssetStatus:
            asset.status,
        }),

      selectionMode:
        isFreshContent(content.createdTime)
          ? "FRESH"
          : "WINNING_FALLBACK",
    };

    eligibleCandidates.push(
      selectedCandidate,
    );
  }

  eligibleCandidates.sort(
    compareCandidates,
  );

  const candidatePool = chooseFreshOrWinningFallback(
    eligibleCandidates,
    options.useOldWinningContent,
  );

  const selectedCandidates =
    selectDiversifiedCandidates(
      candidatePool.candidates,
      maximumAds,
    );

  return {
    selectorVersion:
      CANDIDATE_SELECTOR_VERSION,

    pageId:
      options.pageId,

    productCategory:
      options.productCategory,

    rawCandidateCount:
      rawAssets.length,

    eligibleCandidateCount:
      candidatePool.candidates.length,

    selectedCandidateCount:
      selectedCandidates.length,

    minimumAds:
      options.minimumAds,

    maximumAds,

    hasEnoughCandidates:
      selectedCandidates.length >=
      options.minimumAds,

    selectedCandidates,

    rejectedCandidates,
  };
}
