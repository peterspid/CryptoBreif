import type { BriefingRequest } from "./schemas";

export type MarketRegion = "global" | "china_hk";
export type ContentLanguage = "en" | "zh" | "tc";
export type EtfCountryCode = "US" | "HK";

export type MarketProfile = {
  region: MarketRegion;
  label: string;
  newsLanguage: ContentLanguage;
  etfCountryCode: EtfCountryCode;
  timezone: string;
};

export type CurrencyListItem = {
  currency_id: string;
  symbol: string;
  name: string;
};

export type CurrencyInfo = {
  currency_id: string;
  name: string;
  symbol: string;
  icon?: string;
  sector?: Array<{ id: string; name: string }>;
};

export type CurrencySnapshot = {
  price: number;
  change_pct_24h: number;
  turnover_24h?: number;
  marketcap?: number;
  fdv?: number;
  high_24h?: number;
  low_24h?: number;
  marketcap_rank?: number;
};

export type NewsItem = {
  id: string;
  title: string;
  content?: string;
  release_time: number;
  source_link?: string;
  original_link?: string;
  feature_image?: string;
  author?: string;
  matched_currencies?: Array<{
    id: string;
    full_name: string;
    name: string;
  }>;
  tags?: string[];
};

export type EtfSummary = {
  date: string;
  symbol: string;
  total_net_inflow: number;
  total_value_traded?: number;
  total_net_assets?: number;
  cum_net_inflow?: number;
};

export type TokenUnlockEvent = {
  symbol: string;
  label: string;
  amount: number;
  unlockAt: string;
  daysUntil: number;
};

export type TokenUnlockSummary = {
  symbol: string;
  unlocked?: number;
  totalLocked?: number;
  nextUnlocks: TokenUnlockEvent[];
};

export type IndexSummary = {
  ticker: string;
  price: number;
  changePct24h: number;
  roi7d?: number;
  roi1m?: number;
  roi3m?: number;
  roi1y?: number;
  ytd?: number;
  matchedSymbols: string[];
  matchedWeight: number;
  constituents: Array<{
    symbol: string;
    weight: number;
  }>;
};

export type SodexAction = {
  symbol: string;
  marketSymbol: string;
  lastPrice: number;
  changePct24h: number;
  quoteVolume: number;
  actionUrl: string;
  status: "ready" | "unsigned";
  note: string;
};

export type SodexOrderPreview = {
  symbol: string;
  marketSymbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity?: number;
  funds?: number;
  limitPrice?: number;
  estimatedNotionalUsd: number;
  slippagePct: number;
  priceProtection: {
    maxBuyPrice?: number;
    minSellPrice?: number;
  };
  timeInForce: "IOC" | "GTC";
  clOrdID: string;
  requiresSignature: true;
  endpoint: string;
  headersRequired: string[];
  warnings: string[];
};

export type SodexImportedHolding = {
  symbol: string;
  amount: number;
  locked: number;
  sourceCoin: string;
};

export type MacroEventDay = {
  date: string;
  events: string[];
};

export type HoldingDataSource = "sosovalue" | "sodex" | "unpriced";

export type EnrichedHolding = {
  symbol: string;
  amount: number;
  costBasis?: number;
  currencyId: string;
  name: string;
  icon?: string;
  sectors: string[];
  price: number;
  changePct24h: number;
  valueUsd: number;
  changeUsd24h: number;
  marketcap?: number;
  volume24h?: number;
  rank?: number;
  dataSource: HoldingDataSource;
  sourceSymbol?: string;
};

export type MarketContext = {
  generatedAt: string;
  marketProfile: MarketProfile;
  request: BriefingRequest;
  portfolio: {
    valueUsd: number;
    changeUsd24h: number;
    changePct24h: number;
    holdings: EnrichedHolding[];
  };
  news: NewsItem[];
  etfs: EtfSummary[];
  indexes: IndexSummary[];
  sodexActions: SodexAction[];
  unlocks: TokenUnlockSummary[];
  macroEvents: MacroEventDay[];
  warnings: string[];
  sources: Array<{
    label: string;
    url: string;
  }>;
};

export type BriefingResult = {
  headline: string;
  text: string;
  portfolioLine: string;
  watch: string;
  brightSpot: string;
  suggestion: string;
  dataQuality: "live" | "partial" | "fallback";
  aiStatus: "generated" | "fallback" | "not_configured";
};
