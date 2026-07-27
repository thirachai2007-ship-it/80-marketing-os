export const CAMPAIGN_PRIORITY_VERSION =
  "campaign-priority-v2";

export type CampaignPriorityInput = {
  totalScore: number;
  createdTime?: Date | null;

  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  isDuplicate: boolean;
  isOldContent: boolean;

  productConfidence?: number | null;

  recommendation: string;
  useExistingPost: boolean;
  darkPostEligible: boolean;
};

export type CampaignPriorityBreakdown = {
  baseScore: number;
  freshnessBonus: number;
  previousWinnerBonus: number;
  productConfidenceBonus: number;
  recommendationBonus: number;

  duplicatePenalty: number;
  previouslyUsedPenalty: number;
  oldContentPenalty: number;

  finalPriorityScore: number;
};

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum,
  );
}

function calculateAgeInDays(
  createdTime?: Date | null,
): number | null {
  if (!createdTime) {
    return null;
  }

  const milliseconds =
    Date.now() - createdTime.getTime();

  if (milliseconds < 0) {
    return 0;
  }

  return Math.floor(
    milliseconds /
      (1000 * 60 * 60 * 24),
  );
}

function calculateFreshnessBonus(
  createdTime?: Date | null,
): number {
  const ageInDays =
    calculateAgeInDays(createdTime);

  if (ageInDays === null) {
    return 0;
  }

  if (ageInDays <= 7) {
    return 10;
  }

  if (ageInDays <= 30) {
    return 7;
  }

  if (ageInDays <= 90) {
    return 4;
  }

  if (ageInDays <= 180) {
    return 2;
  }

  return 0;
}

function calculateProductConfidenceBonus(
  productConfidence?: number | null,
): number {
  if (
    productConfidence === null ||
    productConfidence === undefined
  ) {
    return 0;
  }

  if (productConfidence >= 90) {
    return 5;
  }

  if (productConfidence >= 80) {
    return 3;
  }

  if (productConfidence >= 70) {
    return 1;
  }

  return 0;
}

function calculateRecommendationBonus(
  input: CampaignPriorityInput,
): number {
  if (
    input.recommendation ===
      "USE_EXISTING_POST" &&
    input.useExistingPost
  ) {
    return 5;
  }

  if (
    input.recommendation ===
      "CREATE_DARK_POST" &&
    input.darkPostEligible
  ) {
    return 4;
  }

  return 0;
}

/**
 * คำนวณ Priority Score สำหรับ AI Campaign Planner v2
 *
 * คะแนนนี้ใช้จัดอันดับคอนเทนต์เท่านั้น
 * ไม่แทนที่ Total Score จาก AI Analysis
 */
export function calculateCampaignPriority(
  input: CampaignPriorityInput,
): CampaignPriorityBreakdown {
  const baseScore = clamp(
    Math.round(input.totalScore),
    0,
    100,
  );

  const freshnessBonus =
    calculateFreshnessBonus(
      input.createdTime,
    );

  const previousWinnerBonus =
    input.previousWinner ? 10 : 0;

  const productConfidenceBonus =
    calculateProductConfidenceBonus(
      input.productConfidence,
    );

  const recommendationBonus =
    calculateRecommendationBonus(input);

  const duplicatePenalty =
    input.isDuplicate ? 100 : 0;

  const previouslyUsedPenalty =
    input.wasPreviouslyUsed ? 15 : 0;

  const oldContentPenalty =
    input.isOldContent &&
    !input.previousWinner
      ? 5
      : 0;

  const rawPriorityScore =
    baseScore +
    freshnessBonus +
    previousWinnerBonus +
    productConfidenceBonus +
    recommendationBonus -
    duplicatePenalty -
    previouslyUsedPenalty -
    oldContentPenalty;

  const finalPriorityScore = clamp(
    rawPriorityScore,
    0,
    130,
  );

  return {
    baseScore,
    freshnessBonus,
    previousWinnerBonus,
    productConfidenceBonus,
    recommendationBonus,

    duplicatePenalty,
    previouslyUsedPenalty,
    oldContentPenalty,

    finalPriorityScore,
  };
}

/**
 * ตรวจว่าคอนเทนต์มีสิทธิ์เป็น Candidate หรือไม่
 */
export function isEligibleCampaignCandidate(
  input: CampaignPriorityInput & {
    minimumScore: number;
  },
): boolean {
  if (input.isDuplicate) {
    return false;
  }

  if (
    input.totalScore <
    input.minimumScore
  ) {
    return false;
  }

  if (
    input.recommendation ===
    "DO_NOT_USE"
  ) {
    return false;
  }

  if (
    input.recommendation ===
      "USE_EXISTING_POST" &&
    !input.useExistingPost
  ) {
    return false;
  }

  if (
    input.recommendation ===
      "CREATE_DARK_POST" &&
    !input.darkPostEligible
  ) {
    return false;
  }

  return true;
}