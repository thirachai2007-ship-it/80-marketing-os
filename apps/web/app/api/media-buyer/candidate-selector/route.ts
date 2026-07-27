import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CANDIDATE_SELECTOR_VERSION,
  selectCampaignCandidates,
  type CandidateProductCategory,
} from "@/lib/media-buyer/candidate-selector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_CATEGORIES = new Set([
  "COTTON_DTF",
  "DTG",
  "PRINTED_SHIRT",
  "APRON",
  "STICKER",
]);

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function parseBoolean(
  value: string | null,
  fallback: boolean,
): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    selectorVersion:
      CANDIDATE_SELECTOR_VERSION,
    mode:
      "DEBUG_AND_SELECT_ONLY",
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
    usage:
      "POST /api/media-buyer/candidate-selector?pageId=PAGE_ID&productCategory=PRINTED_SHIRT",
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const pageId =
      params.get("pageId")?.trim();

    const productCategory =
      params
        .get("productCategory")
        ?.trim()
        .toUpperCase();

    if (!pageId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "กรุณาระบุ pageId",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !productCategory ||
      !PRODUCT_CATEGORIES.has(
        productCategory,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "productCategory ไม่ถูกต้อง",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await selectCampaignCandidates({
        pageId,

        productCategory:
          productCategory as
            CandidateProductCategory,

        minimumScore:
          parseNumber(
            params.get("minimumScore"),
            80,
          ),

        minimumAds:
          parseNumber(
            params.get("minimumAds"),
            3,
          ),

        maximumAds:
          parseNumber(
            params.get("maximumAds"),
            3,
          ),

        allowExistingPost:
          parseBoolean(
            params.get(
              "allowExistingPost",
            ),
            true,
          ),

        allowDarkPost:
          parseBoolean(
            params.get(
              "allowDarkPost",
            ),
            true,
          ),

        useOldWinningContent:
          parseBoolean(
            params.get(
              "useOldWinningContent",
            ),
            true,
          ),

        candidateLimit:
          parseNumber(
            params.get(
              "candidateLimit",
            ),
            300,
          ),
      });

    console.log(
      "[CANDIDATE_SELECTOR_DEBUG]",
      {
        raw:
          result.rawCandidateCount,
        eligible:
          result.eligibleCandidateCount,
        selected:
          result.selectedCandidateCount,
        rejected:
          result.rejectedCandidates.length,
      },
    );

    return NextResponse.json({
      ok: true,

      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Candidate Selector error";

    console.error(
      "[CANDIDATE_SELECTOR_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}