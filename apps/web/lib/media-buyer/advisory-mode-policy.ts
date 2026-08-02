export const ADVISORY_MODE_POLICY_VERSION = "80-marketing-ai-advisory-v1";

/** Meta is a read-only data source. The Owner creates and edits all ads. */
export const advisoryModePolicy = {
  mode: "READ_ONLY_ADVISOR",
  contentWindowDays: 75,
  metaReadAllowed: true,
  metaWriteAllowed: false,
  campaignCreationAllowed: false,
  campaignEditingAllowed: false,
  budgetEditingAllowed: false,
  scheduleEditingAllowed: false,
  campaignActivationAllowed: false,
} as const;

export function metaWriteDisabledResponse() {
  return {
    ok: false,
    error:
      "80 Marketing AI อยู่ในโหมดที่ปรึกษาแบบอ่านอย่างเดียว เจ้าของเป็นผู้สร้างและแก้ไขแคมเปญใน Meta เอง",
    policyVersion: ADVISORY_MODE_POLICY_VERSION,
    policy: advisoryModePolicy,
    metaMutationExecuted: false,
  };
}
