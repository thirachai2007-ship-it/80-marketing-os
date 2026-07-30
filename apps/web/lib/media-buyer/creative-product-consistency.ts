export const MINIMUM_VISUAL_PRODUCT_CONFIDENCE = 75;

export type VisualProductEvidence = { category: string; confidence: number };

export function parseVisualProductEvidence(value: string | null | undefined): VisualProductEvidence | null {
  const match = value?.match(/(?:^|\s\|\s)AI=([A-Z][A-Z0-9_]*)\s*:\s*(\d{1,3})(?=\s|\||$)/i);
  if (!match) return null;
  const confidence = Number(match[2]);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return null;
  return { category: match[1].toUpperCase(), confidence };
}

export function isVisualProductConsistent(input: { productCategory: string; productEvidence: string | null | undefined }) {
  const visual = parseVisualProductEvidence(input.productEvidence);
  return visual !== null && visual.category === input.productCategory.toUpperCase() &&
    visual.confidence >= MINIMUM_VISUAL_PRODUCT_CONFIDENCE;
}

export function isValidatedCreativeMetadata(metadata: Record<string, unknown>, productCategory: string) {
  return metadata.visualProductValidated === true &&
    metadata.visualProductCategory === productCategory.toUpperCase() &&
    typeof metadata.visualProductConfidence === "number" &&
    metadata.visualProductConfidence >= MINIMUM_VISUAL_PRODUCT_CONFIDENCE;
}
