import type { BriefingRequest } from "./schemas";

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

export type MacroEventDay = {
  date: string;
  events: string[];
};

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
};

export type MarketContext = {
  generatedAt: string;
  request: BriefingRequest;
  portfolio: {
    valueUsd: number;
    changeUsd24h: number;
    changePct24h: number;
    holdings: EnrichedHolding[];
  };
  news: NewsItem[];
  etfs: EtfSummary[];
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
