export type ContentAdLinkMethod =
  | "DIRECT_META_AD_ID"
  | "META_CREATIVE_ID"
  | "EXACT_STORY_ID";

export type ContentAdLinkSource =
  | "PAGE_CONTENT_HISTORY"
  | "CAMPAIGN_DRAFT"
  | "META_AD_STORY";

export type ContentAdLinkageContent = {
  id: string;
  pageId: string;
  postId: string;
  objectStoryId: string;
  previousMetaAdId: string | null;
};

export type ContentAdLinkageAd = {
  id: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  creativeId: string | null;
  objectStoryId: string | null;
  effectiveObjectStoryId: string | null;
  metaUpdatedTime: Date | null;
};

export type ContentAdLinkageDraft = {
  contentId: string | null;
  creativeMode: string;
  darkPostCopyId: string | null;
  creativeRevisionId: string | null;
  metaCreativeId: string | null;
  metaAdId: string | null;
  campaignDraft: {
    pageId: string;
    adAccountId: string;
    metaCampaignId: string | null;
    metaAdSetId: string | null;
  };
};

export type ContentAdLinkageAccountMapping = {
  pageId: string;
  adAccountId: string;
};

export type ContentAdResolvedLink = {
  contentId: string;
  pageId: string;
  adId: string;
  adAccountId: string;
  method: ContentAdLinkMethod;
  source: ContentAdLinkSource;
  isPrimary: boolean;
};

type Candidate = {
  contentId: string;
  source: ContentAdLinkSource;
};

type CandidateGroup = {
  method: ContentAdLinkMethod;
  candidates: Map<string, ContentAdLinkSource>;
};

const METHOD_PRIORITY: Record<
  ContentAdLinkMethod,
  number
> = {
  DIRECT_META_AD_ID: 0,
  META_CREATIVE_ID: 1,
  EXACT_STORY_ID: 2,
};

function normalize(
  value: string | null | undefined,
) {
  return value?.trim() || "";
}

function addCandidate(
  target: Map<string, Map<string, ContentAdLinkSource>>,
  adId: string,
  candidate: Candidate,
) {
  const candidates =
    target.get(adId) ||
    new Map<string, ContentAdLinkSource>();
  const current =
    candidates.get(candidate.contentId);

  if (
    !current ||
    candidate.source === "PAGE_CONTENT_HISTORY"
  ) {
    candidates.set(
      candidate.contentId,
      candidate.source,
    );
  }

  target.set(adId, candidates);
}

function uniqueStoryIds(
  values: Array<string | null | undefined>,
) {
  return new Set(
    values
      .map(normalize)
      .filter(Boolean),
  );
}

function dateValue(value: Date | null) {
  return value?.getTime() || 0;
}

export function resolveContentAdLinkage({
  contents,
  ads,
  drafts,
  accountMappings,
}: {
  contents: ContentAdLinkageContent[];
  ads: ContentAdLinkageAd[];
  drafts: ContentAdLinkageDraft[];
  accountMappings:
    ContentAdLinkageAccountMapping[];
}) {
  const contentById = new Map(
    contents.map((content) => [
      content.id,
      content,
    ]),
  );
  const adById = new Map(
    ads.map((ad) => [ad.id, ad]),
  );
  const allowedAccountsByPage = new Map<
    string,
    Set<string>
  >();
  const adsByCreativeId = new Map<
    string,
    ContentAdLinkageAd[]
  >();

  for (const mapping of accountMappings) {
    const pageId = normalize(mapping.pageId);
    const adAccountId = normalize(
      mapping.adAccountId,
    );

    if (!pageId || !adAccountId) {
      continue;
    }

    const accounts =
      allowedAccountsByPage.get(pageId) ||
      new Set<string>();
    accounts.add(adAccountId);
    allowedAccountsByPage.set(
      pageId,
      accounts,
    );
  }

  for (const ad of ads) {
    const creativeId = normalize(
      ad.creativeId,
    );

    if (!creativeId) {
      continue;
    }

    const creativeAds =
      adsByCreativeId.get(creativeId) ||
      [];
    creativeAds.push(ad);
    adsByCreativeId.set(
      creativeId,
      creativeAds,
    );
  }

  const accountAllowed = (
    content: ContentAdLinkageContent,
    ad: ContentAdLinkageAd,
  ) =>
    allowedAccountsByPage
      .get(content.pageId)
      ?.has(ad.adAccountId) === true;

  const directCandidates = new Map<
    string,
    Map<string, ContentAdLinkSource>
  >();
  const creativeCandidates = new Map<
    string,
    Map<string, ContentAdLinkSource>
  >();
  const storyCandidates = new Map<
    string,
    Map<string, ContentAdLinkSource>
  >();
  let invalidPersistedLinks = 0;
  let invalidDraftMappings = 0;
  let excludedVariantDrafts = 0;

  for (const content of contents) {
    const directAdId = normalize(
      content.previousMetaAdId,
    );

    if (!directAdId) {
      continue;
    }

    const ad = adById.get(directAdId);

    if (!ad || !accountAllowed(content, ad)) {
      invalidPersistedLinks += 1;
      continue;
    }

    addCandidate(
      directCandidates,
      ad.id,
      {
        contentId: content.id,
        source: "PAGE_CONTENT_HISTORY",
      },
    );
  }

  for (const draft of drafts) {
    const contentId = normalize(
      draft.contentId,
    );
    const content =
      contentById.get(contentId);

    if (!content) {
      continue;
    }

    if (
      draft.creativeMode !==
        "EXISTING_POST" ||
      draft.darkPostCopyId !== null ||
      draft.creativeRevisionId !== null
    ) {
      excludedVariantDrafts += 1;
      continue;
    }

    const validateAd = (
      ad: ContentAdLinkageAd,
    ) =>
      draft.campaignDraft.pageId ===
        content.pageId &&
      draft.campaignDraft.adAccountId ===
        ad.adAccountId &&
      accountAllowed(content, ad) &&
      (!draft.campaignDraft
        .metaCampaignId ||
        draft.campaignDraft
          .metaCampaignId ===
          ad.campaignId) &&
      (!draft.campaignDraft
        .metaAdSetId ||
        draft.campaignDraft
          .metaAdSetId ===
          ad.adSetId);

    const directAdId = normalize(
      draft.metaAdId,
    );

    if (directAdId) {
      const ad = adById.get(directAdId);

      if (ad && validateAd(ad)) {
        addCandidate(
          directCandidates,
          ad.id,
          {
            contentId,
            source: "CAMPAIGN_DRAFT",
          },
        );
      } else {
        invalidDraftMappings += 1;
      }
    }

    const creativeId = normalize(
      draft.metaCreativeId,
    );

    if (!creativeId) {
      continue;
    }

    for (
      const ad of
        adsByCreativeId.get(creativeId) ||
        []
    ) {
      if (validateAd(ad)) {
        addCandidate(
          creativeCandidates,
          ad.id,
          {
            contentId,
            source: "CAMPAIGN_DRAFT",
          },
        );
      } else {
        invalidDraftMappings += 1;
      }
    }
  }

  const contentsByStoryId = new Map<
    string,
    Set<string>
  >();

  for (const content of contents) {
    for (
      const storyId of uniqueStoryIds([
        content.id,
        content.postId,
        content.objectStoryId,
      ])
    ) {
      const storyContents =
        contentsByStoryId.get(storyId) ||
        new Set<string>();
      storyContents.add(content.id);
      contentsByStoryId.set(
        storyId,
        storyContents,
      );
    }
  }

  for (const ad of ads) {
    for (
      const storyId of uniqueStoryIds([
        ad.objectStoryId,
        ad.effectiveObjectStoryId,
      ])
    ) {
      const candidateContentIds =
        contentsByStoryId.get(storyId);

      if (!candidateContentIds) {
        continue;
      }

      for (const contentId of candidateContentIds) {
        const content =
          contentById.get(contentId);

        if (
          content &&
          accountAllowed(content, ad)
        ) {
          addCandidate(
            storyCandidates,
            ad.id,
            {
              contentId,
              source: "META_AD_STORY",
            },
          );
        }
      }
    }
  }

  const resolvedWithoutPrimary: Omit<
    ContentAdResolvedLink,
    "isPrimary"
  >[] = [];
  const ambiguousAds: Array<{
    adId: string;
    candidateContentIds: string[];
    method: ContentAdLinkMethod;
  }> = [];

  for (const ad of ads) {
    const groups: CandidateGroup[] = [
      {
        method: "DIRECT_META_AD_ID",
        candidates:
          directCandidates.get(ad.id) ||
          new Map(),
      },
      {
        method: "META_CREATIVE_ID",
        candidates:
          creativeCandidates.get(ad.id) ||
          new Map(),
      },
      {
        method: "EXACT_STORY_ID",
        candidates:
          storyCandidates.get(ad.id) ||
          new Map(),
      },
    ];
    const selected = groups.find(
      (group) =>
        group.candidates.size > 0,
    );

    if (!selected) {
      continue;
    }

    if (selected.candidates.size > 1) {
      ambiguousAds.push({
        adId: ad.id,
        candidateContentIds: [
          ...selected.candidates.keys(),
        ].sort(),
        method: selected.method,
      });
      continue;
    }

    const [
      contentId,
      source,
    ] = [
      ...selected.candidates.entries(),
    ][0];
    const conflictingContentIds =
      new Set(
        groups
          .filter(
            (group) =>
              group !== selected,
          )
          .flatMap((group) => [
            ...group.candidates.keys(),
          ])
          .filter(
            (candidateContentId) =>
              candidateContentId !==
              contentId,
          ),
      );

    if (
      conflictingContentIds.size > 0
    ) {
      ambiguousAds.push({
        adId: ad.id,
        candidateContentIds: [
          contentId,
          ...conflictingContentIds,
        ].sort(),
        method: selected.method,
      });
      continue;
    }

    const content =
      contentById.get(contentId);

    if (!content) {
      continue;
    }

    resolvedWithoutPrimary.push({
      contentId,
      pageId: content.pageId,
      adId: ad.id,
      adAccountId: ad.adAccountId,
      method: selected.method,
      source,
    });
  }

  const linksByContent = new Map<
    string,
    typeof resolvedWithoutPrimary
  >();

  for (const link of resolvedWithoutPrimary) {
    const links =
      linksByContent.get(link.contentId) ||
      [];
    links.push(link);
    linksByContent.set(
      link.contentId,
      links,
    );
  }

  const primaryAdIdByContent =
    new Map<string, string>();

  for (
    const [contentId, contentLinks] of
      linksByContent.entries()
  ) {
    const ordered = [...contentLinks].sort(
      (left, right) =>
        METHOD_PRIORITY[left.method] -
          METHOD_PRIORITY[right.method] ||
        dateValue(
          adById.get(right.adId)
            ?.metaUpdatedTime || null,
        ) -
          dateValue(
            adById.get(left.adId)
              ?.metaUpdatedTime || null,
          ) ||
        left.adId.localeCompare(
          right.adId,
        ),
    );
    primaryAdIdByContent.set(
      contentId,
      ordered[0].adId,
    );
  }

  const links: ContentAdResolvedLink[] =
    resolvedWithoutPrimary
      .map((link) => ({
        ...link,
        isPrimary:
          primaryAdIdByContent.get(
            link.contentId,
          ) === link.adId,
      }))
      .sort(
        (left, right) =>
          left.contentId.localeCompare(
            right.contentId,
          ) ||
          Number(right.isPrimary) -
            Number(left.isPrimary) ||
          left.adId.localeCompare(
            right.adId,
          ),
      );
  const linkedContentIds = new Set(
    links.map((link) => link.contentId),
  );
  const linkedAdIds = new Set(
    links.map((link) => link.adId),
  );
  const linksByMethod = links.reduce(
    (counts, link) => {
      counts[link.method] += 1;
      return counts;
    },
    {
      DIRECT_META_AD_ID: 0,
      META_CREATIVE_ID: 0,
      EXACT_STORY_ID: 0,
    } satisfies Record<
      ContentAdLinkMethod,
      number
    >,
  );

  return {
    links,
    primaryLinks: links.filter(
      (link) => link.isPrimary,
    ),
    ambiguousAds,
    linkedContentIds: [
      ...linkedContentIds,
    ].sort(),
    linkedAdIds: [...linkedAdIds].sort(),
    unmatchedContentIds: contents
      .filter(
        (content) =>
          !linkedContentIds.has(
            content.id,
          ),
      )
      .map((content) => content.id)
      .sort(),
    multipleAdsForContent: [
      ...linksByContent.values(),
    ].filter(
      (contentLinks) =>
        contentLinks.length > 1,
    ).length,
    invalidPersistedLinks,
    invalidDraftMappings,
    excludedVariantDrafts,
    linksByMethod,
  };
}
