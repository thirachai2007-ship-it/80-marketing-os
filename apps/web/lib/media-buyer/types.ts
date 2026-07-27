export type MediaType =
  | "IMAGE"
  | "VIDEO"
  | "CAROUSEL"
  | "TEXT"
  | "UNKNOWN";

export type ManagedPage = {
  id: string;
  name: string;
  category: string;
  pictureUrl: string | null;
};

export type MetaManagedPage = ManagedPage & {
  accessToken: string;
};

export type PageContent = {
  id: string;

  pageId: string;
  pageName: string;
  pagePictureUrl: string | null;

  message: string;
  createdTime: string;
  permalinkUrl: string;

  thumbnailUrl: string | null;
  mediaType: MediaType;

  postId: string;
  objectStoryId: string;
};

export type ScoreRecommendation =
  | "ใช้โพสต์เดิมยิงแอด"
  | "ทดลองด้วย Dark Post"
  | "ไม่แนะนำให้ยิง";

export type ScoreConfidence =
  | "สูง"
  | "ปานกลาง"
  | "ต่ำ";

export type GenderTarget =
  | "ALL"
  | "MALE"
  | "FEMALE";

export type ProvinceRecommendation = {
  name: string;
  priority: number;
  reason: string;
};

export type DarkPostCopy = {
  id: string;
  angle:
    | "PROBLEM"
    | "BENEFIT"
    | "OFFER";

  angleName: string;
  primaryText: string;
  headline: string;
  description: string;

  callToAction:
    | "SEND_MESSAGE"
    | "LEARN_MORE"
    | "SHOP_NOW"
    | "GET_QUOTE";
};

export type AudienceRecommendation = {
  confidence: number;

  strategy:
    | "BROAD"
    | "INTEREST"
    | "BROAD_PLUS_INTEREST_TEST";

  gender: GenderTarget;

  ageMin: number;
  ageMax: number;

  provinces: ProvinceRecommendation[];

  businessTypes: string[];
  interests: string[];
  behaviors: string[];

  excludedAudiences: string[];

  rationale: string;
};

export type ContentScore = {
  total: number;

  visualScore: number;
  copyScore: number;

  hook: number;
  visualClarity: number;
  productVisibility: number;
  offerClarity: number;
  textReadability: number;
  salesPotential: number;
  audienceFit: number;

  recommendation: ScoreRecommendation;
  confidence: ScoreConfidence;

  summary: string;
  reasons: string[];
  weaknesses: string[];

  useExistingPost: boolean;

  darkPostEligible: boolean;
  darkPostReason: string;
  darkPostCopies: DarkPostCopy[];

  suggestedObjective:
    | "MESSAGES"
    | "SALES"
    | "LEADS"
    | "ENGAGEMENT";

  audience: AudienceRecommendation;
};

export type ScoredContent = PageContent & {
  score?: ContentScore;
};