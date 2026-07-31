import { getActiveMetaPagesWithTokens } from "@/lib/meta/connection-token";
import { metaRequest } from "@/lib/meta/client";
import prisma from "@/lib/prisma";

type MetaImage = { source?: string; width?: number; height?: number };
type MetaAttachment = {
  media_type?: string;
  type?: string;
  target?: { id?: string };
  media?: { source?: string; image?: { src?: string } };
};
type MetaPostMedia = {
  full_picture?: string;
  attachments?: { data?: MetaAttachment[] };
};
type MetaTargetMedia = { source?: string; images?: MetaImage[] };

export async function resolveOriginalContentMedia(analysisId: string) {
  const analysis = await prisma.contentAnalysis.findUnique({
    where: { id: analysisId },
    select: {
      content: {
        select: {
          postId: true,
          pageId: true,
          mediaType: true,
          mediaUrl: true,
          thumbnailUrl: true,
          page: { select: { metaConnectionId: true } },
        },
      },
    },
  });
  if (!analysis) return null;

  const fallback = analysis.content.mediaUrl ?? analysis.content.thumbnailUrl;
  const connectionId = analysis.content.page.metaConnectionId;
  if (!connectionId) return fallback;

  try {
    const pages = await getActiveMetaPagesWithTokens(connectionId);
    const page = pages.find((candidate) => candidate.id === analysis.content.pageId);
    if (!page) return fallback;

    const post = await metaRequest<MetaPostMedia>(
      analysis.content.postId,
      { fields: "full_picture,attachments{media_type,type,target,media}" },
      { accessToken: page.accessToken },
    );
    const attachment = post.attachments?.data?.[0];
    const targetId = attachment?.target?.id;
    if (targetId) {
      if (analysis.content.mediaType.toLowerCase().includes("video")) {
        const video = await metaRequest<MetaTargetMedia>(
          targetId,
          { fields: "source" },
          { accessToken: page.accessToken },
        );
        if (video.source) return video.source;
      }
      else {
        const photo = await metaRequest<MetaTargetMedia>(
          targetId,
          { fields: "images" },
          { accessToken: page.accessToken },
        );
        const largest = [...(photo.images ?? [])]
          .filter((image) => image.source)
          .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
        if (largest?.source) return largest.source;
      }
    }

    return analysis.content.mediaType.toLowerCase().includes("video")
      ? attachment?.media?.source ?? fallback
      : post.full_picture ?? attachment?.media?.image?.src ?? fallback;
  } catch {
    return fallback;
  }
}
