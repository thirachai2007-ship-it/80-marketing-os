import prisma from "@/lib/prisma";

export const AUDIENCE_BUILDER_VERSION =
  "audience-builder-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAXIMUM_BATCH_SIZE = 20;

type AudienceBuildStatus =
  | "READY"
  | "REUSED"
  | "NEED_SOURCE"
  | "NEED_APPROVAL"
  | "SKIPPED"
  | "FAILED";

type BuildAudienceOptions = {
  audienceAssetId: string;
  forceRebuild?: boolean;
};

type BuildAudienceBatchOptions = {
  batchSize?: number;
  adAccountId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type AudienceBuilderResult = {
  builderVersion: string;
  status: AudienceBuildStatus;
  audienceAssetId: string;
  audienceVersionId?: string;
  audienceType?: string;
  adAccountId?: string;
  pageId?: string | null;
  metaPayload?: Record<string, unknown>;
  sourceValidated: boolean;
  duplicateReused: boolean;
  metaMutationExecuted: boolean;
  ownerApprovalRequired: boolean;
  reason: string;
};

export type AudienceBuilderBatchResult = {
  builderVersion: string;
  scanned: number;
  ready: number;
  reused: number;
  needSource: number;
  needApproval: number;
  skipped: number;
  failed: number;
  metaMutationExecuted: boolean;
  results: AudienceBuilderResult[];
};

function normalizeText(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim();
}

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_BATCH_SIZE), 1),
    MAXIMUM_BATCH_SIZE,
  );
}

function safeParseObject(value?: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ใช้ Object ว่างเมื่อ JSON เดิมไม่ถูกต้อง
  }

  return {};
}

function safeParseStringArray(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function requiresSourceAudience(audienceType: string): boolean {
  const normalized = normalizeText(audienceType).toUpperCase();

  return [
    "LOOKALIKE",
    "RETARGETING",
    "CUSTOM_AUDIENCE",
    "CUSTOMER_LIST",
    "PAGE_ENGAGEMENT",
    "VIDEO_VIEW",
    "MESSAGE_ENGAGEMENT",
    "WEBSITE_VISITOR",
  ].includes(normalized);
}

function buildMetaPayload(input: {
  audienceAssetId: string;
  name: string;
  audienceType: string;
  adAccountId: string;
  pageId: string | null;
  productCategory: string | null;
  countryCode: string;
  retentionDays: number | null;
  lookalikeRatio: number | null;
  version: {
    strategyName: string;
    gender: string | null;
    ageMin: number | null;
    ageMax: number | null;
    provincesJson: string;
    businessTypesJson: string;
    interestsJson: string;
    behaviorsJson: string;
    excludedAudiencesJson: string;
    placementsJson: string;
    rulesJson: string;
  };
  sources: Array<{
    id: string;
    sourceType: string;
    sourceReferenceId: string | null;
    sourceAudienceAssetId: string | null;
    retentionDays: number | null;
    ruleJson: string;
  }>;
}): Record<string, unknown> {
  const audienceType = normalizeText(input.audienceType).toUpperCase();

  const basePayload = {
    name: input.name,
    ad_account_id: input.adAccountId,
    page_id: input.pageId,
    product_category: input.productCategory,
    country: input.countryCode,
    audience_type: audienceType,
    strategy_name: input.version.strategyName,
    targeting: {
      gender: input.version.gender,
      age_min: input.version.ageMin,
      age_max: input.version.ageMax,
      provinces: safeParseStringArray(input.version.provincesJson),
      business_types: safeParseStringArray(input.version.businessTypesJson),
      interests: safeParseStringArray(input.version.interestsJson),
      behaviors: safeParseStringArray(input.version.behaviorsJson),
      excluded_audiences: safeParseStringArray(
        input.version.excludedAudiencesJson,
      ),
      placements: safeParseStringArray(input.version.placementsJson),
    },
    rules: safeParseObject(input.version.rulesJson),
    source_audiences: input.sources.map((source) => ({
      audience_source_id: source.id,
      source_type: source.sourceType,
      source_reference_id: source.sourceReferenceId,
      source_audience_asset_id: source.sourceAudienceAssetId,
      retention_days: source.retentionDays,
      rules: safeParseObject(source.ruleJson),
    })),
    build_context: {
      builder_version: AUDIENCE_BUILDER_VERSION,
      audience_asset_id: input.audienceAssetId,
      draft_only: true,
      meta_mutation_executed: false,
      owner_approval_required: true,
    },
  };

  if (audienceType === "LOOKALIKE") {
    return {
      ...basePayload,
      subtype: "LOOKALIKE",
      lookalike_spec: {
        ratio: input.lookalikeRatio ?? 0.01,
        country: input.countryCode,
        source_audience_id:
          input.sources[0]?.sourceReferenceId ??
          input.sources[0]?.sourceAudienceAssetId ??
          null,
      },
    };
  }

  if (
    audienceType === "RETARGETING" ||
    audienceType === "PAGE_ENGAGEMENT" ||
    audienceType === "VIDEO_VIEW" ||
    audienceType === "MESSAGE_ENGAGEMENT" ||
    audienceType === "WEBSITE_VISITOR" ||
    audienceType === "CUSTOM_AUDIENCE"
  ) {
    return {
      ...basePayload,
      subtype: "CUSTOM",
      retention_days:
        input.retentionDays ?? input.sources[0]?.retentionDays ?? 30,
    };
  }

  if (audienceType === "CUSTOMER_LIST") {
    return {
      ...basePayload,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
    };
  }

  if (audienceType === "SAVED_AUDIENCE") {
    return {
      ...basePayload,
      subtype: "SAVED",
    };
  }

  return {
    ...basePayload,
    subtype: "BROAD",
  };
}

async function writeBuilderDecisionLog(input: {
  audienceAssetId: string;
  action: string;
  reason: string;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      decisionType: "AUDIENCE_BUILDER",
      action: input.action,
      reason: input.reason,
      confidence: 100,
      inputJson: safeStringify({
        audienceAssetId: input.audienceAssetId,
        ...(typeof input.inputJson === "object" &&
        input.inputJson !== null &&
        !Array.isArray(input.inputJson)
          ? input.inputJson
          : { value: input.inputJson }),
      }),
      outputJson: safeStringify(input.outputJson),
      policyJson: safeStringify({
        draftOnly: true,
        noMetaMutation: true,
        noRealSpend: true,
        noBudgetChange: true,
        campaignPublished: false,
        ownerApprovalRequired: true,
        preventDuplicateAudience: true,
      }),
      policyReference: "Master Spec 41-46, 53-55, 66-72",
    },
  });
}

export async function buildAudienceDraftPayload(
  options: BuildAudienceOptions,
): Promise<AudienceBuilderResult> {
  const audienceAssetId = normalizeText(options.audienceAssetId);

  if (!audienceAssetId) {
    return {
      builderVersion: AUDIENCE_BUILDER_VERSION,
      status: "SKIPPED",
      audienceAssetId: "",
      sourceValidated: false,
      duplicateReused: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: "ไม่ได้ระบุ audienceAssetId",
    };
  }

  const asset = await prisma.audienceAsset.findUnique({
    where: { id: audienceAssetId },
    select: {
      id: true,
      name: true,
      audienceType: true,
      productCategory: true,
      adAccountId: true,
      pageId: true,
      metaAudienceId: true,
      status: true,
      approvalStatus: true,
      countryCode: true,
      retentionDays: true,
      lookalikeRatio: true,
      metadataJson: true,
      isActive: true,
      adAccount: {
        select: { id: true, isActive: true },
      },
      page: {
        select: { id: true, isActive: true, adAccountId: true },
      },
      versions: {
        orderBy: [{ isSelected: "desc" }, { version: "desc" }],
        take: 1,
        select: {
          id: true,
          strategyName: true,
          gender: true,
          ageMin: true,
          ageMax: true,
          provincesJson: true,
          businessTypesJson: true,
          interestsJson: true,
          behaviorsJson: true,
          excludedAudiencesJson: true,
          placementsJson: true,
          rulesJson: true,
          metadataJson: true,
          approvalStatus: true,
        },
      },
      sources: {
        where: { isActive: true },
        select: {
          id: true,
          sourceType: true,
          sourceReferenceId: true,
          sourceAudienceAssetId: true,
          retentionDays: true,
          ruleJson: true,
          sourceAudienceAsset: {
            select: {
              id: true,
              metaAudienceId: true,
              status: true,
              approvalStatus: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!asset) {
    return {
      builderVersion: AUDIENCE_BUILDER_VERSION,
      status: "SKIPPED",
      audienceAssetId,
      sourceValidated: false,
      duplicateReused: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: "ไม่พบ AudienceAsset ที่ระบุ",
    };
  }

  const common = {
    builderVersion: AUDIENCE_BUILDER_VERSION,
    audienceAssetId: asset.id,
    audienceType: asset.audienceType,
    adAccountId: asset.adAccountId,
    pageId: asset.pageId,
    metaMutationExecuted: false,
    ownerApprovalRequired: true,
  };

  if (!asset.isActive || !asset.adAccount.isActive) {
    return {
      ...common,
      status: "SKIPPED",
      sourceValidated: false,
      duplicateReused: false,
      reason: "AudienceAsset หรือ Ad Account ถูกปิดใช้งาน",
    };
  }

  if (
    asset.page &&
    (!asset.page.isActive ||
      (asset.page.adAccountId &&
        asset.page.adAccountId !== asset.adAccountId))
  ) {
    return {
      ...common,
      status: "SKIPPED",
      sourceValidated: false,
      duplicateReused: false,
      reason: "Page Mapping ไม่ตรงกับ Ad Account หรือเพจถูกปิดใช้งาน",
    };
  }

  const selectedVersion = asset.versions[0];

  if (!selectedVersion) {
    return {
      ...common,
      status: "SKIPPED",
      sourceValidated: false,
      duplicateReused: false,
      reason: "AudienceAsset ยังไม่มี AudienceVersion ที่พร้อมใช้งาน",
    };
  }

  if (asset.metaAudienceId && !options.forceRebuild) {
    return {
      ...common,
      status: "REUSED",
      audienceVersionId: selectedVersion.id,
      sourceValidated: true,
      duplicateReused: true,
      reason: "Audience นี้มี Meta Audience ID แล้ว จึงนำกลับมาใช้แทนการสร้างซ้ำ",
    };
  }

  const sourceRequired = requiresSourceAudience(asset.audienceType);

  const validSources = asset.sources.filter((source) => {
    if (source.sourceReferenceId) {
      return true;
    }

    const linked = source.sourceAudienceAsset;

    return Boolean(
      linked &&
        linked.isActive &&
        (linked.metaAudienceId ||
          linked.status === "READY" ||
          linked.status === "ACTIVE"),
    );
  });

  if (sourceRequired && validSources.length === 0) {
    await prisma.audienceAsset.update({
      where: { id: asset.id },
      data: {
        status: "DRAFT",
        learningStatus: "NEED_SOURCE",
      },
    });

    await writeBuilderDecisionLog({
      audienceAssetId: asset.id,
      action: "AUDIENCE_NEED_SOURCE",
      reason: "Audience ประเภทนี้ต้องมี Source Audience ก่อนสร้าง Payload",
      inputJson: {
        audienceType: asset.audienceType,
        sourceCount: asset.sources.length,
      },
      outputJson: {
        status: "NEED_SOURCE",
        metaMutationExecuted: false,
      },
    });

    return {
      ...common,
      status: "NEED_SOURCE",
      audienceVersionId: selectedVersion.id,
      sourceValidated: false,
      duplicateReused: false,
      reason: "Audience ประเภทนี้ยังไม่มี Source Audience ที่พร้อมใช้งาน",
    };
  }

  const metaPayload = buildMetaPayload({
    audienceAssetId: asset.id,
    name: asset.name,
    audienceType: asset.audienceType,
    adAccountId: asset.adAccountId,
    pageId: asset.pageId,
    productCategory: asset.productCategory,
    countryCode: asset.countryCode,
    retentionDays: asset.retentionDays,
    lookalikeRatio: asset.lookalikeRatio,
    version: selectedVersion,
    sources: validSources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      sourceReferenceId:
        source.sourceReferenceId ??
        source.sourceAudienceAsset?.metaAudienceId ??
        null,
      sourceAudienceAssetId: source.sourceAudienceAssetId,
      retentionDays: source.retentionDays,
      ruleJson: source.ruleJson,
    })),
  });

  const oldMetadata = safeParseObject(asset.metadataJson);
  const versionMetadata = safeParseObject(selectedVersion.metadataJson);

  const updatedMetadata = safeStringify({
    ...oldMetadata,
    audienceBuilder: {
      builderVersion: AUDIENCE_BUILDER_VERSION,
      builtAt: new Date().toISOString(),
      audienceVersionId: selectedVersion.id,
      sourceValidated: true,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
    },
    metaPayload,
    safety: {
      noRealSpend: true,
      noBudgetChange: true,
      campaignPublished: false,
      noMetaMutation: true,
    },
  });

  const updatedVersionMetadata = safeStringify({
    ...versionMetadata,
    audienceBuilder: {
      builderVersion: AUDIENCE_BUILDER_VERSION,
      builtAt: new Date().toISOString(),
      metaMutationExecuted: false,
    },
    metaPayload,
  });

  const nextStatus = asset.approvalStatus === "APPROVED" ? "READY" : "DRAFT";
  const nextVersionStatus =
    selectedVersion.approvalStatus === "APPROVED" ? "READY" : "DRAFT";

  await prisma.$transaction(async (tx) => {
    await tx.audienceAsset.update({
      where: { id: asset.id },
      data: {
        status: nextStatus,
        learningStatus: "BUILT",
        metadataJson: updatedMetadata,
      },
    });

    await tx.audienceVersion.update({
      where: { id: selectedVersion.id },
      data: {
        status: nextVersionStatus,
        metadataJson: updatedVersionMetadata,
      },
    });
  });

  const resultStatus: AudienceBuildStatus =
    asset.approvalStatus === "APPROVED" ? "READY" : "NEED_APPROVAL";

  await writeBuilderDecisionLog({
    audienceAssetId: asset.id,
    action: "BUILD_META_AUDIENCE_PAYLOAD",
    reason:
      resultStatus === "READY"
        ? "สร้าง Meta Audience Payload และผ่านการอนุมัติแล้ว"
        : "สร้าง Meta Audience Payload สำเร็จและรอเจ้าของอนุมัติ",
    inputJson: {
      audienceType: asset.audienceType,
      audienceVersionId: selectedVersion.id,
      sourceCount: validSources.length,
      forceRebuild: Boolean(options.forceRebuild),
    },
    outputJson: {
      status: resultStatus,
      metaPayload,
      metaMutationExecuted: false,
    },
  });

  return {
    ...common,
    status: resultStatus,
    audienceVersionId: selectedVersion.id,
    metaPayload,
    sourceValidated: true,
    duplicateReused: false,
    reason:
      resultStatus === "READY"
        ? "Audience Draft Payload พร้อมสำหรับขั้น Meta Builder"
        : "Audience Draft Payload พร้อมแล้ว แต่ต้องรอ Owner Approval",
  };
}

export async function runAudienceBuilderBatch(
  options: BuildAudienceBatchOptions = {},
): Promise<AudienceBuilderBatchResult> {
  const batchSize = normalizeBatchSize(options.batchSize);

  const assets = await prisma.audienceAsset.findMany({
    where: {
      isActive: true,
      status: {
        in: ["DRAFT", "READY", "FAILED"],
      },
      ...(options.adAccountId
        ? { adAccountId: options.adAccountId }
        : {}),
      ...(options.pageId ? { pageId: options.pageId } : {}),
      ...(options.productCategory
        ? { productCategory: options.productCategory }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
    select: { id: true },
  });

  const results: AudienceBuilderResult[] = [];

  for (const asset of assets) {
    try {
      results.push(
        await buildAudienceDraftPayload({
          audienceAssetId: asset.id,
          forceRebuild: options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        builderVersion: AUDIENCE_BUILDER_VERSION,
        status: "FAILED",
        audienceAssetId: asset.id,
        sourceValidated: false,
        duplicateReused: false,
        metaMutationExecuted: false,
        ownerApprovalRequired: true,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown Audience Builder error",
      });
    }
  }

  return {
    builderVersion: AUDIENCE_BUILDER_VERSION,
    scanned: assets.length,
    ready: results.filter((item) => item.status === "READY").length,
    reused: results.filter((item) => item.status === "REUSED").length,
    needSource: results.filter((item) => item.status === "NEED_SOURCE").length,
    needApproval: results.filter((item) => item.status === "NEED_APPROVAL").length,
    skipped: results.filter((item) => item.status === "SKIPPED").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    metaMutationExecuted: false,
    results,
  };
}
