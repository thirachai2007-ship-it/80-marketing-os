import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRendering(value: string | null) {
  try {
    const metadata = value ? JSON.parse(value) as { rendering?: unknown } : {};
    return metadata.rendering && typeof metadata.rendering === "object"
      ? metadata.rendering as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ creativeRevisionId: string }> },
) {
  const { creativeRevisionId } = await context.params;
  const revision = await prisma.creativeRevision.findUnique({
    where: { id: creativeRevisionId },
    select: {
      status: true,
      mimeType: true,
      outputFingerprint: true,
      metadataJson: true,
    },
  });
  if (!revision || revision.status !== "RENDERED" || !revision.outputFingerprint) {
    return NextResponse.json({ ok: false, error: "ไม่พบ Creative Media" }, { status: 404 });
  }
  const rendering = parseRendering(revision.metadataJson);
  const base64Data = typeof rendering.base64Data === "string" ? rendering.base64Data : "";
  if (!base64Data || rendering.storage !== "DATABASE_BASE64_V1") {
    return NextResponse.json({ ok: false, error: "Creative Media ไม่มีไฟล์ถาวร" }, { status: 404 });
  }
  const bytes = Buffer.from(base64Data, "base64");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": revision.mimeType || "image/png",
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      etag: `"${revision.outputFingerprint}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
