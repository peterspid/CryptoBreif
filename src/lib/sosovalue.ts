import { addDays, isAfter, isBefore, parseISO } from "date-fns";
import { env, requireSecret } from "./env";
import { stripHtml, truncate } from "./format";
import {
  buildSodexActions,
  buildSodexFallbackHoldings,
  createUnpricedHolding,
  getSodexSpotTickers,
} from "./sodex";
import type {
  CurrencyInfo,
  CurrencyListItem,
  CurrencySnapshot,
  EnrichedHolding,
  EtfSummary,
  IndexSummary,
  MacroEventDay,
  MarketContext,
  NewsItem,
  TokenUnlockSummary,
} from "./types";
import type { BriefingRequest, HoldingInput } from "./schemas";

type ApiEnvelope<T> = {
  code: number;
  message?: string;
  data: T;
  details?: unknown;
};

type Paginated<T> = {
  list: T[];
  page?: number;
  page_size?: number;
  total?: number;
};

const ETF_SUPPORTED_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "LTC",
  "HBAR",
  "XRP",
  "DOGE",
  "LINK",
  "AVAX",
  "DOT",
]);

const ETF_SUPPORTED_SYMBOL_LIST = Array.from(ETF_SUPPORTED_SYMBOLS).join(", ");
const MAX_NEWS_ASSET_LOOKUPS = 2;
const MAX_ETF_SYMBOLS = 2;
const MAX_INDEX_CONSTITUENT_LOOKUPS = 3;
const MAX_INDEX_SNAPSHOTS = 2;
const MAX_TOKEN_UNLOCK_LOOKUPS = 2;

type IndexConstituent = {
  currency_id: string;
  symbol: string;
  weight: number;
};

type IndexMarketSnapshot = {
  price: number;
  "24h_change_pct"?: number;
  "7day_roi"?: number;
  "1month_roi"?: number;
  "3month_roi"?: number;
  "1year_roi"?: number;
  ytd?: number;
};

type TokenEconomics = {
  token_unlock?: {
    unlocked?: string;
    total_locked?: string;
  };
  unlock_timeline?: Array<{
    timestamp?: string;
    vestings?: Array<{
      label?: string;
      amount?: number;
    }>;
  }> | null;
};

let currencyCache:
  | {
      expiresAt: number;
      items: CurrencyListItem[];
    }
  | undefined;
let indexListCache:
  | {
      expiresAt: number;
      tickers: string[];
    }
  | undefined;
const indexConstituentCache = new Map<
  string,
  {
    expiresAt: number;
    constituents: IndexConstituent[];
  }
>();
const indexSnapshotCache = new Map<
  string,
  {
    expiresAt: number;
    snapshot: IndexMarketSnapshot;
  }
>();

function joinUrl(path: string) {
  return `${env.sosovalueBaseUrl.replace(/\/$/, "")}${path}`;
}

function unwrapSoso<T>(payload: T | ApiEnvelope<T>) {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    "data" in payload
  ) {
    const envelope = payload as ApiEnvelope<T>;

    if (envelope.code !== 0) {
      throw new Error(
        envelope.message ?? `SoSoValue request failed with code ${envelope.code}`,
      );
    }

    return envelope.data;
  }

  return payload as T;
}

async function sosoFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const apiKey = requireSecret(env.sosovalueApiKey, "SOSOVALUE_API_KEY");
  const url = new URL(joinUrl(path));

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  let response: Response | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "x-soso-api-key": apiKey,
      },
    });

    if (response.status !== 429) {
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000 * 2 ** attempt),
    );
  }

  if (!response) {
    throw new Error("SoSoValue request did not start.");
  }

  const raw = await response.text();
  const json = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String(json.message)
        : raw;
    throw new Error(`SoSoValue ${response.status}: ${message}`);
  }

  return unwrapSoso<T>(json as T | ApiEnvelope<T>);
}

async function getCurrencies() {
  if (currencyCache && currencyCache.expiresAt > Date.now()) {
    return currencyCache.items;
  }

  const items = await sosoFetch<CurrencyListItem[]>("/currencies");
  currencyCache = {
    expiresAt: Date.now() + 60_000,
    items,
  };

  return items;
}

async function resolveCurrencies(holdings: HoldingInput[]) {
  const currencies = await getCurrencies();
  const bySymbol = new Map(
    currencies.map((item) => [item.symbol.toUpperCase(), item]),
  );

  return holdings.map((holding) => ({
    holding,
    currency: bySymbol.get(holding.symbol),
  }));
}

async function getCurrencyInfo(currencyId: string) {
  try {
    return await sosoFetch<CurrencyInfo>(`/currencies/${currencyId}`);
  } catch {
    return undefined;
  }
}

async function getCurrencySnapshot(currencyId: string) {
  return sosoFetch<CurrencySnapshot>(
    `/currencies/${currencyId}/market-snapshot`,
  );
}

async function getTokenEconomics(currencyId: string) {
  return sosoFetch<TokenEconomics>(`/currencies/${currencyId}/token-economics`);
}

function aggregateHoldings(holdings: HoldingInput[]) {
  const bySymbol = new Map<string, HoldingInput>();

  holdings.forEach((holding) => {
    const current = bySymbol.get(holding.symbol);

    if (!current) {
      bySymbol.set(holding.symbol, holding);
      return;
    }

    const nextAmount = current.amount + holding.amount;
    const costBasis =
      current.costBasis !== undefined && holding.costBasis !== undefined
        ? (current.costBasis * current.amount +
            holding.costBasis * holding.amount) /
          nextAmount
        : current.costBasis ?? holding.costBasis;

    bySymbol.set(holding.symbol, {
      symbol: holding.symbol,
      amount: nextAmount,
      costBasis,
    });
  });

  return Array.from(bySymbol.values());
}

async function enrichHolding(
  holding: HoldingInput,
  currency: CurrencyListItem,
  index: number,
): Promise<EnrichedHolding> {
  if (index > 0) {
    await new Promise((resolve) => setTimeout(resolve, index * 120));
  }

  const [snapshot, info] = await Promise.all([
    getCurrencySnapshot(currency.currency_id),
    getCurrencyInfo(currency.currency_id),
  ]);
  const price = Number(snapshot.price ?? 0);
  const changePct24h = Number(snapshot.change_pct_24h ?? 0);
  const valueUsd = holding.amount * price;
  const previousValue =
    changePct24h <= -99.9 ? valueUsd : valueUsd / (1 + changePct24h / 100);
  const changeUsd24h = valueUsd - previousValue;

  return {
    symbol: holding.symbol,
    amount: holding.amount,
    costBasis: holding.costBasis,
    currencyId: currency.currency_id,
    name: info?.name ?? currency.name,
    icon: info?.icon,
    sectors: info?.sector?.map((sector) => sector.name).filter(Boolean) ?? [],
    price,
    changePct24h,
    valueUsd,
    changeUsd24h,
    marketcap: snapshot.marketcap,
    volume24h: snapshot.turnover_24h,
    rank: snapshot.marketcap_rank,
    dataSource: "sosovalue",
    sourceSymbol: currency.symbol,
  };
}

async function getAssetNews(currencyIds: string[]) {
  const startTime = Date.now() - 8 * 60 * 60 * 1000;
  const endTime = Date.now();

  const results = await Promise.allSettled(
    currencyIds.slice(0, MAX_NEWS_ASSET_LOOKUPS).map((currencyId) =>
      sosoFetch<Paginated<NewsItem>>("/news", {
        currency_id: currencyId,
        language: "en",
        page: 1,
        page_size: 8,
        start_time: startTime,
        end_time: endTime,
      }),
    ),
  );

  const news = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.list ?? [] : [],
  );

  if (news.length > 0) {
    return dedupeNews(news);
  }

  try {
    const globalNews = await sosoFetch<Paginated<NewsItem>>("/news", {
      language: "en",
      page: 1,
      page_size: 12,
      start_time: startTime,
      end_time: endTime,
    });

    return dedupeNews(globalNews.list ?? []);
  } catch {
    return [];
  }
}

function dedupeNews(news: NewsItem[]) {
  const seen = new Set<string>();

  return news
    .filter((item) => {
      const key = item.id || item.source_link || item.title;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.release_time ?? 0) - Number(a.release_time ?? 0))
    .slice(0, 12)
    .map((item) => ({
      ...item,
      title: stripHtml(item.title),
      content: truncate(stripHtml(item.content), 260),
    }));
}

async function getEtfSummaries(symbols: string[], warnings: string[]) {
  const etfSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.toUpperCase())
        .filter((symbol) => ETF_SUPPORTED_SYMBOLS.has(symbol)),
    ),
  )
    .slice(0, MAX_ETF_SYMBOLS);

  const responses = await Promise.allSettled(
    etfSymbols.map(async (symbol) => {
      const rows = await sosoFetch<Omit<EtfSummary, "symbol">[]>(
        "/etfs/summary-history",
        {
          symbol,
          country_code: "US",
          limit: 5,
        },
      );

      return rows.map((row) => ({ ...row, symbol }));
    }),
  );
  const failedSymbols = responses.flatMap((response, index) =>
    response.status === "rejected" ? [etfSymbols[index]] : [],
  );
  const rows = responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );

  if (failedSymbols.length > 0) {
    warnings.push(
      `ETF flow lookup failed for ${failedSymbols.join(
        ", ",
      )}. Supported ETF assets are ${ETF_SUPPORTED_SYMBOL_LIST}.`,
    );
  }

  return rows;
}

async function getIndexList() {
  if (indexListCache && indexListCache.expiresAt > Date.now()) {
    return indexListCache.tickers;
  }

  const rows = await sosoFetch<string[]>("/indices");
  const tickers = rows.filter(Boolean);
  indexListCache = {
    expiresAt: Date.now() + 60_000,
    tickers,
  };

  return tickers;
}

async function getIndexConstituents(ticker: string) {
  const cached = indexConstituentCache.get(ticker);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.constituents;
  }

  const constituents = await sosoFetch<IndexConstituent[]>(
    `/indices/${ticker}/constituents`,
  );
  indexConstituentCache.set(ticker, {
    expiresAt: Date.now() + 60_000,
    constituents,
  });

  return constituents;
}

async function getIndexMarketSnapshot(ticker: string) {
  const cached = indexSnapshotCache.get(ticker);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const snapshot = await sosoFetch<IndexMarketSnapshot>(
    `/indices/${ticker}/market-snapshot`,
  );
  indexSnapshotCache.set(ticker, {
    expiresAt: Date.now() + 30_000,
    snapshot,
  });

  return snapshot;
}

function ratioToPercent(value: number | undefined) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

async function getPortfolioIndexes(symbols: string[], warnings: string[]) {
  const heldSymbols = new Set(symbols.map((symbol) => symbol.toUpperCase()));

  if (heldSymbols.size === 0) {
    return [];
  }

  try {
    const indexTickers = (await getIndexList()).slice(
      0,
      MAX_INDEX_CONSTITUENT_LOOKUPS,
    );
    const matches: Array<{
      ticker: string;
      constituents: IndexConstituent[];
      matched: IndexConstituent[];
      matchedWeight: number;
    }> = [];
    let constituentFailures = 0;

    for (const ticker of indexTickers) {
      try {
        const constituents = (await getIndexConstituents(ticker)).map(
          (constituent) => ({
            ...constituent,
            symbol: constituent.symbol.toUpperCase(),
          }),
        );
        const matched = constituents.filter((constituent) =>
          heldSymbols.has(constituent.symbol),
        );

        if (matched.length === 0) {
          continue;
        }

        matches.push({
          ticker,
          constituents,
          matched,
          matchedWeight: matched.reduce(
            (sum, constituent) => sum + Number(constituent.weight ?? 0),
            0,
          ),
        });
      } catch {
        constituentFailures += 1;
      }
    }

    if (matches.length === 0 && constituentFailures > 0) {
      warnings.push(
        `${constituentFailures} SoSoValue Index constituent requests failed, so SSI index matching was omitted for this briefing.`,
      );
    }

    const topMatches = matches
      .sort((a, b) => b.matchedWeight - a.matchedWeight)
      .slice(0, MAX_INDEX_SNAPSHOTS);
    const snapshotResponses = await Promise.allSettled(
      topMatches.map(async (match) => ({
        ...match,
        snapshot: await getIndexMarketSnapshot(match.ticker),
      })),
    );

    return snapshotResponses.flatMap<IndexSummary>((response) => {
      if (response.status !== "fulfilled") {
        return [];
      }

      const { snapshot, matched, constituents, ticker, matchedWeight } =
        response.value;

      return [
        {
          ticker,
          price: Number(snapshot.price ?? 0),
          changePct24h: ratioToPercent(snapshot["24h_change_pct"]),
          roi7d: ratioToPercent(snapshot["7day_roi"]),
          roi1m: ratioToPercent(snapshot["1month_roi"]),
          roi3m: ratioToPercent(snapshot["3month_roi"]),
          roi1y: ratioToPercent(snapshot["1year_roi"]),
          ytd: ratioToPercent(snapshot.ytd),
          matchedSymbols: matched.map((constituent) => constituent.symbol),
          matchedWeight,
          constituents: constituents
            .sort((a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0))
            .slice(0, 6)
            .map((constituent) => ({
              symbol: constituent.symbol,
              weight: Number(constituent.weight ?? 0),
            })),
        },
      ];
    });
  } catch (error) {
    warnings.push(
      `SoSoValue Index data is unavailable right now: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return [];
  }
}

async function getTokenUnlocks(
  holdings: EnrichedHolding[],
  warnings: string[],
) {
  const sourceHoldings = holdings
    .filter((holding) => holding.dataSource === "sosovalue")
    .slice(0, MAX_TOKEN_UNLOCK_LOOKUPS);

  if (sourceHoldings.length === 0) {
    return [];
  }

  const now = Date.now();
  const responses = await Promise.allSettled(
    sourceHoldings.map(async (holding) => ({
      holding,
      economics: await getTokenEconomics(holding.currencyId),
    })),
  );
  const failures = responses.filter(
    (response) => response.status === "rejected",
  ).length;
  const summaries = responses.flatMap<TokenUnlockSummary>((response) => {
    if (response.status !== "fulfilled") {
      return [];
    }

    const { holding, economics } = response.value;
    const nextUnlocks = (economics.unlock_timeline ?? [])
      .flatMap((entry) => {
        const timestamp = Number(entry.timestamp ?? 0);

        if (!Number.isFinite(timestamp) || timestamp <= now) {
          return [];
        }

        return (entry.vestings ?? []).map((vesting) => ({
          symbol: holding.symbol,
          label: vesting.label || "Scheduled unlock",
          amount: Number(vesting.amount ?? 0),
          unlockAt: new Date(timestamp).toISOString(),
          daysUntil: Math.ceil((timestamp - now) / (24 * 60 * 60 * 1000)),
        }));
      })
      .filter((event) => Number.isFinite(event.amount) && event.amount > 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 4);

    if (
      !economics.token_unlock?.unlocked &&
      !economics.token_unlock?.total_locked &&
      nextUnlocks.length === 0
    ) {
      return [];
    }

    return [
      {
        symbol: holding.symbol,
        unlocked: Number(economics.token_unlock?.unlocked ?? 0),
        totalLocked: Number(economics.token_unlock?.total_locked ?? 0),
        nextUnlocks,
      },
    ];
  });

  if (summaries.length === 0 && failures > 0) {
    warnings.push("Token unlock data is unavailable for this portfolio right now.");
  }

  return summaries;
}

async function getMacroEvents() {
  try {
    const rows = await sosoFetch<MacroEventDay[]>("/macro/events");
    const today = new Date();
    const horizon = addDays(today, 7);

    return rows
      .filter((row) => {
        const date = parseISO(row.date);
        return (
          (isAfter(date, today) || row.date === today.toISOString().slice(0, 10)) &&
          isBefore(date, horizon)
        );
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function buildMarketContext(
  request: BriefingRequest,
): Promise<MarketContext> {
  const warnings: string[] = [];
  const aggregated = aggregateHoldings(request.holdings);
  const resolved = await resolveCurrencies(aggregated);
  const matchedItems = resolved.filter(
    (item): item is { holding: HoldingInput; currency: CurrencyListItem } =>
      Boolean(item.currency),
  );
  const missingSymbols = resolved
    .filter((item) => !item.currency)
    .map((item) => item.holding.symbol);
  const holdingsNeedingFallback = resolved
    .filter((item) => !item.currency)
    .map((item) => item.holding);

  if (missingSymbols.length > 0) {
    warnings.push(
      `SoSoValue does not list: ${missingSymbols.join(
        ", ",
      )}. SoDEX fallback will be attempted for those assets.`,
    );
  }

  const enrichedResponses = await Promise.allSettled(
    matchedItems.map((item, index) =>
      enrichHolding(item.holding, item.currency, index),
    ),
  );

  const holdings = enrichedResponses.flatMap<EnrichedHolding>((response, index) => {
    if (response.status === "fulfilled") {
      return [response.value];
    }

    const failedHolding = matchedItems[index]?.holding;

    if (failedHolding) {
      holdingsNeedingFallback.push(failedHolding);
    }

    warnings.push(
      `${
        failedHolding?.symbol ?? "A holding"
      } could not be loaded from SoSoValue: ${
        response.reason?.message ?? "unknown error"
      }. SoDEX fallback will be attempted.`,
    );
    return [];
  });

  const sodexTickers = await getSodexSpotTickers().catch((error) => {
    warnings.push(
      `SoDEX spot market feed is unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return [];
  });

  if (holdingsNeedingFallback.length > 0) {
    const fallback = buildSodexFallbackHoldings(
      holdingsNeedingFallback,
      sodexTickers,
    );
    const unpriced = fallback.missingSymbols.flatMap((symbol) => {
      const holding = holdingsNeedingFallback.find((item) => item.symbol === symbol);

      return holding
        ? [
            createUnpricedHolding(
              holding,
              "No SoSoValue listing or SoDEX spot market",
            ),
          ]
        : [];
    });

    holdings.push(...fallback.holdings, ...unpriced);

    if (fallback.holdings.length > 0) {
      warnings.push(
        `SoDEX supplied fallback prices for: ${fallback.holdings
          .map((holding) => holding.symbol)
          .join(", ")}.`,
      );
    }

    if (fallback.missingSymbols.length > 0) {
      warnings.push(
        `No live price source matched: ${fallback.missingSymbols.join(
          ", ",
        )}. These assets are retained as unpriced holdings instead of blocking the briefing.`,
      );
    }
  }

  const requestedSymbols = aggregated.map((holding) => holding.symbol);
  const etfUnsupportedSymbols = requestedSymbols.filter(
    (symbol) => !ETF_SUPPORTED_SYMBOLS.has(symbol),
  );
  const sodexActions = buildSodexActions(aggregated, sodexTickers);
  const sodexActionSymbols = new Set(
    sodexActions.map((action) => action.symbol.toUpperCase()),
  );
  const sodexUnsupportedSymbols = requestedSymbols.filter(
    (symbol) => !sodexActionSymbols.has(symbol),
  );

  if (etfUnsupportedSymbols.length > 0) {
    warnings.push(
      `ETF flow coverage is limited to ${ETF_SUPPORTED_SYMBOL_LIST}; no ETF flow data is requested for ${etfUnsupportedSymbols.join(
        ", ",
      )}.`,
    );
  }

  if (sodexUnsupportedSymbols.length > 0) {
    warnings.push(
      `SoDEX spot action path is unavailable for: ${sodexUnsupportedSymbols.join(
        ", ",
      )}.`,
    );
  }

  const [news, etfs, indexes, unlocks, macroEvents] = await Promise.all([
    getAssetNews(
      holdings
        .filter((holding) => holding.dataSource === "sosovalue")
        .map((holding) => holding.currencyId),
    ),
    getEtfSummaries(
      holdings.map((holding) => holding.symbol),
      warnings,
    ),
    getPortfolioIndexes(holdings.map((holding) => holding.symbol), warnings),
    getTokenUnlocks(holdings, warnings),
    getMacroEvents(),
  ]);

  const valueUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0);
  const changeUsd24h = holdings.reduce(
    (sum, holding) => sum + holding.changeUsd24h,
    0,
  );
  const previousValue = valueUsd - changeUsd24h;
  const changePct24h =
    previousValue === 0 ? 0 : (changeUsd24h / previousValue) * 100;

  return {
    generatedAt: new Date().toISOString(),
    request,
    portfolio: {
      valueUsd,
      changeUsd24h,
      changePct24h,
      holdings: holdings.sort((a, b) => b.valueUsd - a.valueUsd),
    },
    news,
    etfs,
    indexes,
    sodexActions,
    unlocks,
    macroEvents,
    warnings,
    sources: [
      {
        label: "SoSoValue OpenAPI",
        url: "https://sosovalue-1.gitbook.io/sosovalue-api-doc",
      },
      {
        label: "SoSoValue Indexes",
        url: "https://ssi.sosovalue.com/en/assets",
      },
      {
        label: "SoDEX REST API",
        url: "https://sodex.com/documentation/api/rest-v1",
      },
    ],
  };
}

export async function checkSosoHealth() {
  if (!env.sosovalueApiKey) {
    return {
      configured: false,
      mode: "missing",
    };
  }

  const [currencies, indexes] = await Promise.all([getCurrencies(), getIndexList()]);

  return {
    configured: true,
    mode: "live",
    currencyCount: currencies.length,
    indexCount: indexes.length,
  };
}
