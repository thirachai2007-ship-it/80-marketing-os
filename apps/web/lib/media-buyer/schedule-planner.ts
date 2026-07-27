import prisma from "@/lib/prisma";

export const SCHEDULE_PLANNER_VERSION = "schedule-planner-v1";

const ACTIVE_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

const START_TIME = "08:45";
const END_TIME = "18:00";
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type ScheduleStatus =
  | "PLANNED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type SchedulePlannerOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type SchedulePlannerBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type SchedulePlan = {
  timezone: string;
  activeDays: string[];
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  activeMinutesPerDay: number;
  activeHoursPerDay: number;
  activeDaysPerWeek: number;
  activeMinutesPerWeek: number;
  activeHoursPerWeek: number;
  sundayEnabled: false;
  holidayOverrideRequired: true;
  automaticPublishing: false;
};

export type SchedulePlannerResult = {
  plannerVersion: string;
  status: ScheduleStatus;
  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  readyAds?: number;
  schedulePlan?: SchedulePlan;
  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  scheduleChanged: false;
  metaMutationExecuted: false;
  reason?: string;
};

export type SchedulePlannerBatchResult = {
  plannerVersion: string;
  scanned: number;
  planned: number;
  updated: number;
  existing: number;
  skipped: number;
  failed: number;
  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  scheduleChanged: false;
  metaMutationExecuted: false;
  results: SchedulePlannerResult[];
};

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_BATCH_SIZE), 1),
    MAX_BATCH_SIZE,
  );
}

function normalizeTimezone(value?: string | null): string {
  return value?.trim() || "Asia/Bangkok";
}

function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    throw new Error(`รูปแบบเวลาไม่ถูกต้อง: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`ค่าเวลาไม่ถูกต้อง: ${value}`);
  }

  return hours * 60 + minutes;
}

function createSchedulePlan(timezone: string): SchedulePlan {
  const startMinutes = timeToMinutes(START_TIME);
  const endMinutes = timeToMinutes(END_TIME);
  const activeMinutesPerDay = Math.max(
    endMinutes - startMinutes,
    0,
  );
  const activeDaysPerWeek = ACTIVE_DAYS.length;
  const activeMinutesPerWeek =
    activeMinutesPerDay * activeDaysPerWeek;

  return {
    timezone,
    activeDays: [...ACTIVE_DAYS],
    startTime: START_TIME,
    endTime: END_TIME,
    startMinutes,
    endMinutes,
    activeMinutesPerDay,
    activeHoursPerDay: Number(
      (activeMinutesPerDay / 60).toFixed(2),
    ),
    activeDaysPerWeek,
    activeMinutesPerWeek,
    activeHoursPerWeek: Number(
      (activeMinutesPerWeek / 60).toFixed(2),
    ),
    sundayEnabled: false,
    holidayOverrideRequired: true,
    automaticPublishing: false,
  };
}

function parseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid metadata is replaced safely.
  }

  return {};
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(record[key])}`,
    )
    .join(",")}}`;
}

export async function planCampaignSchedule(
  options: SchedulePlannerOptions,
): Promise<SchedulePlannerResult> {
  const safety = {
    ownerApprovalRequired: true as const,
    campaignPublished: false as const,
    realSpendUsed: false as const,
    budgetChanged: false as const,
    scheduleChanged: false as const,
    metaMutationExecuted: false as const,
  };

  const draft = await prisma.campaignDraft.findUnique({
    where: {
      id: options.campaignDraftId,
    },
    select: {
      id: true,
      pageId: true,
      productCategory: true,
      campaignName: true,
      status: true,
      timezone: true,
      page: {
        select: {
          name: true,
          isActive: true,
        },
      },
      ads: {
        select: {
          id: true,
          status: true,
        },
      },
      audienceUsages: {
        select: {
          id: true,
          metadataJson: true,
        },
      },
      decisions: {
        where: {
          action: "PLAN_CAMPAIGN_SCHEDULE_V1",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          outputJson: true,
        },
      },
    },
  });

  if (!draft) {
    return {
      plannerVersion: SCHEDULE_PLANNER_VERSION,
      status: "SKIPPED",
      campaignDraftId: options.campaignDraftId,
      ...safety,
      reason: "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  if (!draft.page.isActive) {
    return {
      plannerVersion: SCHEDULE_PLANNER_VERSION,
      status: "SKIPPED",
      campaignDraftId: draft.id,
      campaignName: draft.campaignName,
      pageId: draft.pageId,
      pageName: draft.page.name,
      productCategory: draft.productCategory,
      ...safety,
      reason: "ManagedPage ถูกปิดใช้งาน",
    };
  }

  const readyAds = draft.ads.filter(
    (ad) => ad.status === "READY_FOR_APPROVAL",
  );

  if (readyAds.length === 0) {
    return {
      plannerVersion: SCHEDULE_PLANNER_VERSION,
      status: "SKIPPED",
      campaignDraftId: draft.id,
      campaignName: draft.campaignName,
      pageId: draft.pageId,
      pageName: draft.page.name,
      productCategory: draft.productCategory,
      readyAds: 0,
      ...safety,
      reason:
        "CampaignDraft ยังไม่มี Ads สถานะ READY_FOR_APPROVAL",
    };
  }

  const schedulePlan = createSchedulePlan(
    normalizeTimezone(draft.timezone),
  );

  const latestDecision = draft.decisions[0] ?? null;

  if (
    !options.forceRebuild &&
    latestDecision?.outputJson
  ) {
    try {
      const parsed = JSON.parse(
        latestDecision.outputJson,
      ) as {
        schedulePlan?: unknown;
      };

      if (
        stableStringify(parsed.schedulePlan) ===
        stableStringify(schedulePlan)
      ) {
        return {
          plannerVersion: SCHEDULE_PLANNER_VERSION,
          status: "EXISTING",
          campaignDraftId: draft.id,
          campaignName: draft.campaignName,
          pageId: draft.pageId,
          pageName: draft.page.name,
          productCategory: draft.productCategory,
          readyAds: readyAds.length,
          schedulePlan,
          ...safety,
          reason:
            "Schedule Plan ปัจจุบันตรงกับ Schedule Planner v1 แล้ว",
        };
      }
    } catch {
      // Rebuild invalid previous DecisionLog output.
    }
  }

  const hadPreviousPlan = Boolean(latestDecision);

  await prisma.$transaction(async (tx) => {
    for (const usage of draft.audienceUsages) {
      const metadata = parseObject(usage.metadataJson);

      await tx.audienceUsage.update({
        where: {
          id: usage.id,
        },
        data: {
          metadataJson: JSON.stringify({
            ...metadata,
            schedulePlanner: {
              plannerVersion: SCHEDULE_PLANNER_VERSION,
              generatedAt: new Date().toISOString(),
              draftOnly: true,
              ownerApprovalRequired: true,
              scheduleChanged: false,
              plan: schedulePlan,
            },
          }),
        },
      });
    }

    await tx.decisionLog.create({
      data: {
        campaignDraftId: draft.id,
        decisionType: "SCHEDULE_PLANNING",
        action: "PLAN_CAMPAIGN_SCHEDULE_V1",
        reason:
          `Schedule Planner v1 วางตาราง Draft วันจันทร์-เสาร์ เวลา ${START_TIME}-${END_TIME} เขตเวลา ${schedulePlan.timezone} สำหรับ ${readyAds.length} Ads โดยยังไม่เปลี่ยน Schedule จริง`,
        confidence: 96,
        inputJson: JSON.stringify({
          plannerVersion: SCHEDULE_PLANNER_VERSION,
          campaignDraftId: draft.id,
          campaignName: draft.campaignName,
          pageId: draft.pageId,
          pageName: draft.page.name,
          productCategory: draft.productCategory,
          draftStatus: draft.status,
          timezone: schedulePlan.timezone,
          readyAds: readyAds.length,
          forceRebuild: options.forceRebuild ?? false,
        }),
        outputJson: JSON.stringify({
          status: hadPreviousPlan ? "UPDATED" : "PLANNED",
          schedulePlan,
          ownerApprovalRequired: true,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
          scheduleChanged: false,
          metaMutationExecuted: false,
        }),
        policyJson: JSON.stringify({
          activeDays: ACTIVE_DAYS,
          startTime: START_TIME,
          endTime: END_TIME,
          sundayEnabled: false,
          holidayOverrideRequired: true,
          noMetaMutation: true,
          noRealSpend: true,
          scheduleChanged: false,
          ownerApprovalRequired: true,
          draftOnly: true,
        }),
        policyReference:
          "Master Spec 29-44, 66-72",
      },
    });
  });

  return {
    plannerVersion: SCHEDULE_PLANNER_VERSION,
    status: hadPreviousPlan ? "UPDATED" : "PLANNED",
    campaignDraftId: draft.id,
    campaignName: draft.campaignName,
    pageId: draft.pageId,
    pageName: draft.page.name,
    productCategory: draft.productCategory,
    readyAds: readyAds.length,
    schedulePlan,
    ...safety,
    reason:
      `Schedule Planner v1 วาง Schedule Draft จันทร์-เสาร์ ${START_TIME}-${END_TIME} สำเร็จ และรอ Owner Approval`,
  };
}

export async function runSchedulePlannerBatch(
  options: SchedulePlannerBatchOptions = {},
): Promise<SchedulePlannerBatchResult> {
  const drafts = await prisma.campaignDraft.findMany({
    where: {
      status: {
        in: [
          "PLANNING",
          "PAUSED",
          "READY_FOR_APPROVAL",
        ],
      },
      ...(options.campaignDraftId
        ? { id: options.campaignDraftId }
        : {}),
      ...(options.pageId
        ? { pageId: options.pageId }
        : {}),
      ...(options.productCategory
        ? { productCategory: options.productCategory }
        : {}),
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: normalizeBatchSize(options.batchSize),
    select: {
      id: true,
    },
  });

  const results: SchedulePlannerResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await planCampaignSchedule({
          campaignDraftId: draft.id,
          forceRebuild: options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        plannerVersion: SCHEDULE_PLANNER_VERSION,
        status: "FAILED",
        campaignDraftId: draft.id,
        ownerApprovalRequired: true,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
        scheduleChanged: false,
        metaMutationExecuted: false,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown Schedule Planner error",
      });
    }
  }

  return {
    plannerVersion: SCHEDULE_PLANNER_VERSION,
    scanned: results.length,
    planned: results.filter(
      (item) => item.status === "PLANNED",
    ).length,
    updated: results.filter(
      (item) => item.status === "UPDATED",
    ).length,
    existing: results.filter(
      (item) => item.status === "EXISTING",
    ).length,
    skipped: results.filter(
      (item) => item.status === "SKIPPED",
    ).length,
    failed: results.filter(
      (item) => item.status === "FAILED",
    ).length,
    ownerApprovalRequired: true,
    campaignPublished: false,
    realSpendUsed: false,
    budgetChanged: false,
    scheduleChanged: false,
    metaMutationExecuted: false,
    results,
  };
}
