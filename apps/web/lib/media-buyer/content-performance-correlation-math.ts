export type CorrelationPoint = {
  id: string;
  score: number;
  outcome: number;
};

export type CorrelationStrength =
  | "NEGLIGIBLE"
  | "WEAK"
  | "MODERATE"
  | "STRONG";

export type CorrelationDirection =
  | "POSITIVE"
  | "NEGATIVE"
  | "NONE";

export type CorrelationEvidenceStatus =
  | "INSUFFICIENT_SAMPLE"
  | "NO_VARIATION"
  | "EXPLORATORY_ONLY"
  | "NO_CLEAR_ASSOCIATION"
  | "DIRECTIONAL_ASSOCIATION";

export type CorrelationResult = {
  sampleSize: number;
  coefficient: number | null;
  pearsonSensitivity: number | null;
  approximateConfidenceInterval: {
    low: number;
    high: number;
  } | null;
  direction: CorrelationDirection;
  strength: CorrelationStrength;
  status: CorrelationEvidenceStatus;
};

type RankedValue = {
  id: string;
  value: number;
};

function round(
  value: number,
  digits = 3,
) {
  const multiplier = 10 ** digits;
  return (
    Math.round(
      (value + Number.EPSILON) *
        multiplier,
    ) / multiplier
  );
}

function isFiniteNumber(
  value: number,
) {
  return Number.isFinite(value);
}

export function averageRanks(
  values: RankedValue[],
) {
  const sorted = [...values].sort(
    (left, right) =>
      left.value - right.value ||
      left.id.localeCompare(right.id),
  );
  const ranks = new Map<
    string,
    number
  >();

  let start = 0;

  while (start < sorted.length) {
    let end = start + 1;

    while (
      end < sorted.length &&
      sorted[end].value ===
        sorted[start].value
    ) {
      end += 1;
    }

    const averageRank =
      (start + 1 + end) / 2;

    for (
      let index = start;
      index < end;
      index += 1
    ) {
      ranks.set(
        sorted[index].id,
        averageRank,
      );
    }

    start = end;
  }

  return ranks;
}

export function pearsonCorrelation(
  values: Array<{
    x: number;
    y: number;
  }>,
) {
  if (values.length < 2) {
    return null;
  }

  const meanX =
    values.reduce(
      (sum, item) => sum + item.x,
      0,
    ) / values.length;
  const meanY =
    values.reduce(
      (sum, item) => sum + item.y,
      0,
    ) / values.length;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const item of values) {
    const deltaX = item.x - meanX;
    const deltaY = item.y - meanY;

    covariance += deltaX * deltaY;
    varianceX += deltaX ** 2;
    varianceY += deltaY ** 2;
  }

  if (
    varianceX === 0 ||
    varianceY === 0
  ) {
    return null;
  }

  return round(
    covariance /
      Math.sqrt(
        varianceX * varianceY,
      ),
  );
}

export function spearmanCorrelation(
  points: CorrelationPoint[],
) {
  const clean = points
    .filter(
      (point) =>
        isFiniteNumber(point.score) &&
        isFiniteNumber(point.outcome),
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );

  if (clean.length < 2) {
    return null;
  }

  const scoreRanks = averageRanks(
    clean.map((point) => ({
      id: point.id,
      value: point.score,
    })),
  );
  const outcomeRanks = averageRanks(
    clean.map((point) => ({
      id: point.id,
      value: point.outcome,
    })),
  );

  return pearsonCorrelation(
    clean.map((point) => ({
      x: scoreRanks.get(point.id) || 0,
      y:
        outcomeRanks.get(point.id) || 0,
    })),
  );
}

export function approximateFisherInterval(
  coefficient: number,
  sampleSize: number,
) {
  if (
    sampleSize < 4 ||
    !isFiniteNumber(coefficient)
  ) {
    return null;
  }

  const clamped = Math.max(
    -0.999999,
    Math.min(0.999999, coefficient),
  );
  const fisherZ =
    0.5 *
    Math.log(
      (1 + clamped) /
        (1 - clamped),
    );
  const margin =
    1.96 /
    Math.sqrt(sampleSize - 3);
  const low = Math.tanh(
    fisherZ - margin,
  );
  const high = Math.tanh(
    fisherZ + margin,
  );

  return {
    low: round(low),
    high: round(high),
  };
}

function strength(
  coefficient: number | null,
): CorrelationStrength {
  const absolute = Math.abs(
    coefficient || 0,
  );

  if (absolute < 0.1) {
    return "NEGLIGIBLE";
  }
  if (absolute < 0.3) {
    return "WEAK";
  }
  if (absolute < 0.5) {
    return "MODERATE";
  }
  return "STRONG";
}

function direction(
  coefficient: number | null,
): CorrelationDirection {
  if (
    coefficient === null ||
    Math.abs(coefficient) < 0.1
  ) {
    return "NONE";
  }

  return coefficient > 0
    ? "POSITIVE"
    : "NEGATIVE";
}

export function evaluateCorrelation(
  points: CorrelationPoint[],
): CorrelationResult {
  const clean = points
    .filter(
      (point) =>
        isFiniteNumber(point.score) &&
        isFiniteNumber(point.outcome),
    )
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  const coefficient =
    spearmanCorrelation(clean);
  const pearsonSensitivity =
    pearsonCorrelation(
      clean.map((point) => ({
        x: point.score,
        y: point.outcome,
      })),
    );
  const interval =
    coefficient === null ||
    clean.length < 30
      ? null
      : approximateFisherInterval(
          coefficient,
          clean.length,
        );

  let status:
    CorrelationEvidenceStatus;

  if (clean.length < 10) {
    status = "INSUFFICIENT_SAMPLE";
  } else if (coefficient === null) {
    status = "NO_VARIATION";
  } else if (clean.length < 30) {
    status = "EXPLORATORY_ONLY";
  } else if (
    Math.abs(coefficient) < 0.2 ||
    !interval ||
    (interval.low <= 0 &&
      interval.high >= 0)
  ) {
    status = "NO_CLEAR_ASSOCIATION";
  } else {
    status =
      "DIRECTIONAL_ASSOCIATION";
  }

  return {
    sampleSize: clean.length,
    coefficient,
    pearsonSensitivity,
    approximateConfidenceInterval:
      interval,
    direction:
      direction(coefficient),
    strength:
      strength(coefficient),
    status,
  };
}

export function safeRate(
  numerator: number,
  denominator: number,
  scale = 1,
) {
  if (
    !isFiniteNumber(numerator) ||
    !isFiniteNumber(denominator) ||
    !isFiniteNumber(scale) ||
    denominator <= 0
  ) {
    return null;
  }

  return round(
    (numerator / denominator) *
      scale,
  );
}
