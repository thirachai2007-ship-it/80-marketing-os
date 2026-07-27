import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latestAnalysis =
      await prisma.contentAnalysis.findFirst({
        orderBy: {
          updatedAt: "desc",
        },

        include: {
          content: {
            select: {
              id: true,
              pageId: true,
              pageName: true,
              message: true,
              mediaType: true,
              mediaUrl: true,
              thumbnailUrl: true,
              permalinkUrl: true,

              productCategory: true,
              productConfidence: true,
              productEvidence: true,

              analysisStatus: true,
              campaignStatus: true,
              analyzedAt: true,
            },
          },

          audiencePlan: true,
        },
      });

    if (!latestAnalysis) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ยังไม่พบผลวิเคราะห์ใน ContentAnalysis",
        },
        {
          status: 404,
        },
      );
    }

    function parseJsonArray(
      value: string | null | undefined,
    ): unknown[] {
      if (!value) {
        return [];
      }

      try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
          ? parsed
          : [];
      } catch {
        return [];
      }
    }

    const audience =
      latestAnalysis.audiencePlan;

    return NextResponse.json({
      ok: true,

      content: {
        id: latestAnalysis.content.id,
        pageId:
          latestAnalysis.content.pageId,
        pageName:
          latestAnalysis.content.pageName,
        message:
          latestAnalysis.content.message,
        mediaType:
          latestAnalysis.content.mediaType,
        mediaUrl:
          latestAnalysis.content.mediaUrl,
        thumbnailUrl:
          latestAnalysis.content.thumbnailUrl,
        permalinkUrl:
          latestAnalysis.content.permalinkUrl,

        productCategory:
          latestAnalysis.content
            .productCategory,

        productConfidence:
          latestAnalysis.content
            .productConfidence,

        productEvidence:
          latestAnalysis.content
            .productEvidence,

        analysisStatus:
          latestAnalysis.content
            .analysisStatus,

        campaignStatus:
          latestAnalysis.content
            .campaignStatus,

        analyzedAt:
          latestAnalysis.content.analyzedAt,
      },

      analysis: {
        id: latestAnalysis.id,
        modelName:
          latestAnalysis.modelName,
        promptVersion:
          latestAnalysis.promptVersion,
        analysisVersion:
          latestAnalysis.analysisVersion,

        totalScore:
          latestAnalysis.totalScore,
        visualScore:
          latestAnalysis.visualScore,
        copyScore:
          latestAnalysis.copyScore,
        hookScore:
          latestAnalysis.hookScore,
        visualClarityScore:
          latestAnalysis
            .visualClarityScore,
        productVisibilityScore:
          latestAnalysis
            .productVisibilityScore,
        offerClarityScore:
          latestAnalysis.offerClarityScore,
        textReadabilityScore:
          latestAnalysis
            .textReadabilityScore,
        salesPotentialScore:
          latestAnalysis
            .salesPotentialScore,
        audienceFitScore:
          latestAnalysis.audienceFitScore,

        recommendation:
          latestAnalysis.recommendation,
        confidence:
          latestAnalysis.confidence,
        summary:
          latestAnalysis.summary,

        reasons: parseJsonArray(
          latestAnalysis.reasonsJson,
        ),

        weaknesses: parseJsonArray(
          latestAnalysis.weaknessesJson,
        ),

        useExistingPost:
          latestAnalysis.useExistingPost,

        darkPostEligible:
          latestAnalysis.darkPostEligible,

        darkPostReason:
          latestAnalysis.darkPostReason,

        suggestedObjective:
          latestAnalysis.suggestedObjective,
      },

      audience: audience
        ? {
            strategy:
              audience.strategy,
            confidence:
              audience.confidence,
            gender:
              audience.gender,
            ageMin:
              audience.ageMin,
            ageMax:
              audience.ageMax,

            provinces: parseJsonArray(
              audience.provincesJson,
            ),

            businessTypes: parseJsonArray(
              audience.businessTypesJson,
            ),

            interests: parseJsonArray(
              audience.interestsJson,
            ),

            behaviors: parseJsonArray(
              audience.behaviorsJson,
            ),

            excludedAudiences:
              parseJsonArray(
                audience
                  .excludedAudiencesJson,
              ),

            rationale:
              audience.rationale,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown analysis result error";

    console.error(
      "[LATEST_ANALYSIS_RESULT_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}