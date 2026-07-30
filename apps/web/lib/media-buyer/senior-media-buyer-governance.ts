import { getSpec01Evidence } from "@/lib/media-buyer/spec-01-evidence";
import { getSpec02Evidence } from "@/lib/media-buyer/spec-02-evidence";
import { getSpec03Evidence } from "@/lib/media-buyer/spec-03-evidence";
import { getSpec04Evidence } from "@/lib/media-buyer/spec-04-evidence";
import { getSpec05Evidence } from "@/lib/media-buyer/spec-05-evidence";
import { getSpec06Evidence } from "@/lib/media-buyer/spec-06-evidence";
import { getSpec07Evidence } from "@/lib/media-buyer/spec-07-evidence";
import { getSpec08Evidence } from "@/lib/media-buyer/spec-08-evidence";
import { getSpec09Evidence } from "@/lib/media-buyer/spec-09-evidence";
import { getSpec10Evidence } from "@/lib/media-buyer/spec-10-evidence";
import { getSpec11Evidence } from "@/lib/media-buyer/spec-11-evidence";
import { getSpec12Evidence } from "@/lib/media-buyer/spec-12-evidence";
import { getSpec13Evidence } from "@/lib/media-buyer/spec-13-evidence";
import { getSpec14Evidence } from "@/lib/media-buyer/spec-14-evidence";
import { getSpec15Evidence } from "@/lib/media-buyer/spec-15-evidence";
import { getSpec16Evidence } from "@/lib/media-buyer/spec-16-evidence";
import { getSpec17Evidence } from "@/lib/media-buyer/spec-17-evidence";
import { getSpec18Evidence } from "@/lib/media-buyer/spec-18-evidence";
import { getSpec19Evidence } from "@/lib/media-buyer/spec-19-evidence";
import { getSpec20Evidence } from "@/lib/media-buyer/spec-20-evidence";
import { getSpec21Evidence } from "@/lib/media-buyer/spec-21-evidence";
import { getSpec22Evidence } from "@/lib/media-buyer/spec-22-evidence";
import { getSpec23Evidence } from "@/lib/media-buyer/spec-23-evidence";
import { getSpec24Evidence } from "@/lib/media-buyer/spec-24-evidence";
import { getSpec25Evidence } from "@/lib/media-buyer/spec-25-evidence";
import { getSpec26Evidence } from "@/lib/media-buyer/spec-26-evidence";
import { getSpec27Evidence } from "@/lib/media-buyer/spec-27-evidence";
import { getSpec28Evidence } from "@/lib/media-buyer/spec-28-evidence";
import { getSpec29Evidence } from "@/lib/media-buyer/spec-29-evidence";
import { getSpec30Evidence } from "@/lib/media-buyer/spec-30-evidence";
import { getSpec31Evidence } from "@/lib/media-buyer/spec-31-evidence";
import { getSpec32Evidence } from "@/lib/media-buyer/spec-32-evidence";
import { getSpec33Evidence } from "@/lib/media-buyer/spec-33-evidence";
import { getSpec34Evidence } from "@/lib/media-buyer/spec-34-evidence";
import { getSpec35Evidence } from "@/lib/media-buyer/spec-35-evidence";
import { getSpec36Evidence } from "@/lib/media-buyer/spec-36-evidence";
import { getSpec37Evidence } from "@/lib/media-buyer/spec-37-evidence";
import { getSpec38Evidence } from "@/lib/media-buyer/spec-38-evidence";
import { getSpec39Evidence } from "@/lib/media-buyer/spec-39-evidence";
import { getSpec40Evidence } from "@/lib/media-buyer/spec-40-evidence";
import { getSpec41Evidence } from "@/lib/media-buyer/spec-41-evidence";
import { getSpec42Evidence } from "@/lib/media-buyer/spec-42-evidence";
import { getSpec43Evidence } from "@/lib/media-buyer/spec-43-evidence";
import { getSpec44Evidence } from "@/lib/media-buyer/spec-44-evidence";
import { getSpec45Evidence } from "@/lib/media-buyer/spec-45-evidence";
import { getSpec46Evidence } from "@/lib/media-buyer/spec-46-evidence";
import { getSpec47Evidence } from "@/lib/media-buyer/spec-47-evidence";
import { getSpec48Evidence } from "@/lib/media-buyer/spec-48-evidence";
import { getSpec49Evidence } from "@/lib/media-buyer/spec-49-evidence";
import prisma from "@/lib/prisma";

export const SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION = "senior-media-buyer-governance-v1";
export const MASTER_SPEC_1_49_AUDIT_RUN_TYPE = "MASTER_SPEC_1_49_AUDIT_V1";

type Evidence = { status?: unknown; pass?: unknown; requirement?: unknown; gapCount?: unknown };
const checks: Array<{ spec: number; run: () => Evidence | Promise<Evidence> }> = [
  getSpec01Evidence, getSpec02Evidence, getSpec03Evidence, getSpec04Evidence, getSpec05Evidence, getSpec06Evidence, getSpec07Evidence, getSpec08Evidence, getSpec09Evidence, getSpec10Evidence,
  getSpec11Evidence, getSpec12Evidence, getSpec13Evidence, getSpec14Evidence, getSpec15Evidence, getSpec16Evidence, getSpec17Evidence, getSpec18Evidence, getSpec19Evidence, getSpec20Evidence,
  getSpec21Evidence, getSpec22Evidence, getSpec23Evidence, getSpec24Evidence, getSpec25Evidence, getSpec26Evidence, getSpec27Evidence, getSpec28Evidence, getSpec29Evidence, getSpec30Evidence,
  getSpec31Evidence, getSpec32Evidence, getSpec33Evidence, getSpec34Evidence, getSpec35Evidence, getSpec36Evidence, getSpec37Evidence, getSpec38Evidence, getSpec39Evidence, getSpec40Evidence,
  getSpec41Evidence, getSpec42Evidence, getSpec43Evidence, getSpec44Evidence, getSpec45Evidence, getSpec46Evidence, getSpec47Evidence, getSpec48Evidence, getSpec49Evidence,
].map((run, index) => ({ spec: index + 1, run }));

export async function runMasterSpec1To49Audit() {
  const startedAt = new Date();
  const run = await prisma.mediaBuyerRun.create({ data: { runType: MASTER_SPEC_1_49_AUDIT_RUN_TYPE, status: "RUNNING", startedAt }, select: { id: true } });
  try {
    const results: Array<{ spec: number; status: string; pass: boolean; gapCount: number; requirement: string; error?: string }> = [];
    for (let start = 0; start < checks.length; start += 5) {
      const group = checks.slice(start, start + 5);
      const settled = await Promise.allSettled(group.map((item) => Promise.resolve(item.run())));
      settled.forEach((result, index) => {
        const spec = group[index].spec;
        if (result.status === "rejected") {
          results.push({ spec, status: "NOT_PROVEN", pass: false, gapCount: 1, requirement: `Master Spec ${spec}`, error: result.reason instanceof Error ? result.reason.message : "Unknown audit error" });
        } else {
          const value = result.value;
          results.push({ spec, status: typeof value.status === "string" ? value.status : "NOT_PROVEN", pass: value.pass === true, gapCount: typeof value.gapCount === "number" ? value.gapCount : value.pass === true ? 0 : 1, requirement: typeof value.requirement === "string" ? value.requirement : `Master Spec ${spec}` });
        }
      });
    }
    const failed = results.filter((item) => !item.pass);
    const completedAt = new Date();
    const summary = { governanceVersion: SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION, auditScope: "MASTER_SPEC_1_TO_49", startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), totalSpecs: results.length, passedSpecs: results.length - failed.length, failedSpecs: failed.length, status: failed.length === 0 ? "PASS_REAL" : "NOT_PROVEN", results, operatingModel: { role: "SENIOR_MEDIA_BUYER_80TSHIRT", analyzePlanBuildTrackOptimizeLearn: true, masterSpec1To49Mandatory: true, netProfitFirst: true, ownerApprovalRequiredForRealSpend: true } };
    await prisma.$transaction([
      prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: failed.length === 0 ? "COMPLETED" : "FAILED", completedAt, postsFound: results.length, postsAnalyzed: results.length - failed.length, postsFailed: failed.length, summaryJson: JSON.stringify(summary), errorMessage: failed.length > 0 ? `${failed.length} Master Spec checks failed` : null } }),
      prisma.decisionLog.create({ data: { decisionType: "SENIOR_MEDIA_BUYER_GOVERNANCE", action: "AUDIT_MASTER_SPEC_1_TO_49", reason: `Senior Media Buyer governance audited all 49 prerequisite Master Specs; ${results.length - failed.length}/49 passed.`, confidence: 100, inputJson: JSON.stringify({ auditScope: "MASTER_SPEC_1_TO_49", totalSpecs: 49 }), outputJson: JSON.stringify({ runId: run.id, passedSpecs: results.length - failed.length, failedSpecs: failed.length, status: summary.status }), policyJson: JSON.stringify({ netProfitFirst: true, masterSpec1To49Mandatory: true, ownerApprovalRequiredForSpendChanges: true, ctrRole: "DIAGNOSTIC_ONLY", cpmRole: "DIAGNOSTIC_ONLY" }), policyReference: SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION } }),
    ]);
    return { ok: failed.length === 0, runId: run.id, ...summary };
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown Master Spec audit error" } });
    throw error;
  }
}
