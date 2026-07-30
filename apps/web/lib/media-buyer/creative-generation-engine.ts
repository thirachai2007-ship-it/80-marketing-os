import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";

export const CREATIVE_GENERATION_ENGINE_VERSION = "creative-generation-engine-v1";

const VARIANTS = [
  { role: "STATIC_IMAGE", aspectRatio: "9:16", width: 1024, height: 1536, placement: "STORIES_REELS", instruction: "Create a clean vertical still advertisement with one clear benefit and readable safe-area composition." },
  { role: "PRODUCT_IMAGE", aspectRatio: "4:5", width: 1024, height: 1280, placement: "FEED", instruction: "Make the real product the hero, preserve its material, shape, print, color and factual details." },
  { role: "ILLUSTRATION", aspectRatio: "1:1", width: 1024, height: 1024, placement: "FEED", instruction: "Create a brand-consistent supporting illustration around the real product without inventing product claims." },
  { role: "THUMBNAIL", aspectRatio: "1:1", width: 1024, height: 1024, placement: "THUMBNAIL", instruction: "Create a high-clarity thumbnail readable at small size with the product and primary benefit immediately visible." },
  { role: "BANNER", aspectRatio: "16:9", width: 1536, height: 1024, placement: "IN_STREAM_BANNER", instruction: "Create a wide banner with product-safe composition, concise message and clear call-to-action area." },
] as const;

function parseObject(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) as unknown : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function prepareCreativeGenerationSet(input: { creativeAssetId?: string } = {}) {
  const asset = await prisma.creativeAsset.findFirst({
    where: {
      ...(input.creativeAssetId ? { id: input.creativeAssetId } : {}),
      isActive: true,
      originalMediaUrl: { not: null },
    },
    orderBy: [
      { status: "desc" },
      { updatedAt: "desc" },
    ],
    include: {
      page: { select: { name: true } },
      revisions: {
        select: { id: true, version: true, metadataJson: true },
        orderBy: { version: "asc" },
      },
    },
  });
  if (!asset) throw new Error("ไม่พบ Creative Asset ที่มีภาพสินค้าต้นฉบับ");

  const existingRoles = new Set(
    asset.revisions.map((revision) => parseObject(revision.metadataJson).creativeRole),
  );
  const created: Array<{ id: string; role: string; aspectRatio: string; version: number }> = [];
  let nextVersion = asset.revisions.reduce((maximum, revision) => Math.max(maximum, revision.version), 0);

  for (const variant of VARIANTS) {
    if (existingRoles.has(variant.role)) continue;
    nextVersion += 1;
    const plan = {
      engineVersion: CREATIVE_GENERATION_ENGINE_VERSION,
      creativeRole: variant.role,
      placement: variant.placement,
      aspectRatio: variant.aspectRatio,
      width: variant.width,
      height: variant.height,
      brandName: asset.page.name,
      productCategory: asset.productCategory,
      instruction: variant.instruction,
      constraints: [
        "Preserve the real product and brand identity",
        "Do not invent price, promotion, certification or product claim",
        "Optimize clarity and conversion quality toward Net Profit",
        "Owner approval is required before paid rendering or publishing",
      ],
    };
    const sourceFingerprint = createHash("sha256")
      .update(JSON.stringify({ assetId: asset.id, originalMediaUrl: asset.originalMediaUrl, plan }))
      .digest("hex");
    const revision = await prisma.creativeRevision.create({
      data: {
        creativeAssetId: asset.id,
        version: nextVersion,
        revisionType: variant.role,
        status: "READY_TO_RENDER",
        providerName: "OPENAI",
        providerModel: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
        generationPrompt: [
          `Brand: ${asset.page.name}`,
          `Product category: ${asset.productCategory}`,
          variant.instruction,
          "Preserve the real product, brand identity, colors, logos and factual details from the supplied source.",
          "Primary business objective: maximize Net Profit through accurate, high-quality conversion creative.",
        ].join("\n"),
        editInstructions: JSON.stringify(plan),
        changeSummary: `Prepare new ${variant.role} creative for ${variant.placement}`,
        aiReason: "สร้าง Creative ใหม่จากข้อมูลสินค้าและแบรนด์จริงเพื่อทดสอบผลกำไรสุทธิ โดยยังไม่ render หรือเผยแพร่จนกว่า Owner จะอนุมัติ",
        mediaUrl: null,
        thumbnailUrl: asset.originalThumbnailUrl,
        mimeType: "image/png",
        width: variant.width,
        height: variant.height,
        aspectRatio: variant.aspectRatio,
        sourceFingerprint,
        targetAudienceJson: asset.targetAudienceJson,
        metadataJson: JSON.stringify({
          creativeRole: variant.role,
          placement: variant.placement,
          generationEngineVersion: CREATIVE_GENERATION_ENGINE_VERSION,
          netProfitFirst: true,
          brandName: asset.page.name,
          productCategory: asset.productCategory,
        }),
        approvalStatus: "NOT_SUBMITTED",
      },
    });
    created.push({ id: revision.id, role: variant.role, aspectRatio: variant.aspectRatio, version: revision.version });
  }

  await prisma.creativeAsset.update({
    where: { id: asset.id },
    data: {
      currentVersion: nextVersion,
      status: "NEED_APPROVAL",
      sourceMode: "AI_GENERATED_FROM_OWNED_SOURCE",
    },
  });

  await prisma.decisionLog.create({
    data: {
      contentId: asset.sourceContentId,
      decisionType: "CREATIVE_GENERATION_PLANNING",
      action: "PREPARE_MULTI_FORMAT_CREATIVE_SET_V1",
      reason: "เตรียม Creative ใหม่หลายประเภทและหลาย Placement จากสินค้าและแบรนด์จริง เพื่อเพิ่ม Net Profit",
      confidence: 100,
      inputJson: JSON.stringify({ creativeAssetId: asset.id }),
      outputJson: JSON.stringify({ created, requiredRoles: VARIANTS.map((variant) => variant.role) }),
      policyJson: JSON.stringify({
        netProfitFirst: true,
        primaryObjective: "MAXIMIZE_NET_PROFIT",
        preserveProductAndBrandIdentity: true,
        ownerApprovalRequiredBeforePaidRender: true,
        campaignPublished: false,
        metaMutationExecuted: false,
        realAdSpendUsed: false,
      }),
      policyReference: "Master Spec 56",
    },
  });

  return {
    engineVersion: CREATIVE_GENERATION_ENGINE_VERSION,
    creativeAssetId: asset.id,
    pageId: asset.pageId,
    pageName: asset.page.name,
    productCategory: asset.productCategory,
    created,
    totalRequiredVariants: VARIANTS.length,
    allVariantsPrepared: VARIANTS.every((variant) =>
      existingRoles.has(variant.role) || created.some((item) => item.role === variant.role),
    ),
    paidRenderExecuted: false,
    ownerApprovalRequired: true,
    campaignPublished: false,
    metaMutationExecuted: false,
    realAdSpendUsed: false,
  };
}
