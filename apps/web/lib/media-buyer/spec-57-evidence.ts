import prisma from "@/lib/prisma";

export const SPEC_57_EVIDENCE_VERSION = "spec-57-evidence-v1";

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

export async function getSpec57Evidence() {
  const assets = await prisma.creativeAsset.findMany({
    where: {
      isActive: true,
      originalMediaUrl: { not: null },
      revisions: { some: { metadataJson: { contains: "\"revisionGenerator\"" } } },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      originalMediaUrl: true,
      originalThumbnailUrl: true,
      originalMessage: true,
      productCategory: true,
      targetAudienceJson: true,
      revisions: {
        where: { metadataJson: { contains: "\"revisionGenerator\"" } },
        orderBy: { version: "asc" },
        select: {
          id: true,
          version: true,
          status: true,
          editInstructions: true,
          changeSummary: true,
          aiReason: true,
          targetAudienceJson: true,
          metadataJson: true,
          mediaUrl: true,
          outputFingerprint: true,
        },
      },
    },
  });

  const provenAssets = assets.map((asset) => {
    const revisions = asset.revisions.map((revision) => {
      const metadata = parseObject(revision.metadataJson);
      const lineage = parseObject(JSON.stringify(metadata.revisionGenerator ?? {}));
      return {
        ...revision,
        hasLineage: typeof lineage.baseRevisionId === "string" &&
          typeof lineage.baseRevisionVersion === "number" &&
          typeof lineage.versionName === "string",
        hasAuditReason: Boolean(revision.changeSummary?.trim()) && Boolean(revision.aiReason?.trim()),
        hasEditInstructions: Boolean(revision.editInstructions?.trim()),
        hasAudience: revision.targetAudienceJson !== "{}" || asset.targetAudienceJson !== "{}",
        renderedFile: revision.status === "RENDERED" && Boolean(revision.mediaUrl) && Boolean(revision.outputFingerprint),
      };
    });
    return {
      creativeAssetId: asset.id,
      productCategory: asset.productCategory,
      originalPreserved: Boolean(asset.originalMediaUrl),
      originalMessagePreserved: asset.originalMessage !== null,
      revisionCount: revisions.length,
      distinctVersions: new Set(revisions.map((revision) => revision.version)).size,
      revisionsWithLineage: revisions.filter((revision) => revision.hasLineage).length,
      revisionsWithAuditReason: revisions.filter((revision) => revision.hasAuditReason).length,
      revisionsWithEditInstructions: revisions.filter((revision) => revision.hasEditInstructions).length,
      revisionsWithAudience: revisions.filter((revision) => revision.hasAudience).length,
      renderedRevisionFiles: revisions.filter((revision) => revision.renderedFile).length,
      outputs: revisions.map((revision) => ({
        id: revision.id,
        version: revision.version,
        status: revision.status,
        mediaUrl: revision.mediaUrl,
        outputFingerprint: revision.outputFingerprint,
      })),
    };
  });

  const complete = provenAssets.filter((asset) => asset.originalPreserved &&
    asset.originalMessagePreserved && asset.revisionCount >= 3 &&
    asset.distinctVersions === asset.revisionCount &&
    asset.revisionsWithLineage === asset.revisionCount &&
    asset.revisionsWithAuditReason === asset.revisionCount &&
    asset.revisionsWithEditInstructions === asset.revisionCount &&
    asset.revisionsWithAudience === asset.revisionCount &&
    asset.renderedRevisionFiles >= 1);
  const gaps: Array<{ reason: string }> = [];
  if (assets.length === 0) gaps.push({ reason: "NO_EDITED_CREATIVE_VERSION_HISTORY" });
  if (complete.length === 0) gaps.push({ reason: "NO_FULLY_AUDITABLE_RENDERED_EDIT_SET" });
  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_57_EVIDENCE_VERSION,
    requirement: "AI edits existing creative, creates audience variants, and preserves originals, version history and reasons",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: { candidateAssets: assets.length, provenAssets: complete.length, assets: provenAssets },
    gapCount: gaps.length,
    gaps,
    safety: { ownerApprovalRequiredBeforePaidRender: true, campaignPublished: false, metaMutationExecuted: false, realAdSpendUsed: false, budgetChanged: false },
  };
}
