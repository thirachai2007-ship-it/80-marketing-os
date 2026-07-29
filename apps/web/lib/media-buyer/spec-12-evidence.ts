import prisma from "@/lib/prisma";

export const SPEC_12_EVIDENCE_VERSION = "spec-12-evidence-v1";

function maskId(value: string | null) {
  if (!value) return null;
  return `***${value.slice(-4)}`;
}

export async function getSpec12Evidence() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const pages = await prisma.managedPage.findMany({
    where: {
      isActive: true,
      contents: { some: { createdTime: { gte: cutoff } } },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      adAccountId: true,
      adAccount: { select: { id: true, isActive: true, metaConnectionId: true } },
      adAccountMappings: {
        where: { status: "ACTIVE" },
        select: {
          adAccountId: true,
          isPrimary: true,
          verifiedAt: true,
          metaConnectionId: true,
          adAccount: { select: { isActive: true } },
        },
      },
      campaignDrafts: { select: { id: true, adAccountId: true } },
    },
  });

  const gaps: Array<{ pageId: string; campaignDraftId?: string; reason: string }> = [];
  let checkedCampaignDrafts = 0;
  for (const page of pages) {
    const primaries = page.adAccountMappings.filter((mapping) => mapping.isPrimary);
    if (!page.adAccountId || !page.adAccount?.isActive) gaps.push({ pageId: page.id, reason: "PAGE_PRIMARY_AD_ACCOUNT_MISSING_OR_INACTIVE" });
    if (primaries.length !== 1) gaps.push({ pageId: page.id, reason: "EXACTLY_ONE_ACTIVE_PRIMARY_MAPPING_REQUIRED" });
    const primary = primaries[0];
    if (primary && primary.adAccountId !== page.adAccountId) gaps.push({ pageId: page.id, reason: "PAGE_DEFAULT_DOES_NOT_MATCH_PRIMARY_MAPPING" });
    if (primary && !primary.adAccount.isActive) gaps.push({ pageId: page.id, reason: "PRIMARY_MAPPING_ACCOUNT_INACTIVE" });
    if (primary && primary.metaConnectionId !== page.adAccount?.metaConnectionId) gaps.push({ pageId: page.id, reason: "META_CONNECTION_MISMATCH" });
    if (primary && !primary.verifiedAt) gaps.push({ pageId: page.id, reason: "PRIMARY_MAPPING_NOT_VERIFIED" });
    for (const draft of page.campaignDrafts) {
      checkedCampaignDrafts += 1;
      if (draft.adAccountId !== page.adAccountId || draft.adAccountId !== primary?.adAccountId) {
        gaps.push({ pageId: page.id, campaignDraftId: draft.id, reason: "CAMPAIGN_USES_WRONG_AD_ACCOUNT" });
      }
    }
  }

  const pass = pages.length > 0 && checkedCampaignDrafts > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_12_EVIDENCE_VERSION,
    requirement: "Every active Page uses its verified primary Ad Account mapping and every Campaign follows that mapping",
    windowDays: 45,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    activePagesWithRecentContent: pages.length,
    mappedPages: pages.filter((page) => page.adAccountMappings.filter((mapping) => mapping.isPrimary).length === 1).length,
    checkedCampaignDrafts,
    gapCount: gaps.length + (checkedCampaignDrafts > 0 ? 0 : 1),
    evidenceGaps: checkedCampaignDrafts > 0 ? [] : ["NO_CAMPAIGN_MAPPING_USAGE_EVIDENCE"],
    gaps,
    pages: pages.map((page) => ({
      pageId: page.id,
      pageAdAccount: maskId(page.adAccountId),
      activeMappingCount: page.adAccountMappings.length,
      primaryMappingCount: page.adAccountMappings.filter((mapping) => mapping.isPrimary).length,
      primaryAdAccount: maskId(page.adAccountMappings.find((mapping) => mapping.isPrimary)?.adAccountId ?? null),
      campaignDraftCount: page.campaignDrafts.length,
    })),
    safety: { readOnly: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}
