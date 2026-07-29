import prisma from "@/lib/prisma";

import {
  getContentAnalysisCoverage,
  runBalancedAnalysisBatch,
} from "@/lib/media-buyer/content-analysis-coverage";

export const CONTENT_ANALYSIS_AUTO_RUN_VERSION =
  "content-analysis-auto-run-scheduler-v1";

const AUTO_RUN_TYPE =
  "CONTENT_ANALYSIS_AUTO_RUN_PLAN";
const DEFAULT_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 5;
const MAX_APPROVED_ITEMS = 100;
const MAX_ZERO_PROGRESS_TICKS = 3;
const CHECKPOINT_LIMIT = 12;
const STALE_TICK_MS =
  6 * 60 * 1000;
const START_ADVISORY_LOCK_KEY =
  8_020_260_201;

const OPEN_STATUSES = [
  "ACTIVE",
  "RUNNING",
  "PAUSE_REQUESTED",
  "CANCEL_REQUESTED",
  "PAUSED",
] as const;

type AutoRunStatus =
  | (typeof OPEN_STATUSES)[number]
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

type AutoRunCheckpoint = {
  tick: number;
  at: string;
  status: string;
  reserved: number;
  completed: number;
  failed: number;
  requeued: number;
  pageId: string | null;
  pageName: string | null;
  message: string;
};

type AutoRunSummary = {
  schedulerVersion: string;
  ownerApproved: true;
  ownerApprovedAt: string;
  approvalSource:
    "OWNER_EXPLICIT_CONFIRMATION";
  approvedMaxItems: number;
  targetItems: number;
  batchSize: number;
  attemptedItems: number;
  completedItems: number;
  failedItems: number;
  requeuedItems: number;
  skippedItems: number;
  tickCount: number;
  zeroProgressTicks: number;
  lastTickAt: string | null;
  lastPageId: string | null;
  lastPageName: string | null;
  stopReason: string | null;
  lastError: string | null;
  checkpoints: AutoRunCheckpoint[];
};

type AutoRunRecord = {
  id: string;
  status: string;
  postsFound: number;
  postsCreated: number;
  postsAnalyzed: number;
  postsFailed: number;
  summaryJson: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
};

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(1, Math.floor(value)),
  );
}

function parseSummary(
  record: AutoRunRecord,
): AutoRunSummary {
  if (!record.summaryJson) {
    throw new Error(
      "แผน Auto-Run ไม่มีข้อมูล Owner Approval ระบบจึงหยุดแบบ Fail-Closed",
    );
  }

  let parsed:
    | Partial<AutoRunSummary>
    | null = null;

  try {
    parsed = JSON.parse(
      record.summaryJson,
    ) as Partial<AutoRunSummary>;
  } catch {
    throw new Error(
      "ข้อมูลแผน Auto-Run เสียหาย ระบบจึงหยุดแบบ Fail-Closed",
    );
  }

  if (
    parsed.schedulerVersion !==
      CONTENT_ANALYSIS_AUTO_RUN_VERSION ||
    parsed.ownerApproved !== true ||
    parsed.approvalSource !==
      "OWNER_EXPLICIT_CONFIRMATION" ||
    typeof parsed.ownerApprovedAt !==
      "string" ||
    !Number.isFinite(
      Date.parse(
        parsed.ownerApprovedAt,
      ),
    )
  ) {
    throw new Error(
      "ไม่สามารถยืนยัน Owner Approval ของแผน Auto-Run ได้",
    );
  }

  if (
    !Number.isInteger(
      parsed.approvedMaxItems,
    ) ||
    !Number.isInteger(
      parsed.targetItems,
    ) ||
    !Number.isInteger(
      parsed.batchSize,
    ) ||
    parsed.approvedMaxItems! < 1 ||
    parsed.approvedMaxItems! >
      MAX_APPROVED_ITEMS ||
    parsed.targetItems! < 0 ||
    parsed.targetItems! >
      parsed.approvedMaxItems! ||
    parsed.batchSize! < 1 ||
    parsed.batchSize! >
      MAX_BATCH_SIZE
  ) {
    throw new Error(
      "ขอบเขต Owner Approval ของแผน Auto-Run ไม่ถูกต้อง",
    );
  }

  const approvedMaxItems =
    parsed.approvedMaxItems!;
  const targetItems =
    parsed.targetItems!;
  const batchSize =
    parsed.batchSize!;

  if (
    approvedMaxItems < 1 ||
    targetItems < 0 ||
    targetItems >
      approvedMaxItems ||
    batchSize < 1
  ) {
    throw new Error(
      "ขอบเขต Owner Approval ของแผน Auto-Run ไม่ถูกต้อง",
    );
  }

  const counters = [
    parsed.attemptedItems,
    parsed.completedItems,
    parsed.failedItems,
    parsed.requeuedItems,
    parsed.skippedItems,
    parsed.tickCount,
    parsed.zeroProgressTicks,
  ];

  if (
    counters.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0,
    ) ||
    (parsed.attemptedItems ??
      0) > targetItems ||
    (parsed.completedItems ??
      0) >
      (parsed.attemptedItems ?? 0)
  ) {
    throw new Error(
      "Checkpoint ของแผน Auto-Run ไม่ถูกต้อง ระบบจึงหยุดแบบ Fail-Closed",
    );
  }

  return {
    schedulerVersion:
      CONTENT_ANALYSIS_AUTO_RUN_VERSION,
    ownerApproved: true,
    ownerApprovedAt:
      parsed.ownerApprovedAt,
    approvalSource:
      "OWNER_EXPLICIT_CONFIRMATION",
    approvedMaxItems,
    targetItems,
    batchSize,
    attemptedItems:
      parsed.attemptedItems!,
    completedItems:
      parsed.completedItems!,
    failedItems:
      parsed.failedItems!,
    requeuedItems:
      parsed.requeuedItems!,
    skippedItems:
      parsed.skippedItems!,
    tickCount:
      parsed.tickCount!,
    zeroProgressTicks:
      parsed.zeroProgressTicks!,
    lastTickAt:
      typeof parsed.lastTickAt ===
      "string"
        ? parsed.lastTickAt
        : null,
    lastPageId:
      typeof parsed.lastPageId ===
      "string"
        ? parsed.lastPageId
        : null,
    lastPageName:
      typeof parsed.lastPageName ===
      "string"
        ? parsed.lastPageName
        : null,
    stopReason:
      typeof parsed.stopReason ===
      "string"
        ? parsed.stopReason
        : null,
    lastError:
      typeof parsed.lastError ===
      "string"
        ? parsed.lastError
        : record.errorMessage,
    checkpoints:
      Array.isArray(
        parsed.checkpoints,
      )
        ? (
            parsed.checkpoints as AutoRunCheckpoint[]
          ).slice(
            -CHECKPOINT_LIMIT,
          )
        : [],
  };
}

function safeJson(
  summary: AutoRunSummary,
) {
  return JSON.stringify(summary);
}

function safety(
  ownerApprovedForThisPlan:
    boolean,
) {
  return {
    ownerApprovalRequired: true,
    ownerApprovedForThisPlan,
    campaignPublished: false,
    realSpendUsed: false,
    budgetChanged: false,
    metaMutationExecuted: false,
  };
}

async function findPlan(
  planId?: string,
) {
  if (planId) {
    return prisma.mediaBuyerRun.findFirst({
      where: {
        id: planId,
        runType: AUTO_RUN_TYPE,
      },
    });
  }

  const openPlan =
    await prisma.mediaBuyerRun.findFirst({
      where: {
        runType: AUTO_RUN_TYPE,
        status: {
          in: [
            ...OPEN_STATUSES,
          ],
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

  if (openPlan) {
    return openPlan;
  }

  return prisma.mediaBuyerRun.findFirst({
    where: {
      runType: AUTO_RUN_TYPE,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

async function recoverStalePlan(
  record: AutoRunRecord | null,
) {
  if (
    !record ||
    ![
      "RUNNING",
      "PAUSE_REQUESTED",
      "CANCEL_REQUESTED",
    ].includes(record.status)
  ) {
    return record;
  }

  const summary =
    parseSummary(record);
  const lastTickTime =
    summary.lastTickAt
      ? Date.parse(
          summary.lastTickAt,
        )
      : Number.NaN;

  if (
    Number.isFinite(
      lastTickTime,
    ) &&
    Date.now() - lastTickTime <
      STALE_TICK_MS
  ) {
    return record;
  }

  const now = new Date();
  const cancellationRequested =
    record.status ===
    "CANCEL_REQUESTED";
  const checkpoint:
    AutoRunCheckpoint = {
    tick:
      summary.tickCount + 1,
    at: now.toISOString(),
    status:
      cancellationRequested
        ? "CANCELLED"
        : "RECOVERED",
    reserved: 0,
    completed: 0,
    failed: 0,
    requeued: 0,
    pageId:
      summary.lastPageId,
    pageName:
      summary.lastPageName,
    message:
      cancellationRequested
        ? "ตรวจพบ Tick ที่หมดเวลาหลังเจ้าของสั่งหยุด ระบบยืนยันยกเลิกแผนแล้ว"
        : "ตรวจพบ Tick ที่หมดเวลา ระบบหยุดแผนไว้ที่ Checkpoint เพื่อรอเจ้าของตรวจสอบ",
  };
  const recoveredSummary:
    AutoRunSummary = {
    ...summary,
    tickCount:
      summary.tickCount + 1,
    stopReason:
      cancellationRequested
        ? "OWNER_CANCELLED"
        : "STALE_TICK_RECOVERED",
    lastError:
      cancellationRequested
        ? null
        : "Vercel Tick หมดเวลาหรือขาดการตอบกลับ ระบบ Recovery หยุดแผนอย่างปลอดภัย",
    checkpoints: [
      ...summary.checkpoints,
      checkpoint,
    ].slice(-CHECKPOINT_LIMIT),
  };

  const recovered =
    await prisma.mediaBuyerRun.updateMany({
      where: {
        id: record.id,
        status:
          cancellationRequested
            ? "CANCEL_REQUESTED"
            : {
                in: [
                  "RUNNING",
                  "PAUSE_REQUESTED",
                ],
              },
      },
      data: {
        status:
          cancellationRequested
            ? "CANCELLED"
            : "PAUSED",
        completedAt:
          cancellationRequested
            ? now
            : null,
        errorMessage:
          recoveredSummary.lastError,
        summaryJson:
          safeJson(
            recoveredSummary,
          ),
      },
    });

  if (recovered.count !== 1) {
    return findPlan(record.id);
  }

  return findPlan(record.id);
}

async function publicStatus(
  record: AutoRunRecord | null,
  coverageInput?: Awaited<
    ReturnType<
      typeof getContentAnalysisCoverage
    >
  >,
) {
  const coverage =
    coverageInput ??
    (await getContentAnalysisCoverage());

  if (!record) {
    return {
      schedulerVersion:
        CONTENT_ANALYSIS_AUTO_RUN_VERSION,
      plan: null,
      queue: {
        ready:
          coverage.totals.queueReady,
        completed:
          coverage.totals.completed,
        totalPosts:
          coverage.totals.totalPosts,
        coveragePercent:
          coverage.totals
            .coveragePercent,
      },
      limits: {
        maximumApprovedItems:
          MAX_APPROVED_ITEMS,
        maximumBatchSize:
          MAX_BATCH_SIZE,
        explicitOwnerConfirmationRequired:
          true,
      },
      safety: safety(false),
    };
  }

  const summary =
    parseSummary(record);
  const remainingApproved =
    Math.max(
      0,
      summary.targetItems -
        summary.attemptedItems,
    );
  const progressPercent =
    summary.targetItems > 0
      ? Math.min(
          100,
          Math.round(
            (summary.attemptedItems /
              summary.targetItems) *
              10_000,
          ) / 100,
        )
      : 100;

  return {
    schedulerVersion:
      CONTENT_ANALYSIS_AUTO_RUN_VERSION,
    plan: {
      id: record.id,
      status:
        record.status as AutoRunStatus,
      startedAt:
        record.startedAt,
      completedAt:
        record.completedAt,
      ownerApprovedAt:
        summary.ownerApprovedAt,
      approvedMaxItems:
        summary.approvedMaxItems,
      targetItems:
        summary.targetItems,
      batchSize:
        summary.batchSize,
      attemptedItems:
        summary.attemptedItems,
      completedItems:
        summary.completedItems,
      failedItems:
        summary.failedItems,
      requeuedItems:
        summary.requeuedItems,
      skippedItems:
        summary.skippedItems,
      remainingApproved,
      progressPercent,
      tickCount:
        summary.tickCount,
      lastTickAt:
        summary.lastTickAt,
      lastPageId:
        summary.lastPageId,
      lastPageName:
        summary.lastPageName,
      stopReason:
        summary.stopReason,
      lastError:
        summary.lastError,
      checkpoints:
        summary.checkpoints,
    },
    queue: {
      ready:
        coverage.totals.queueReady,
      completed:
        coverage.totals.completed,
      totalPosts:
        coverage.totals.totalPosts,
      coveragePercent:
        coverage.totals
          .coveragePercent,
    },
    limits: {
      maximumApprovedItems:
        MAX_APPROVED_ITEMS,
      maximumBatchSize:
        MAX_BATCH_SIZE,
      explicitOwnerConfirmationRequired:
        true,
    },
    safety: safety(true),
  };
}

export async function getContentAnalysisAutoRunStatus(
  planId?: string,
) {
  const plan =
    await recoverStalePlan(
      await findPlan(planId),
    );

  if (planId && !plan) {
    throw new Error(
      "ไม่พบแผน Auto-Run",
    );
  }

  return publicStatus(
    plan,
  );
}

export async function startContentAnalysisAutoRun(
  options: {
    approvedMaxItems?: number;
    batchSize?: number;
    confirmAiUsage?: boolean;
  },
) {
  if (!options.confirmAiUsage) {
    throw new Error(
      "ต้องยืนยันการใช้ AI ด้วย confirmAiUsage=true ก่อนสร้างแผน Auto-Run",
    );
  }

  const coverage =
    await getContentAnalysisCoverage();
  const approvedMaxItems =
    normalizeInteger(
      options.approvedMaxItems,
      10,
      MAX_APPROVED_ITEMS,
    );
  const batchSize =
    normalizeInteger(
      options.batchSize,
      DEFAULT_BATCH_SIZE,
      MAX_BATCH_SIZE,
    );
  const targetItems =
    Math.min(
      approvedMaxItems,
      coverage.totals.queueReady,
    );
  const now = new Date();
  const status: AutoRunStatus =
    targetItems > 0
      ? "ACTIVE"
      : "COMPLETED";

  const summary: AutoRunSummary = {
    schedulerVersion:
      CONTENT_ANALYSIS_AUTO_RUN_VERSION,
    ownerApproved: true,
    ownerApprovedAt:
      now.toISOString(),
    approvalSource:
      "OWNER_EXPLICIT_CONFIRMATION",
    approvedMaxItems,
    targetItems,
    batchSize,
    attemptedItems: 0,
    completedItems: 0,
    failedItems: 0,
    requeuedItems: 0,
    skippedItems: 0,
    tickCount: 0,
    zeroProgressTicks: 0,
    lastTickAt: null,
    lastPageId: null,
    lastPageName: null,
    stopReason:
      targetItems === 0
        ? "NO_READY_ITEMS"
        : null,
    lastError: null,
    checkpoints: [],
  };

  const plan =
    await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            ${START_ADVISORY_LOCK_KEY}::bigint
          )
        `;

        const existing =
          await transaction.mediaBuyerRun.findFirst({
            where: {
              runType:
                AUTO_RUN_TYPE,
              status: {
                in: [
                  ...OPEN_STATUSES,
                ],
              },
            },
            orderBy: {
              startedAt:
                "desc",
            },
          });

        if (existing) {
          throw new Error(
            "มีแผน Auto-Run ที่ยังไม่จบ กรุณาทำต่อหรือยุติแผนเดิม",
          );
        }

        return transaction.mediaBuyerRun.create({
          data: {
            runType:
              AUTO_RUN_TYPE,
            status,
            postsFound:
              targetItems,
            summaryJson:
              safeJson(summary),
            completedAt:
              status ===
              "COMPLETED"
                ? now
                : null,
          },
        });
      },
      {
        maxWait: 5_000,
        timeout: 10_000,
      },
    );

  return publicStatus(
    plan,
    coverage,
  );
}

export async function pauseContentAnalysisAutoRun(
  planId: string,
) {
  const plan =
    await recoverStalePlan(
      await findPlan(planId),
    );

  if (!plan) {
    throw new Error(
      "ไม่พบแผน Auto-Run",
    );
  }

  if (
    plan.status === "COMPLETED" ||
    plan.status === "CANCELLED" ||
    plan.status === "FAILED"
  ) {
    return publicStatus(plan);
  }

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: "ACTIVE",
    },
    data: {
      status: "PAUSED",
    },
  });

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: "RUNNING",
    },
    data: {
      status:
        "PAUSE_REQUESTED",
    },
  });

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: "ACTIVE",
    },
    data: {
      status: "PAUSED",
    },
  });

  return publicStatus(
    await findPlan(plan.id),
  );
}

export async function stopContentAnalysisAutoRun(
  planId: string,
) {
  const plan =
    await recoverStalePlan(
      await findPlan(planId),
    );

  if (!plan) {
    throw new Error(
      "ไม่พบแผน Auto-Run",
    );
  }

  if (
    plan.status === "COMPLETED" ||
    plan.status === "CANCELLED" ||
    plan.status === "FAILED"
  ) {
    return publicStatus(plan);
  }

  const now = new Date();

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: {
        in: [
          "ACTIVE",
          "PAUSED",
        ],
      },
    },
    data: {
      status: "CANCELLED",
      completedAt: now,
    },
  });

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: {
        in: [
          "RUNNING",
          "PAUSE_REQUESTED",
        ],
      },
    },
    data: {
      status:
        "CANCEL_REQUESTED",
    },
  });

  await prisma.mediaBuyerRun.updateMany({
    where: {
      id: plan.id,
      status: {
        in: [
          "ACTIVE",
          "PAUSED",
        ],
      },
    },
    data: {
      status: "CANCELLED",
      completedAt: now,
    },
  });

  let current =
    await findPlan(plan.id);

  if (
    current?.status ===
    "CANCELLED"
  ) {
    const latestSummary =
      parseSummary(current);

    current =
      await prisma.mediaBuyerRun.update({
        where: {
          id: current.id,
        },
        data: {
          summaryJson: safeJson({
            ...latestSummary,
            stopReason:
              "OWNER_CANCELLED",
          }),
        },
      });
  }

  return publicStatus(current);
}

export async function resumeContentAnalysisAutoRun(
  planId: string,
) {
  const plan =
    await recoverStalePlan(
      await findPlan(planId),
    );

  if (!plan) {
    throw new Error(
      "ไม่พบแผน Auto-Run",
    );
  }

  if (plan.status !== "PAUSED") {
    throw new Error(
      "ทำต่อได้เฉพาะแผนที่อยู่ในสถานะ PAUSED",
    );
  }

  const summary =
    parseSummary(plan);

  if (
    summary.attemptedItems >=
    summary.targetItems
  ) {
    if (
      summary.failedItems > 0 ||
      summary.requeuedItems > 0 ||
      summary.lastError
    ) {
      throw new Error(
        "แผนใช้จำนวนที่อนุมัติครบแล้วและมีรายการต้องตรวจสอบ กรุณาหยุดแผนและเริ่มแผนใหม่หลังตรวจสอบ",
      );
    }

    const completed =
      await prisma.mediaBuyerRun.updateMany({
        where: {
          id: plan.id,
          status: "PAUSED",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

    const current =
      await findPlan(plan.id);

    return publicStatus(
      completed.count === 1
        ? current
        : current,
    );
  }

  const resumed =
    await prisma.mediaBuyerRun.updateMany({
      where: {
        id: plan.id,
        status: "PAUSED",
      },
      data: {
        status: "ACTIVE",
        errorMessage: null,
        summaryJson: safeJson({
          ...summary,
          stopReason: null,
          lastError: null,
        }),
      },
    });

  const updated =
    await findPlan(plan.id);

  if (
    resumed.count !== 1 ||
    !updated
  ) {
    return publicStatus(
      updated,
    );
  }

  return publicStatus(updated);
}

export async function tickContentAnalysisAutoRun(
  planId: string,
) {
  const candidate =
    await findPlan(planId);

  if (!candidate) {
    throw new Error(
      "ไม่พบแผน Auto-Run",
    );
  }

  if (candidate.status !== "ACTIVE") {
    return {
      ...(await publicStatus(
        await recoverStalePlan(
          candidate,
        ),
      )),
      tickAccepted: false,
      message:
        candidate.status ===
        "RUNNING"
          ? "มี Tick กำลังทำงานอยู่แล้ว"
          : "แผนยังไม่อยู่ในสถานะ ACTIVE",
    };
  }

  const summary =
    parseSummary(candidate);
  const remainingApproved =
    Math.max(
      0,
      summary.targetItems -
        summary.attemptedItems,
    );

  if (remainingApproved === 0) {
    const completedCount =
      await prisma.mediaBuyerRun.updateMany({
        where: {
          id: candidate.id,
          status: "ACTIVE",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          summaryJson: safeJson({
            ...summary,
            stopReason:
              "APPROVED_LIMIT_REACHED",
          }),
        },
      });
    const completed =
      await findPlan(
        candidate.id,
      );

    return {
      ...(await publicStatus(
        completed,
      )),
      tickAccepted:
        completedCount.count === 1,
      message:
        "ครบจำนวนที่เจ้าของอนุมัติแล้ว",
    };
  }

  const reserved =
    Math.min(
      summary.batchSize,
      remainingApproved,
    );
  const reservedSummary:
    AutoRunSummary = {
    ...summary,
    attemptedItems:
      summary.attemptedItems +
      reserved,
    lastTickAt:
      new Date().toISOString(),
    lastError: null,
  };
  const locked =
    await prisma.mediaBuyerRun.updateMany({
      where: {
        id: planId,
        runType: AUTO_RUN_TYPE,
        status: "ACTIVE",
      },
      data: {
        status: "RUNNING",
        postsCreated:
          reservedSummary.attemptedItems,
        summaryJson:
          safeJson(
            reservedSummary,
          ),
      },
    });

  if (locked.count !== 1) {
    const current =
      await findPlan(planId);

    if (!current) {
      throw new Error(
        "ไม่พบแผน Auto-Run",
      );
    }

    return {
      ...(await publicStatus(
        current,
      )),
      tickAccepted: false,
      message:
        current.status === "RUNNING"
          ? "มี Tick กำลังทำงานอยู่แล้ว"
          : "แผนยังไม่อยู่ในสถานะ ACTIVE",
    };
  }

  const plan =
    await findPlan(planId);

  if (!plan) {
    throw new Error(
      "ไม่พบแผน Auto-Run หลังจาก Lock",
    );
  }

  try {
    const result =
      await runBalancedAnalysisBatch({
        batchSize: reserved,
        confirmAiUsage: true,
      });
    const worker =
      result.status === "COMPLETED" &&
      result.batch
        ? result.batch.worker
        : null;
    const completed =
      worker?.completed ?? 0;
    const failed =
      worker?.failed ?? 0;
    const requeued =
      worker?.requeued ?? 0;
    const skipped =
      worker?.skipped ?? 0;
    const madeProgress =
      completed +
        failed +
        requeued +
        skipped >
      0;
    const zeroProgressTicks =
      madeProgress
        ? 0
        : reservedSummary.zeroProgressTicks +
          1;
    const selectedPage =
      result.status === "COMPLETED" &&
      result.selectedPage
        ? result.selectedPage
        : null;
    const checkpoint: AutoRunCheckpoint =
      {
        tick:
          reservedSummary.tickCount +
          1,
        at: new Date().toISOString(),
        status:
          result.status,
        reserved,
        completed,
        failed,
        requeued,
        pageId:
          selectedPage?.pageId ??
          null,
        pageName:
          selectedPage?.pageName ??
          null,
        message:
          result.status === "NO_WORK"
            ? result.message ??
              "ไม่มีรายการ READY ที่ต้องวิเคราะห์"
            : `วิเคราะห์สำเร็จ ${completed} รายการ ล้มเหลว ${failed} รายการ ส่งกลับคิว ${requeued} รายการ`,
      };
    const nextSummary: AutoRunSummary =
      {
        ...reservedSummary,
        completedItems:
          reservedSummary.completedItems +
          completed,
        failedItems:
          reservedSummary.failedItems +
          failed,
        requeuedItems:
          reservedSummary.requeuedItems +
          requeued,
        skippedItems:
          reservedSummary.skippedItems +
          skipped,
        tickCount:
          reservedSummary.tickCount +
          1,
        zeroProgressTicks,
        lastPageId:
          selectedPage?.pageId ??
          reservedSummary.lastPageId,
        lastPageName:
          selectedPage?.pageName ??
          reservedSummary.lastPageName,
        checkpoints: [
          ...reservedSummary.checkpoints,
          checkpoint,
        ].slice(-CHECKPOINT_LIMIT),
      };
    const approvedLimitReached =
      nextSummary.attemptedItems >=
      nextSummary.targetItems;
    const noWork =
      result.status === "NO_WORK";
    const shouldPause =
      failed > 0 ||
      requeued > 0 ||
      zeroProgressTicks >=
        MAX_ZERO_PROGRESS_TICKS;

    let normalStatus: AutoRunStatus =
      "ACTIVE";
    let normalStopReason:
      | string
      | null = null;

    if (shouldPause) {
      normalStatus = "PAUSED";
      normalStopReason =
        failed > 0
          ? "BATCH_REQUIRES_REVIEW"
          : requeued > 0
            ? "BATCH_REQUEUED_REVIEW"
            : "NO_PROGRESS_GUARD";
    } else if (approvedLimitReached) {
      normalStatus = "COMPLETED";
      normalStopReason =
        "APPROVED_LIMIT_REACHED";
    } else if (noWork) {
      normalStatus = "COMPLETED";
      normalStopReason =
        "NO_READY_ITEMS";
    }

    const counters = {
      postsCreated:
        nextSummary.attemptedItems,
      postsAnalyzed:
        nextSummary.completedItems,
      postsFailed:
        nextSummary.failedItems,
    };
    const finishedAt =
      new Date();

    const cancelled =
      await prisma.mediaBuyerRun.updateMany({
        where: {
          id: plan.id,
          status:
            "CANCEL_REQUESTED",
        },
        data: {
          ...counters,
          status: "CANCELLED",
          summaryJson: safeJson({
            ...nextSummary,
            stopReason:
              "OWNER_CANCELLED",
          }),
          completedAt:
            finishedAt,
        },
      });

    if (cancelled.count === 0) {
      const paused =
        await prisma.mediaBuyerRun.updateMany({
          where: {
            id: plan.id,
            status: {
              in: [
                "PAUSE_REQUESTED",
                "PAUSED",
              ],
            },
          },
          data: {
            ...counters,
            status: "PAUSED",
            summaryJson: safeJson({
              ...nextSummary,
              stopReason:
                "OWNER_PAUSE_REQUESTED",
            }),
          },
        });

      if (paused.count === 0) {
        await prisma.mediaBuyerRun.updateMany({
          where: {
            id: plan.id,
            status: "RUNNING",
          },
          data: {
            ...counters,
            status:
              normalStatus,
            summaryJson: safeJson({
              ...nextSummary,
              stopReason:
                normalStopReason,
            }),
            completedAt:
              normalStatus ===
              "COMPLETED"
                ? finishedAt
                : null,
          },
        });
      }
    }

    const updated =
      await findPlan(plan.id);

    return {
      ...(await publicStatus(
        updated,
        result.status ===
          "COMPLETED" &&
          result.coverageAfter
          ? result.coverageAfter
          : result.coverageBefore,
      )),
      tickAccepted: true,
      message:
        checkpoint.message,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "เกิดข้อผิดพลาดใน Auto-Run Tick";
    const checkpoint: AutoRunCheckpoint =
      {
        tick:
          reservedSummary.tickCount +
          1,
        at: new Date().toISOString(),
        status: "FAILED",
        reserved,
        completed: 0,
        failed: 0,
        requeued: 0,
        pageId: null,
        pageName: null,
        message,
      };
    const failedSummary:
      AutoRunSummary = {
      ...reservedSummary,
      tickCount:
        reservedSummary.tickCount + 1,
      stopReason: "TICK_ERROR",
      lastError: message,
      checkpoints: [
        ...reservedSummary.checkpoints,
        checkpoint,
      ].slice(-CHECKPOINT_LIMIT),
    };

    const cancelled =
      await prisma.mediaBuyerRun.updateMany({
        where: {
          id: plan.id,
          status:
            "CANCEL_REQUESTED",
        },
        data: {
          status:
            "CANCELLED",
          completedAt:
            new Date(),
          errorMessage: message,
          postsCreated:
            failedSummary.attemptedItems,
          summaryJson: safeJson({
            ...failedSummary,
            stopReason:
              "OWNER_CANCELLED",
          }),
        },
      });

    if (cancelled.count === 0) {
      await prisma.mediaBuyerRun.updateMany({
        where: {
          id: plan.id,
          status: {
            in: [
              "RUNNING",
              "PAUSE_REQUESTED",
              "PAUSED",
            ],
          },
        },
        data: {
          status: "PAUSED",
          errorMessage: message,
          postsCreated:
            failedSummary.attemptedItems,
          summaryJson:
            safeJson(
              failedSummary,
            ),
        },
      });
    }

    const updated =
      await findPlan(plan.id);

    return {
      ...(await publicStatus(
        updated,
      )),
      tickAccepted: true,
      message:
        "หยุดอัตโนมัติเพื่อให้เจ้าของตรวจสอบข้อผิดพลาด",
    };
  }
}
