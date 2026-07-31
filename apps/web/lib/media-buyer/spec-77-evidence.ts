import { getSpec57Evidence } from "@/lib/media-buyer/spec-57-evidence";
import { getSpec58Evidence } from "@/lib/media-buyer/spec-58-evidence";
import { getSpec59Evidence } from "@/lib/media-buyer/spec-59-evidence";
import { getSpec60Evidence } from "@/lib/media-buyer/spec-60-evidence";
import {
  getSpec61Evidence,
  getSpec62Evidence,
  getSpec63Evidence,
  getSpec64Evidence,
} from "@/lib/media-buyer/spec-61-64-evidence";
import {
  getSpec65Evidence,
  getSpec66Evidence,
  getSpec67Evidence,
  getSpec68Evidence,
  getSpec69Evidence,
  getSpec70Evidence,
  getSpec71Evidence,
  getSpec72Evidence,
  getSpec73Evidence,
  getSpec74Evidence,
  getSpec75Evidence,
  getSpec76Evidence,
} from "@/lib/media-buyer/spec-65-76-evidence";

type EvidenceResult = {
  status: string;
  pass: boolean;
  gapCount: number;
};

export async function getSpec77Evidence() {
  const checks = await Promise.all([
    getSpec57Evidence(),
    getSpec58Evidence(),
    getSpec59Evidence(),
    getSpec60Evidence(),
    getSpec61Evidence(),
    getSpec62Evidence(),
    getSpec63Evidence(),
    getSpec64Evidence(),
    getSpec65Evidence(),
    getSpec66Evidence(),
    getSpec67Evidence(),
    getSpec68Evidence(),
    getSpec69Evidence(),
    getSpec70Evidence(),
    getSpec71Evidence(),
    getSpec72Evidence(),
    getSpec73Evidence(),
    getSpec74Evidence(),
    getSpec75Evidence(),
    getSpec76Evidence(),
  ] as Promise<EvidenceResult>[]);
  const specs = checks.map((check, index) => ({
    spec: index + 57,
    status: check.status,
    pass: check.pass,
    gapCount: check.gapCount,
  }));
  const failed = specs.filter((item) => !item.pass);
  const pass = failed.length === 0;

  return {
    evidenceVersion: "spec-77-evidence-v1",
    requirement:
      "80 AI performs the complete Media Buyer, advertising, marketing and analysis role across specs 57-77 without omissions, while Owner alone activates campaigns and controls spend",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      verifiedSpecRange: "57-76",
      verifiedCount: specs.length,
      passedCount: specs.length - failed.length,
      specs,
      failed,
    },
    gapCount: failed.length,
    gaps: failed.map((item) => ({
      reason: `DEPENDENCY_SPEC_${item.spec}_NOT_PROVEN`,
    })),
    safety: {
      readOnlyEvidence: true,
      allCreatedMetaObjectsPaused: true,
      ownerActivationRequired: true,
      campaignActivated: false,
      realSpendUsed: false,
      budgetChanged: false,
      scheduleChanged: false,
    },
  };
}
