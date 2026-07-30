import prisma from "@/lib/prisma";
import { CREATIVE_RENDERING_ENGINE_VERSION } from "@/lib/media-buyer/creative-renderer";

export const SPEC_56_EVIDENCE_VERSION = "spec-56-evidence-v1";

const REQUIRED_CREATIVE_ROLES = [
  "STATIC_IMAGE",
  "PRODUCT_IMAGE",
  "ILLUSTRATION",
  "THUMBNAIL",
  "BANNER",
] as const;

const REQUIRED_PLACEMENT_RATIOS = [
  "1:1",
  "4:5",
  "9:16",
] as const;

function parseObject(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) as unknown : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function getSpec56Evidence() {
  const [revisions, renderDecisions] = await Promise.all([
    prisma.creativeRevision.findMany({
      where: {
        status: "RENDERED",
        providerName: "OPENAI",
        mediaUrl: { not: null },
        outputFingerprint: { not: null },
        metadataJson: { contains: "\"visualProductValidated\":true" },
        creativeAsset: { isActive: true },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        revisionType: true,
        aspectRatio: true,
        mediaUrl: true,
        outputFingerprint: true,
        generationPrompt: true,
        metadataJson: true,
        creativeAsset: {
          select: {
            pageId: true,
            productCategory: true,
            page: { select: { name: true } },
          },
        },
      },
    }),
    prisma.decisionLog.findMany({
      where: {
        decisionType: "CREATIVE_RENDERING",
        action: "RENDER_IMAGE_REVISION",
      },
      orderBy: { createdAt: "desc" },
      select: { policyJson: true },
    }),
  ]);

  const roles = new Set<string>();
  const ratios = new Set<string>();
  let brandProductAnchored = 0;
  for (const revision of revisions) {
    const metadata = parseObject(revision.metadataJson);
    const role = typeof metadata.creativeRole === "string"
      ? metadata.creativeRole
      : revision.revisionType;
    roles.add(role.toUpperCase());
    if (revision.aspectRatio) ratios.add(revision.aspectRatio);
    const prompt = revision.generationPrompt ?? "";
    if (
      prompt.includes(revision.creativeAsset.page.name) &&
      prompt.includes(revision.creativeAsset.productCategory)
    ) {
      brandProductAnchored += 1;
    }
  }

  const governedRenderDecisions = renderDecisions.filter((decision) => {
    const policy = parseObject(decision.policyJson);
    return policy.netProfitFirst === true &&
      policy.primaryObjective === "MAXIMIZE_NET_PROFIT" &&
      policy.productAndBrandIdentityRequired === true;
  }).length;

  const missingRoles = REQUIRED_CREATIVE_ROLES.filter((role) => !roles.has(role));
  const missingPlacementRatios = REQUIRED_PLACEMENT_RATIOS.filter((ratio) => !ratios.has(ratio));
  const gaps: Array<{ reason: string; values?: readonly string[] }> = [];
  if (revisions.length === 0) gaps.push({ reason: "NO_AI_GENERATED_IMAGE_FILE" });
  if (missingRoles.length > 0) gaps.push({ reason: "MISSING_CREATIVE_ROLES", values: missingRoles });
  if (missingPlacementRatios.length > 0) gaps.push({ reason: "MISSING_PLACEMENT_RATIOS", values: missingPlacementRatios });
  if (brandProductAnchored !== revisions.length) gaps.push({ reason: "BRAND_OR_PRODUCT_IDENTITY_NOT_PROVEN" });
  if (governedRenderDecisions !== revisions.length) gaps.push({ reason: "NET_PROFIT_RENDER_GOVERNANCE_NOT_PROVEN" });
  const pass = gaps.length === 0;

  return {
    evidenceVersion: SPEC_56_EVIDENCE_VERSION,
    rendererVersion: CREATIVE_RENDERING_ENGINE_VERSION,
    requirement: "AI creates new still, product, illustration, multi-size, thumbnail, banner and placement creatives using product, brand identity and Net Profit",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      renderedImages: revisions.length,
      roles: [...roles].sort(),
      placementRatios: [...ratios].sort(),
      brandProductAnchored,
      governedRenderDecisions,
      outputs: revisions.map((revision) => ({
        id: revision.id,
        role: (parseObject(revision.metadataJson).creativeRole ?? revision.revisionType),
        aspectRatio: revision.aspectRatio,
        mediaUrl: revision.mediaUrl,
        outputFingerprint: revision.outputFingerprint,
        pageId: revision.creativeAsset.pageId,
        productCategory: revision.creativeAsset.productCategory,
      })),
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      ownerApprovalRequiredBeforePaidRender: true,
      campaignPublished: false,
      metaMutationExecuted: false,
      realAdSpendUsed: false,
    },
  };
}
