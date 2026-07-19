import type { BriefingRequest } from "./schemas";
import type {
  ContentLanguage,
  EtfCountryCode,
  MarketProfile,
  MarketRegion,
} from "./types";

const MARKET_PROFILES: Record<
  MarketRegion,
  Omit<MarketProfile, "timezone" | "newsLanguage" | "etfCountryCode"> & {
    defaultLanguage: ContentLanguage;
    defaultEtfCountryCode: EtfCountryCode;
  }
> = {
  global: {
    region: "global",
    label: "Global / US",
    defaultLanguage: "en",
    defaultEtfCountryCode: "US",
  },
  china_hk: {
    region: "china_hk",
    label: "China / Hong Kong",
    defaultLanguage: "zh",
    defaultEtfCountryCode: "HK",
  },
};

export function resolveMarketProfile(request: BriefingRequest): MarketProfile {
  const base = MARKET_PROFILES[request.marketRegion ?? "china_hk"];

  return {
    region: base.region,
    label: base.label,
    newsLanguage: request.contentLanguage ?? base.defaultLanguage,
    etfCountryCode: request.etfCountryCode ?? base.defaultEtfCountryCode,
    timezone: request.timezone,
  };
}

export function contentLanguageName(language: ContentLanguage) {
  if (language === "zh") {
    return "Simplified Chinese";
  }

  if (language === "tc") {
    return "Traditional Chinese";
  }

  return "English";
}
