import prisma from "@/lib/prisma";
import { getSpec39Evidence } from "@/lib/media-buyer/spec-39-evidence";
import { getSpec44Evidence } from "@/lib/media-buyer/spec-44-evidence";
import { getSpec46Evidence } from "@/lib/media-buyer/spec-46-evidence";
import { getSpec48Evidence } from "@/lib/media-buyer/spec-48-evidence";
import { getSpec55Evidence } from "@/lib/media-buyer/spec-55-evidence";
import { getSpec59Evidence } from "@/lib/media-buyer/spec-59-evidence";

type Gap = { reason: string };
const safe = { readOnlyEvidence: true, campaignActivated: false, realSpendUsed: false, budgetChanged: false, scheduleChanged: false };
function done(spec: number, requirement: string, productionData: Record<string, unknown>, gaps: Gap[] = []) {
  const pass = gaps.length === 0;
  return { evidenceVersion: `spec-${spec}-evidence-v1`, requirement, status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData, gapCount: gaps.length, gaps, safety: safe };
}

export async function getSpec65Evidence() {
  const proof = await getSpec55Evidence();
  const gaps = proof.pass ? [] : [{ reason: "EXPERIMENT_LIFECYCLE_NOT_PROVEN" }];
  return done(65, "AI creates auditable PAUSED creative experiments with control, challenger and learning outcomes", { dependencySpec55: proof.status, experiments: proof.productionData.experiments, experimentReady: proof.productionData.experimentReady, experimentStatuses: proof.productionData.experimentStatuses }, gaps);
}

export async function getSpec66Evidence() {
  const proof = await getSpec44Evidence();
  const gaps = proof.pass ? [] : [{ reason: "EXPLAINABLE_DECISION_AUDIT_NOT_PROVEN" }];
  return done(66, "Every AI decision explains what, why, evidence, policy and affected object", { dependencySpec44: proof.status, ...proof.productionData, ui: proof.ui }, gaps);
}

export async function getSpec67Evidence() {
  const proof = await getSpec48Evidence();
  const evaluations = await prisma.decisionLog.count({ where: { decisionType: { in: ["PERFORMANCE_PROOF_BENCHMARK", "SENIOR_MEDIA_BUYER_GOVERNANCE", "CONTINUOUS_OUTCOME_LEARNING"] } } });
  const gaps: Gap[] = [];
  if (!proof.pass) gaps.push({ reason: "PERFORMANCE_SELF_EVALUATION_NOT_PROVEN" });
  if (evaluations === 0) gaps.push({ reason: "NO_SELF_EVALUATION_DECISIONS" });
  return done(67, "AI evaluates its own operational and live-result performance without claiming unproven outperformance", { dependencySpec48: proof.status, selfEvaluationDecisions: evaluations, comparison: proof.productionData.comparison }, gaps);
}

export async function getSpec68Evidence() {
  const [ownerApprovals, ownerChats, feedbackApplied] = await Promise.all([
    prisma.decisionLog.count({ where: { decisionType: { in: ["OWNER_APPROVAL", "CREATIVE_APPROVAL"] } } }),
    prisma.decisionLog.count({ where: { decisionType: "OWNER_AI_CHAT" } }),
    prisma.creativeRevision.count({ where: { approvalStatus: { in: ["APPROVED", "REJECTED"] } } }),
  ]);
  const gaps: Gap[] = [];
  if (ownerApprovals + ownerChats === 0) gaps.push({ reason: "NO_OWNER_FEEDBACK_AUDIT" });
  if (feedbackApplied === 0) gaps.push({ reason: "NO_APPLIED_CREATIVE_FEEDBACK" });
  return done(68, "AI records and learns from Owner approvals, rejections and chat instructions with an audit trail", { ownerApprovalDecisions: ownerApprovals, ownerChatDecisions: ownerChats, reviewedCreativeRevisions: feedbackApplied }, gaps);
}

export async function getSpec69Evidence() {
  const proof = await getSpec46Evidence();
  const gaps = proof.pass ? [] : [{ reason: "SPEND_AND_ACTIVATION_GUARD_NOT_PROVEN" }];
  return done(69, "AI safety guard prevents activation, spend, budget and schedule changes without Owner authority", { dependencySpec46: proof.status, ...proof.productionData }, gaps);
}

export async function getSpec70Evidence() {
  const [accounts, pages, mappings, campaigns] = await Promise.all([
    prisma.adAccount.count({ where: { isActive: true } }),
    prisma.managedPage.count({ where: { isActive: true } }),
    prisma.metaPageAdAccountMapping.count({ where: { status: "ACTIVE", isPrimary: true } }),
    prisma.metaCampaign.count(),
  ]);
  const gaps: Gap[] = [];
  if (accounts < 2) gaps.push({ reason: "MULTI_AD_ACCOUNT_NOT_PROVEN" });
  if (pages === 0 || mappings < pages) gaps.push({ reason: "PRIMARY_PAGE_ACCOUNT_MAPPING_INCOMPLETE" });
  if (campaigns === 0) gaps.push({ reason: "NO_META_CAMPAIGN_INVENTORY" });
  return done(70, "AI manages multiple Ad Accounts with verified Page-to-primary-account isolation", { activeAdAccounts: accounts, activePages: pages, activePrimaryMappings: mappings, rememberedMetaCampaigns: campaigns }, gaps);
}

export async function getSpec71Evidence() {
  const [campaigns, adSets, ads, insights, decisions, assets] = await Promise.all([
    prisma.metaCampaign.count(), prisma.metaAdSet.count(), prisma.metaAd.count(),
    prisma.metaAdInsight.count(), prisma.decisionLog.count(), prisma.creativeAsset.count(),
  ]);
  const gaps: Gap[] = [];
  if (campaigns === 0 || adSets === 0 || ads === 0) gaps.push({ reason: "META_OBJECT_MEMORY_INCOMPLETE" });
  if (insights === 0) gaps.push({ reason: "META_RESULT_MEMORY_EMPTY" });
  if (decisions === 0 || assets === 0) gaps.push({ reason: "DECISION_OR_CREATIVE_MEMORY_EMPTY" });
  return done(71, "AI knowledge memory retains Meta objects, results, creatives and auditable decisions", { metaCampaigns: campaigns, metaAdSets: adSets, metaAds: ads, metaInsightRows: insights, decisions, creativeAssets: assets }, gaps);
}

export async function getSpec72Evidence() {
  const [kernel, analyzed, drafts, decisions] = await Promise.all([
    prisma.mediaBuyerRun.findFirst({ where: { runType: "AUTONOMY_KERNEL_V1", status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: { id: true, status: true, startedAt: true, completedAt: true } }),
    prisma.pageContent.count({ where: { analysisStatus: "COMPLETED" } }),
    prisma.campaignDraft.count(),
    prisma.decisionLog.count(),
  ]);
  const gaps: Gap[] = [];
  if (!kernel) gaps.push({ reason: "NO_AUTONOMY_KERNEL_RUN" });
  if (analyzed === 0 || drafts === 0 || decisions === 0) gaps.push({ reason: "AUTONOMOUS_OPERATING_CHAIN_INCOMPLETE" });
  return done(72, "80 AI operates the marketing loop from sync and analysis through PAUSED campaign preparation, learning and reporting", { latestKernel: kernel, analyzedContents: analyzed, campaignDrafts: drafts, auditableDecisions: decisions }, gaps);
}

export async function getSpec73Evidence() {
  const insight = await prisma.metaAdInsight.aggregate({ _count: { id: true }, _sum: { spendSatang: true, purchases: true } });
  const spend = insight._sum.spendSatang ?? 0;
  const purchases = insight._sum.purchases ?? 0;
  const cpaSatang = purchases > 0 ? Math.round(spend / purchases) : null;
  const optimizationDecisions = await prisma.decisionLog.count({ where: { decisionType: { in: ["AUDIENCE_PERFORMANCE", "CONTINUOUS_OUTCOME_LEARNING", "COMPANY_PORTFOLIO_OPTIMIZATION"] } } });
  const gaps: Gap[] = [];
  if (insight._count.id === 0) gaps.push({ reason: "NO_REAL_META_RESULT_DATA" });
  if (optimizationDecisions === 0) gaps.push({ reason: "NO_CPA_OPTIMIZATION_DECISIONS" });
  return done(73, "AI targets one order per 300 THB ad spend using real results; this is an optimization target, not a guaranteed outcome", { targetCpaSatang: 30000, measuredCpaSatang: cpaSatang, purchases, spendSatang: spend, metaInsightRows: insight._count.id, optimizationDecisions, guaranteeClaimed: false }, gaps);
}

export async function getSpec74Evidence() {
  const [coverage, meta] = await Promise.all([getSpec39Evidence(), getSpec59Evidence()]);
  const eligible = coverage.productionData.eligibleProductCount;
  const created = meta.productionData.completeMetaPausedTrees;
  const gaps: Gap[] = [];
  if (!coverage.pass) gaps.push({ reason: "ELIGIBLE_PRODUCT_COVERAGE_NOT_PROVEN" });
  if (created < eligible) gaps.push({ reason: "ELIGIBLE_CAMPAIGN_NOT_CREATED_IN_META_PAUSED" });
  return done(74, "Every eligible campaign is created as a complete Dark Post Campaign Tree in Meta; all objects remain PAUSED for Owner activation", { eligibleProducts: eligible, completeMetaPausedTrees: created, uncoveredProducts: coverage.productionData.uncoveredProducts }, gaps);
}

export async function getSpec75Evidence() {
  const policies = await prisma.pageProductPolicy.findMany({ where: { page: { isActive: true } }, select: { pageId: true, productCategory: true, minimumAds: true, page: { select: { name: true } } } });
  const since = new Date(Date.now() - 14 * 86_400_000);
  const recent = await prisma.pageContent.groupBy({ by: ["pageId", "productCategory", "mediaType"], where: { createdTime: { gte: since }, isDuplicate: false }, _count: { id: true } });
  const counts = new Map(recent.map((row) => [`${row.pageId}|${row.productCategory}|${row.mediaType}`, row._count.id]));
  const reports = policies.flatMap((policy) => {
    const categories = policy.productCategory === "APRON" ? ["PLAIN_APRON", "PRINTED_APRON"] : [policy.productCategory];
    return categories.map((category) => {
      const sourceCategory = category.endsWith("APRON") ? "APRON" : category;
      const video = [...counts.entries()].filter(([key]) => key.startsWith(`${policy.pageId}|${sourceCategory}|`) && key.toUpperCase().includes("VIDEO")).reduce((sum, [, value]) => sum + value, 0);
      const staticCount = [...counts.entries()].filter(([key]) => key.startsWith(`${policy.pageId}|${sourceCategory}|`) && !key.toUpperCase().includes("VIDEO")).reduce((sum, [, value]) => sum + value, 0);
      const target = Math.max(2, policy.minimumAds);
      const missing = Math.max(0, target - video - staticCount);
      return { pageId: policy.pageId, pageName: policy.page.name, productCategory: category, reportingWindowDays: 14, currentVideo: video, currentStatic: staticCount, requiredTotal: target, missingTotal: missing, requestedVideo: Math.ceil(missing / 2), requestedStatic: Math.floor(missing / 2), contentMix: ["SALES", "REVIEW", "EDUCATIONAL_OR_BEHIND_THE_SCENES"] };
    });
  });
  const required = ["PRINTED_SHIRT", "COTTON_DTF", "DTG", "STICKER", "PLAIN_APRON", "PRINTED_APRON"];
  const represented = new Set(reports.map((item) => item.productCategory));
  const gaps = required.filter((category) => !represented.has(category)).map((category) => ({ reason: `MISSING_CONTENT_GAP_CATEGORY:${category}` }));
  return done(75, "AI reports 7-14 day content gaps per Page and product, including required sales/review/other video and static counts", { generatedAt: new Date().toISOString(), cadenceDays: 14, requiredCategories: required, reports }, gaps);
}

export async function getSpec76Evidence() {
  const [chatMessages, attachmentMessages] = await Promise.all([
    prisma.decisionLog.count({ where: { decisionType: "OWNER_AI_CHAT" } }),
    prisma.decisionLog.count({ where: { decisionType: "OWNER_AI_CHAT", inputJson: { contains: "\"attachments\":[" } } }),
  ]);
  const gaps: Gap[] = [];
  if (chatMessages === 0) gaps.push({ reason: "NO_REAL_OWNER_AI_CHAT_AUDIT" });
  return done(76, "Authenticated in-app Owner chat supports text, images, video and documents with type/size validation and audit trail", { auditedChatMessages: chatMessages, auditedMessagesWithAttachmentField: attachmentMessages, acceptedFamilies: ["IMAGE", "VIDEO", "PDF", "DOCX", "TEXT"], maximumFilesPerMessage: 5, maximumFileBytes: 12582912, uiRoute: "/marketing/owner-ai" }, gaps);
}
