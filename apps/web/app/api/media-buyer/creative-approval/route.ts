import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasValidOwnerSession, isSameOriginRequest } from "@/lib/owner-session";
import { isValidatedCreativeMetadata } from "@/lib/media-buyer/creative-product-consistency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fingerprint(input: {
  id: string;
  status: string;
  approvalStatus: string;
  sourceFingerprint: string | null;
}) {
  return createHash("sha256").update(JSON.stringify({
    id: input.id,
    status: input.status,
    approvalStatus: input.approvalStatus,
    sourceFingerprint: input.sourceFingerprint,
  })).digest("hex");
}

function isApprovalMetadataValid(metadata: Record<string, unknown>, productCategory: string) {
  return isValidatedCreativeMetadata(metadata, productCategory) ||
    (metadata.videoEditValidated === true && metadata.rightsBasis === "OWNED_META_PAGE");
}

export async function GET(request: NextRequest) {
  if (!hasValidOwnerSession(request)) {
    return NextResponse.json({ ok: false, authenticated: false, error: "Owner authentication required" }, { status: 401 });
  }
  const revisions = await prisma.creativeRevision.findMany({
    where: {
      status: "NEED_APPROVAL",
      approvalStatus: "NOT_SUBMITTED",
      OR: [
        { metadataJson: { contains: "\"visualProductValidated\":true" } },
        { metadataJson: { contains: "\"videoEditValidated\":true" } },
      ],
      creativeAsset: { isActive: true },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      version: true,
      revisionType: true,
      status: true,
      approvalStatus: true,
      sourceFingerprint: true,
      aspectRatio: true,
      width: true,
      height: true,
      thumbnailUrl: true,
      aiReason: true,
      editInstructions: true,
      metadataJson: true,
      updatedAt: true,
      creativeAsset: {
        select: {
          name: true,
          productCategory: true,
          originalMediaUrl: true,
          originalThumbnailUrl: true,
          page: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json({
    ok: true,
    authenticated: true,
    items: revisions.filter((revision) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(revision.metadataJson ?? "{}") as Record<string, unknown>; } catch {}
      return isApprovalMetadataValid(metadata, revision.creativeAsset.productCategory);
    }).map((revision) => ({
      id: revision.id,
      version: revision.version,
      revisionType: revision.revisionType,
      aspectRatio: revision.aspectRatio,
      width: revision.width,
      height: revision.height,
      previewUrl: revision.thumbnailUrl ?? revision.creativeAsset.originalThumbnailUrl ?? revision.creativeAsset.originalMediaUrl,
      aiReason: revision.aiReason,
      editInstructions: revision.editInstructions,
      assetName: revision.creativeAsset.name,
      pageName: revision.creativeAsset.page.name,
      productCategory: revision.creativeAsset.productCategory,
      fingerprint: fingerprint(revision),
    })),
    safety: {
      approvalDoesNotExecutePaidRender: true,
      campaignPublished: false,
      metaMutationExecuted: false,
      realAdSpendUsed: false,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidOwnerSession(request) || !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, authenticated: false, error: "Owner authentication required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    creativeRevisionId?: unknown;
    decision?: unknown;
    ownerName?: unknown;
    reason?: unknown;
    expectedFingerprint?: unknown;
    ownerConfirmation?: unknown;
  } | null;
  const creativeRevisionId = typeof body?.creativeRevisionId === "string" ? body.creativeRevisionId.trim() : "";
  const decision = typeof body?.decision === "string" ? body.decision.trim().toUpperCase() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.normalize("NFKC").trim().slice(0, 120) : "";
  const reason = typeof body?.reason === "string" ? body.reason.normalize("NFKC").trim().slice(0, 500) : "";
  const expectedFingerprint = typeof body?.expectedFingerprint === "string" ? body.expectedFingerprint : "";
  if (!creativeRevisionId || !["APPROVE", "REJECT"].includes(decision) || !ownerName || !reason || body?.ownerConfirmation !== true) {
    return NextResponse.json({ ok: false, error: "ต้องระบุรายการ คำตัดสิน Owner เหตุผล และยืนยันอย่างชัดเจน" }, { status: 400 });
  }
  const revision = await prisma.creativeRevision.findUnique({
    where: { id: creativeRevisionId },
    select: { id: true, status: true, approvalStatus: true, sourceFingerprint: true, metadataJson: true, creativeAsset: { select: { sourceContentId: true, productCategory: true } } },
  });
  if (!revision) return NextResponse.json({ ok: false, error: "ไม่พบ Creative Revision" }, { status: 404 });
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(revision.metadataJson ?? "{}") as Record<string, unknown>; } catch {}
  if (!isApprovalMetadataValid(metadata, revision.creativeAsset.productCategory)) {
    return NextResponse.json({ ok: false, error: "Creative นี้ไม่ผ่านการยืนยันประเภทสินค้าจากภาพจริง" }, { status: 409 });
  }
  if (revision.status !== "NEED_APPROVAL" || revision.approvalStatus !== "NOT_SUBMITTED") {
    return NextResponse.json({ ok: false, error: "Creative Revision ไม่ได้อยู่ในคิวรออนุมัติ" }, { status: 409 });
  }
  if (fingerprint(revision) !== expectedFingerprint) {
    return NextResponse.json({ ok: false, error: "รายการถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่" }, { status: 409 });
  }
  const approved = decision === "APPROVE";
  await prisma.$transaction([
    prisma.creativeRevision.update({
      where: { id: revision.id },
      data: approved
        ? { approvalStatus: "APPROVED", status: "READY_TO_RENDER", approvedAt: new Date(), rejectedAt: null, ownerFeedback: reason }
        : { approvalStatus: "REJECTED", status: "REJECTED", rejectedAt: new Date(), approvedAt: null, ownerFeedback: reason },
    }),
    prisma.decisionLog.create({
      data: {
        contentId: revision.creativeAsset.sourceContentId,
        decisionType: "CREATIVE_APPROVAL",
        action: approved ? "OWNER_APPROVE_CREATIVE_REVISION_V1" : "OWNER_REJECT_CREATIVE_REVISION_V1",
        reason,
        confidence: 100,
        inputJson: JSON.stringify({ creativeRevisionId, decision, ownerName, expectedFingerprint }),
        outputJson: JSON.stringify({ approvalStatus: approved ? "APPROVED" : "REJECTED", paidRenderExecuted: false }),
        policyJson: JSON.stringify({ decisionActor: "OWNER", aiDecision: false, explicitOwnerConfirmation: true, paidRenderExecuted: false, campaignPublished: false, metaMutationExecuted: false, realAdSpendUsed: false }),
        policyReference: "Master Spec 56",
      },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    creativeRevisionId,
    decision,
    approvalStatus: approved ? "APPROVED" : "REJECTED",
    paidRenderExecuted: false,
    campaignPublished: false,
    metaMutationExecuted: false,
    realAdSpendUsed: false,
  });
}
