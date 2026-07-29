export const CONTENT_ANALYSIS_RECENCY_DAYS = 90;

export function getContentAnalysisCutoff(
  now = new Date(),
) {
  return new Date(
    now.getTime() -
      CONTENT_ANALYSIS_RECENCY_DAYS *
        24 *
        60 *
        60 *
        1_000,
  );
}
