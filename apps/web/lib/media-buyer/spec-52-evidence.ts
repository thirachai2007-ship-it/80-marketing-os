import { META_INTEGRATION_HEALTH_VERSION, runMetaIntegrationHealthMonitor } from "@/lib/meta/integration-health-monitor";
import prisma from "@/lib/prisma";

export const SPEC_52_EVIDENCE_VERSION = "spec-52-evidence-v1";
export async function getSpec52Evidence() {
  const health = await runMetaIntegrationHealthMonitor();
  const [alerts, kernel] = await Promise.all([
    prisma.decisionLog.count({ where: { decisionType: "META_INTEGRATION_HEALTH_ALERT" } }),
    prisma.mediaBuyerRun.findFirst({ where: { runType: "AUTONOMY_KERNEL_V1", status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { completedAt: "desc" }, select: { summaryJson: true, completedAt: true } }),
  ]);
  let automaticStep = false;
  try { automaticStep = Boolean(kernel?.summaryJson && (JSON.parse(kernel.summaryJson) as { steps?: Array<{ step?: string }> }).steps?.some((step) => step.step === "META_INTEGRATION_HEALTH")); } catch {}
  const gaps=[] as Array<{reason:string}>;
  if (health.monitorVersion !== META_INTEGRATION_HEALTH_VERSION) gaps.push({reason:"MONITOR_VERSION_MISMATCH"});
  if (alerts === 0) gaps.push({reason:"NO_USER_VISIBLE_ALERT_AUDIT"});
  if (!automaticStep) gaps.push({reason:"AUTOMATIC_KERNEL_MONITOR_NOT_PROVEN"});
  if (!health.automatic || !health.userVisibleAlerts) gaps.push({reason:"HEALTH_MONITOR_OR_USER_ALERT_DISABLED"});
  if (health.status === "UNHEALTHY" && health.alertCount === 0) gaps.push({reason:"UNHEALTHY_STATE_WITHOUT_ALERT"});
  const pass=gaps.length===0;
  return { evidenceVersion:SPEC_52_EVIDENCE_VERSION, requirement:"AI automatically monitors Meta token, Page access, Ad Account and permissions, warning before expiry or Sync interruption", status:pass?"PASS_REAL":"NOT_PROVEN", pass, productionData:{health,alertAuditRecords:alerts,latestAutomaticKernelCompletedAt:kernel?.completedAt?.toISOString()??null,automaticKernelStepProven:automaticStep},gapCount:gaps.length,gaps,safety:{readOnlyMetaChecks:true,metaMutationExecuted:false,campaignPublished:false,realSpendUsed:false,budgetChanged:false} };
}
