import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "ads_read",
  "ads_management",
  "business_management",
];

type Check = {
  key: string;
  label: string;
  status: "PASS" | "FAIL";
  required: boolean;
  detail: string;
};

function check({
  key,
  label,
  passed,
  detail,
  required = true,
}: {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  required?: boolean;
}): Check {
  return {
    key,
    label,
    status: passed ? "PASS" : "FAIL",
    required,
    detail,
  };
}

export async function GET() {
  const checkedAt = new Date();

  try {
    const connection =
      await prisma.metaConnection.findFirst({
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          displayName: true,
          status: true,
          userAccessTokenCiphertext: true,
          userAccessTokenIv: true,
          userAccessTokenAuthTag: true,
          tokenExpiresAt: true,
          grantedScopesJson: true,
          lastValidatedAt: true,
          lastErrorCode: true,
          lastErrorMessage: true,
        },
      });

    if (!connection) {
      return NextResponse.json(
        {
          ok: false,
          status: "UNHEALTHY",
          phase: "PHASE_1_META_INTEGRATION",
          checkedAt: checkedAt.toISOString(),
          readOnly: true,
          ownerApprovalRequired: true,
          metaMutationExecuted: false,
          checks: [
            check({
              key: "meta_connection",
              label: "Meta OAuth connection",
              passed: false,
              detail:
                "No Meta connection exists",
            }),
          ],
          totals: {
            pages: 0,
            adAccounts: 0,
            mappings: 0,
            posts: 0,
            campaigns: 0,
            adSets: 0,
            ads: 0,
            insights: 0,
          },
        },
        {
          status: 503,
        },
      );
    }

    const [
      pages,
      adAccounts,
      mappings,
      posts,
      campaigns,
      adSets,
      ads,
      insights,
      latestSyncRun,
    ] = await Promise.all([
      prisma.managedPage.count({
        where: {
          metaConnectionId: connection.id,
          isActive: true,
        },
      }),
      prisma.adAccount.count({
        where: {
          metaConnectionId: connection.id,
          isActive: true,
        },
      }),
      prisma.metaPageAdAccountMapping.count({
        where: {
          metaConnectionId: connection.id,
          status: "ACTIVE",
        },
      }),
      prisma.pageContent.count({
        where: {
          page: {
            metaConnectionId: connection.id,
            isActive: true,
          },
        },
      }),
      prisma.metaCampaign.count({
        where: {
          metaConnectionId: connection.id,
        },
      }),
      prisma.metaAdSet.count({
        where: {
          metaConnectionId: connection.id,
        },
      }),
      prisma.metaAd.count({
        where: {
          metaConnectionId: connection.id,
        },
      }),
      prisma.metaAdInsight.count({
        where: {
          metaConnectionId: connection.id,
        },
      }),
      prisma.metaSyncRun.findFirst({
        where: {
          metaConnectionId: connection.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          resourceType: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ]);

    let grantedScopes: string[] = [];

    try {
      const parsed = JSON.parse(
        connection.grantedScopesJson,
      );

      grantedScopes = Array.isArray(parsed)
        ? parsed.filter(
            (scope): scope is string =>
              typeof scope === "string",
          )
        : [];
    } catch {
      grantedScopes = [];
    }

    const missingScopes = REQUIRED_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    const tokenStored = Boolean(
      connection.userAccessTokenCiphertext &&
        connection.userAccessTokenIv &&
        connection.userAccessTokenAuthTag,
    );

    const checks: Check[] = [
      check({
        key: "database",
        label: "Neon PostgreSQL",
        passed: true,
        detail: "Database queries completed",
      }),
      check({
        key: "meta_connection",
        label: "Meta OAuth connection",
        passed: connection.status === "ACTIVE",
        detail: `Connection status is ${connection.status}`,
      }),
      check({
        key: "encrypted_token",
        label: "Encrypted OAuth token",
        passed: tokenStored,
        detail: tokenStored
          ? "Encrypted token fields are present"
          : "Encrypted token fields are missing",
      }),
      check({
        key: "required_scopes",
        label: "Required Meta permissions",
        passed: missingScopes.length === 0,
        detail:
          missingScopes.length === 0
            ? `${REQUIRED_SCOPES.length} required scopes granted`
            : `Missing: ${missingScopes.join(", ")}`,
      }),
      check({
        key: "pages",
        label: "Facebook Pages",
        passed: pages > 0,
        detail: `${pages} active pages`,
      }),
      check({
        key: "ad_accounts",
        label: "Meta Ad Accounts",
        passed: adAccounts > 0,
        detail: `${adAccounts} active ad accounts`,
      }),
      check({
        key: "page_account_mappings",
        label: "Page and Ad Account mappings",
        passed: mappings > 0,
        detail: `${mappings} active mappings`,
      }),
      check({
        key: "posts",
        label: "Page Posts",
        passed: posts > 0,
        detail: `${posts} posts stored`,
      }),
      check({
        key: "campaigns",
        label: "Meta Campaigns",
        passed: campaigns > 0,
        detail: `${campaigns} campaigns stored`,
      }),
      check({
        key: "ad_sets",
        label: "Meta Ad Sets",
        passed: adSets > 0,
        detail: `${adSets} ad sets stored`,
      }),
      check({
        key: "ads",
        label: "Meta Ads",
        passed: ads > 0,
        detail: `${ads} ads stored`,
      }),
      check({
        key: "insights",
        label: "Meta Ad Insights",
        passed: insights > 0,
        detail: `${insights} insight records stored`,
      }),
      check({
        key: "last_meta_error",
        label: "Latest Meta connection error",
        passed: !connection.lastErrorCode,
        required: false,
        detail: connection.lastErrorCode
          ? `${connection.lastErrorCode}: ${connection.lastErrorMessage || "No message"}`
          : "No connection error recorded",
      }),
    ];

    const requiredChecks =
      checks.filter((item) => item.required);
    const passedRequiredChecks =
      requiredChecks.filter(
        (item) => item.status === "PASS",
      ).length;
    const healthy =
      passedRequiredChecks ===
      requiredChecks.length;

    return NextResponse.json(
      {
        ok: healthy,
        status: healthy
          ? "HEALTHY"
          : "DEGRADED",
        phase: "PHASE_1_META_INTEGRATION",
        checkedAt: checkedAt.toISOString(),
        readOnly: true,
        ownerApprovalRequired: true,
        metaMutationExecuted: false,
        connection: {
          displayName: connection.displayName,
          status: connection.status,
          tokenExpiresAt:
            connection.tokenExpiresAt,
          lastValidatedAt:
            connection.lastValidatedAt,
        },
        permissions: {
          required: REQUIRED_SCOPES,
          granted: grantedScopes,
          missing: missingScopes,
        },
        totals: {
          pages,
          adAccounts,
          mappings,
          posts,
          campaigns,
          adSets,
          ads,
          insights,
        },
        latestSyncRun,
        summary: {
          passed: checks.filter(
            (item) => item.status === "PASS",
          ).length,
          failed: checks.filter(
            (item) => item.status === "FAIL",
          ).length,
          requiredPassed: passedRequiredChecks,
          requiredTotal: requiredChecks.length,
        },
        checks,
      },
      {
        status: healthy ? 200 : 503,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta health check failed";

    return NextResponse.json(
      {
        ok: false,
        status: "UNHEALTHY",
        phase: "PHASE_1_META_INTEGRATION",
        checkedAt: checkedAt.toISOString(),
        readOnly: true,
        ownerApprovalRequired: true,
        metaMutationExecuted: false,
        error: message,
      },
      {
        status: 503,
      },
    );
  }
}
