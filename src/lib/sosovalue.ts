import { addDays, isAfter, isBefore, parseISO } from "date-fns";
import { env, requireSecret } from "./env";
import { stripHtml, truncate } from "./format";
import type {
  CurrencyInfo,
  CurrencyListItem,
  CurrencySnapshot,
  EnrichedHolding,
  EtfSummary,
  MacroEventDay,
  MarketContext,
  NewsItem,
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

let currencyCache:
  | {
      expiresAt: number;
      items: CurrencyListItem[];
    }
  | undefined;

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
  };
}

async function getAssetNews(currencyIds: string[]) {
  const startTime = Date.now() - 8 * 60 * 60 * 1000;
  const endTime = Date.now();

  const results = await Promise.allSettled(
    currencyIds.slice(0, 8).map((currencyId) =>
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

async function getEtfSummaries(symbols: string[]) {
  const etfSymbols = symbols
    .map((symbol) => symbol.toUpperCase())
    .filter((symbol) => ETF_SUPPORTED_SYMBOLS.has(symbol))
    .slice(0, 4);

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

  return responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );
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
  const missingSymbols = resolved
    .filter((item) => !item.currency)
    .map((item) => item.holding.symbol);

  if (missingSymbols.length > 0) {
    warnings.push(
      `SoSoValue does not list: ${missingSymbols.join(", ")}. Those assets were skipped.`,
    );
  }

  const enrichedResponses = await Promise.allSettled(
    resolved
      .filter(
        (item): item is { holding: HoldingInput; currency: CurrencyListItem } =>
          Boolean(item.currency),
      )
      .map((item, index) => enrichHolding(item.holding, item.currency, index)),
  );

  const holdings = enrichedResponses.flatMap((response) => {
    if (response.status === "fulfilled") {
      return [response.value];
    }

    warnings.push(response.reason?.message ?? "A holding could not be loaded.");
    return [];
  });

  if (holdings.length === 0) {
    throw new Error("No portfolio assets could be loaded from SoSoValue.");
  }

  const [news, etfs, macroEvents] = await Promise.all([
    getAssetNews(holdings.map((holding) => holding.currencyId)),
    getEtfSummaries(holdings.map((holding) => holding.symbol)),
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
    macroEvents,
    warnings,
    sources: [
      {
        label: "SoSoValue OpenAPI",
        url: "https://sosovalue-1.gitbook.io/sosovalue-api-doc",
      },
      {
        label: "SoDEX REST API",
        url: "https://sodex.com/documentation/api/rest-v1",
      },
    ],
  };
}

export async function checkSosoHealth() {
  return {
    configured: Boolean(env.sosovalueApiKey),
    mode: "configured",
  };
}
