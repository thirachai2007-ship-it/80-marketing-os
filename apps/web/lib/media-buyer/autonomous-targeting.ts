import { metaRequest } from "@/lib/meta/client";
import prisma from "@/lib/prisma";

type MetaSearchItem = {
  id?: string;
  key?: string;
  name?: string;
  type?: string;
  country_code?: string;
};

type MetaSearchResponse = {
  data?: MetaSearchItem[];
};

function parseStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function clampAge(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(65, Math.max(18, Math.trunc(value!)));
}

function isNationwideThailand(value: string) {
  const normalized = value.trim().toLocaleLowerCase("th-TH");
  return [
    "ทั่วประเทศไทย",
    "ประเทศไทย",
    "ทั้งประเทศไทย",
    "thailand",
    "nationwide",
  ].includes(normalized);
}

async function resolveRegions(names: string[]) {
  const regions: Array<{ key: string; name: string }> = [];
  const unresolved: string[] = [];

  for (const name of [...new Set(names)].slice(0, 8)) {
    try {
      const response = await metaRequest<MetaSearchResponse>("search", {
        type: "adgeolocation",
        q: name,
        location_types: JSON.stringify(["region"]),
        country_code: "TH",
        limit: "10",
      });
      const match = response.data?.find(
        (item) =>
          Boolean(item.key) &&
          (!item.country_code || item.country_code === "TH") &&
          (!item.type || item.type.toLowerCase() === "region"),
      );
      if (match?.key) {
        regions.push({ key: match.key, name: match.name || name });
      } else {
        unresolved.push(name);
      }
    } catch {
      unresolved.push(name);
    }
  }

  return { regions, unresolved };
}

async function resolveInterests(names: string[]) {
  const interests: Array<{ id: string; name: string }> = [];
  const unresolved: string[] = [];

  for (const name of [...new Set(names)].slice(0, 8)) {
    try {
      const response = await metaRequest<MetaSearchResponse>("search", {
        type: "adinterest",
        q: name,
        limit: "10",
      });
      const match = response.data?.find((item) => Boolean(item.id));
      if (match?.id) {
        interests.push({ id: match.id, name: match.name || name });
      } else {
        unresolved.push(name);
      }
    } catch {
      unresolved.push(name);
    }
  }

  return { interests, unresolved };
}

export async function buildAutonomousTargeting(campaignDraftId: string) {
  const draft = await prisma.campaignDraft.findUnique({
    where: { id: campaignDraftId },
    select: {
      id: true,
      audienceUsages: {
        where: { status: { in: ["PLANNED", "READY", "ACTIVE"] } },
        orderBy: [{ allocationPercent: "desc" }, { createdAt: "asc" }],
        select: {
          role: true,
          audienceAsset: {
            select: {
              id: true,
              name: true,
              audienceType: true,
              metaAudienceId: true,
              isActive: true,
              status: true,
              approvalStatus: true,
              versions: {
                where: { isSelected: true },
                orderBy: { version: "desc" },
                take: 1,
                select: {
                  gender: true,
                  ageMin: true,
                  ageMax: true,
                  provincesJson: true,
                  interestsJson: true,
                  excludedAudiencesJson: true,
                },
              },
            },
          },
        },
      },
      ads: {
        orderBy: { adNumber: "asc" },
        take: 1,
        select: {
          content: {
            select: {
              analysis: {
                select: {
                  audiencePlan: {
                    select: {
                      gender: true,
                      ageMin: true,
                      ageMax: true,
                      provincesJson: true,
                      interestsJson: true,
                      excludedAudiencesJson: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!draft) throw new Error("Campaign Draft not found for targeting");

  const plan = draft.ads[0]?.content?.analysis?.audiencePlan ?? null;
  const selectedVersions = draft.audienceUsages
    .map((usage) => usage.audienceAsset.versions[0])
    .filter((version): version is NonNullable<typeof version> => Boolean(version));
  const primaryVersion = selectedVersions[0] ?? null;

  const provinceNames = parseStringArray(
    plan?.provincesJson ?? primaryVersion?.provincesJson,
  ).filter((name) => !isNationwideThailand(name));
  const interestNames = parseStringArray(
    plan?.interestsJson ?? primaryVersion?.interestsJson,
  );

  const [{ regions, unresolved: unresolvedRegions }, { interests, unresolved: unresolvedInterests }] =
    await Promise.all([
      resolveRegions(provinceNames),
      resolveInterests(interestNames),
    ]);

  const activeAssets = draft.audienceUsages.filter(({ audienceAsset }) => {
    return (
      audienceAsset.isActive &&
      ["READY", "ACTIVE"].includes(audienceAsset.status) &&
      audienceAsset.approvalStatus === "APPROVED" &&
      Boolean(audienceAsset.metaAudienceId)
    );
  });
  // The current CampaignDraft schema owns one Meta Ad Set. Apply only the
  // highest-allocation verified audience instead of silently OR-ing Retarget,
  // LAL, and prospecting audiences into one imprecise Ad Set.
  const selectedIncludedAssets = activeAssets
    .filter(({ role, audienceAsset }) => {
      const type = audienceAsset.audienceType.toUpperCase();
      return role !== "EXCLUSION" && !type.includes("EXCLUDE");
    })
    .slice(0, 1);
  const includedCustomAudiences = selectedIncludedAssets
    .map(({ audienceAsset }) => ({
      id: audienceAsset.metaAudienceId!,
    }));
  const excludedCustomAudiences = activeAssets
    .filter(({ role, audienceAsset }) => {
      const type = audienceAsset.audienceType.toUpperCase();
      return role === "EXCLUSION" || type.includes("EXCLUDE");
    })
    .map(({ audienceAsset }) => ({
      id: audienceAsset.metaAudienceId!,
    }));

  const rawGender = (plan?.gender ?? primaryVersion?.gender ?? "ALL").toUpperCase();
  const genders =
    rawGender === "MALE"
      ? [1]
      : rawGender === "FEMALE"
        ? [2]
        : undefined;
  const ageMin = clampAge(plan?.ageMin ?? primaryVersion?.ageMin, 20);
  const ageMax = Math.max(
    ageMin,
    clampAge(plan?.ageMax ?? primaryVersion?.ageMax, 65),
  );

  const targeting: Record<string, unknown> = {
    geo_locations:
      regions.length > 0
        ? { regions }
        : { countries: ["TH"] },
    age_min: ageMin,
    age_max: ageMax,
    ...(genders ? { genders } : {}),
    ...(interests.length > 0 && includedCustomAudiences.length === 0
      ? { flexible_spec: [{ interests }] }
      : {}),
    ...(includedCustomAudiences.length > 0
      ? { custom_audiences: includedCustomAudiences }
      : {}),
    ...(excludedCustomAudiences.length > 0
      ? { excluded_custom_audiences: excludedCustomAudiences }
      : {}),
  };

  return {
    targeting,
    evidence: {
      strategy:
        includedCustomAudiences.length > 0
          ? "CUSTOM_AUDIENCE_OR_LOOKALIKE"
          : interests.length > 0 || regions.length > 0
            ? "AUDIENCE_PLAN"
            : "BROAD_FALLBACK",
      ageMin,
      ageMax,
      gender: rawGender,
      requestedProvinces: provinceNames,
      resolvedRegions: regions,
      unresolvedRegions,
      requestedInterests: interestNames,
      resolvedInterests: interests,
      unresolvedInterests,
      includedCustomAudiences: selectedIncludedAssets
        .map(({ role, audienceAsset }) => ({
          role,
          audienceType: audienceAsset.audienceType,
          audienceAssetId: audienceAsset.id,
          metaAudienceId: audienceAsset.metaAudienceId,
        })),
      excludedCustomAudiences: excludedCustomAudiences.map((item) => item.id),
      broadFallback:
        regions.length === 0 &&
        interests.length === 0 &&
        includedCustomAudiences.length === 0,
    },
  };
}
