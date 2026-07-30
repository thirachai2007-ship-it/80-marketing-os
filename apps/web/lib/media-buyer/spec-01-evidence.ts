import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_01_EVIDENCE_VERSION = "spec-01-evidence-v1";

export async function getSpec01Evidence() {
  const freshnessCutoff = new Date(Date.now() - 30 * 60_000);
  const contentCutoff = getContentAnalysisCutoff();
  const [pages, runs] = await Promise.all([
    prisma.managedPage.findMany({ where: { isActive: true, metaConnection: { status: "ACTIVE" } }, orderBy: { id: "asc" }, select: { id: true, name: true, _count: { select: { contents: { where: { createdTime: { gte: contentCutoff } } } } } } }),
    prisma.metaSyncRun.findMany({ where: { resourceType: "POSTS", trigger: "SCHEDULED", createdAt: { gte: freshnessCutoff } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, itemsFound: true, itemsCreated: true, itemsUpdated: true, createdAt: true, completedAt: true, metadataJson: true } }),
  ]);
  const pageEvidence = pages.map((page) => {
    const run = runs.find((item) => { try { return JSON.parse(item.metadataJson).pageId === page.id; } catch { return false; } });
    return { pageId: page.id, pageName: page.name, postsIn45DayWindow: page._count.contents, latestScheduledRunId: run?.id ?? null, latestScheduledRunStatus: run?.status ?? null, latestScheduledRunAt: run?.completedAt?.toISOString() ?? run?.createdAt.toISOString() ?? null, postsFound: run?.itemsFound ?? 0, postsCreated: run?.itemsCreated ?? 0, postsUpdated: run?.itemsUpdated ?? 0 };
  });
  const gaps: Array<{ pageId?: string; reason: string }> = [];
  if (pages.length === 0) gaps.push({ reason: "NO_ACTIVE_META_PAGES" });
  for (const page of pageEvidence) {
    if (!page.latestScheduledRunId) gaps.push({ pageId: page.pageId, reason: "FRESH_AUTOMATIC_POST_SYNC_MISSING" });
    else if (page.latestScheduledRunStatus !== "COMPLETED") gaps.push({ pageId: page.pageId, reason: "LATEST_AUTOMATIC_POST_SYNC_NOT_COMPLETED" });
    if (page.postsIn45DayWindow <= 0) gaps.push({ pageId: page.pageId, reason: "NO_REAL_POSTS_IN_POLICY_WINDOW" });
  }
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_01_EVIDENCE_VERSION, requirement: "AI automatically pulls Facebook posts from every active Page", contentWindowDays: 45, freshnessMinutes: 30, status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { activePages: pages.length, pagesWithFreshCompletedSync: pageEvidence.filter((page) => page.latestScheduledRunStatus === "COMPLETED").length, totalPostsIn45DayWindow: pageEvidence.reduce((sum, page) => sum + page.postsIn45DayWindow, 0), pageEvidence }, gapCount: gaps.length, gaps, safety: { metaReadOnly: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
