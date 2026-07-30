export type CalibratedScore = {
  score: number;
  rawAiScore: number;
  grade: "EXCEPTIONAL" | "STRONG_TEST" | "AVERAGE" | "WEAK";
  evidence: "AI_ONLY";
};

const SCORE_ANCHORS = [
  [0, 0],
  [50, 30],
  [60, 40],
  [70, 50],
  [80, 62],
  [82, 66],
  [85, 73],
  [87, 79],
  [88, 83],
  [90, 90],
  [100, 100],
] as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calibrateAiScore(
  rawScore: number,
  recommendation?: string,
): CalibratedScore {
  const rawAiScore = clampScore(rawScore);
  let score = rawAiScore;

  for (let index = 1; index < SCORE_ANCHORS.length; index += 1) {
    const [rightRaw, rightCalibrated] = SCORE_ANCHORS[index];
    const [leftRaw, leftCalibrated] = SCORE_ANCHORS[index - 1];

    if (rawAiScore <= rightRaw) {
      const range = rightRaw - leftRaw;
      const progress = range === 0 ? 0 : (rawAiScore - leftRaw) / range;
      score = Math.round(
        leftCalibrated + progress * (rightCalibrated - leftCalibrated),
      );
      break;
    }
  }

  if (recommendation === "REJECT" || recommendation === "DO_NOT_USE") {
    score = Math.min(score, 39);
  }

  const grade =
    score >= 90
      ? "EXCEPTIONAL"
      : score >= 75
        ? "STRONG_TEST"
        : score >= 50
          ? "AVERAGE"
          : "WEAK";

  return {
    score,
    rawAiScore,
    grade,
    evidence: "AI_ONLY",
  };
}

export function rawScoreForCalibratedMinimum(minimum: number) {
  const target = clampScore(minimum);

  for (let raw = 0; raw <= 100; raw += 1) {
    if (calibrateAiScore(raw).score >= target) return raw;
  }

  return 100;
}
