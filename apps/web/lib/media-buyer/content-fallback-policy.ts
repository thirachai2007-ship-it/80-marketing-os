import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";

export const FRESH_CONTENT_DAYS = 7;

export function getFreshContentCutoff(now = new Date()) {
  return new Date(now.getTime() - FRESH_CONTENT_DAYS * 86_400_000);
}

export function isFreshContent(createdTime: Date | null, now = new Date()) {
  return Boolean(createdTime && createdTime >= getFreshContentCutoff(now));
}

export function isAllowedWinningFallback(
  candidate: { createdTime: Date | null; previousWinner: boolean },
  now = new Date(),
) {
  return Boolean(
    candidate.previousWinner &&
      candidate.createdTime &&
      candidate.createdTime >= getContentAnalysisCutoff(now) &&
      candidate.createdTime < getFreshContentCutoff(now),
  );
}

export function chooseFreshOrWinningFallback<
  T extends { createdTime: Date | null; previousWinner: boolean },
>(candidates: T[], allowFallback: boolean, now = new Date()) {
  const fresh = candidates.filter((candidate) => isFreshContent(candidate.createdTime, now));
  if (fresh.length > 0) {
    return { mode: "FRESH" as const, candidates: fresh };
  }
  return {
    mode: "WINNING_FALLBACK" as const,
    candidates: allowFallback
      ? candidates.filter((candidate) => isAllowedWinningFallback(candidate, now))
      : [],
  };
}

export function resolveFallbackCreativeMode(
  selectionMode: "FRESH" | "WINNING_FALLBACK",
  normalMode: string,
) {
  return selectionMode === "WINNING_FALLBACK"
    ? "DARK_POST_REQUIRED"
    : normalMode;
}
