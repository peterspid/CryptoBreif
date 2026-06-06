import { env } from "./env";
import type {
  BriefingRequest,
  HoldingInput,
  SodexOrderPreviewRequest,
} from "./schemas";
import type {
  EnrichedHolding,
  MarketContext,
  SodexAction,
  SodexImportedHolding,
  SodexOrderPreview,
} from "./types";

export type SodexTicker = {
  symbol: string;
  lastPx?: string;
  lastPrice?: string;
  changePct?: number;
  priceChangePercent?: string;
  volume?: string;
  quoteVolume?: string;
  highPrice?: string;
  highPx?: string;
  lowPrice?: string;
  lowPx?: string;
  bidPx?: string;
  askPx?: string;
};

type SodexEnvelope<T> = {
  code: number;
  data: T;
  error?: string;
  timestamp?: number;
};

type SpotBalance = {
  coin?: string;
  asset?: string;
  symbol?: string;
  a?: string;
  total?: string;
  available?: string;
  free?: string;
  balance?: string;
  t?: string;
  locked?: string;
  l?: string;
};

type SpotAccountBalances = {
  data?: SpotBalance[];
  balances?: Array<{
    coin?: string;
    asset?: string;
    symbol?: string;
    a?: string;
    total?: string;
    available?: string;
    free?: string;
    balance?: string;
    t?: string;
    locked?: string;
    l?: string;
  }>;
};

let tickerCache:
  | {
      expiresAt: number;
      tickers: SodexTicker[];
    }
  | undefined;

function unwrap<T>(payload: T | SodexEnvelope<T>) {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    "data" in payload
  ) {
    const envelope = payload as SodexEnvelope<T>;

    if (envelope.code !== 0) {
      throw new Error(envelope.error ?? `SoDEX returned code ${envelope.code}`);
    }

    return envelope.data;
  }

  return payload as T;
}

function normalizeTicker(ticker: SodexTicker): SodexTicker {
  return {
    ...ticker,
    lastPrice: ticker.lastPrice ?? ticker.lastPx,
    priceChangePercent:
      ticker.priceChangePercent ?? String(ticker.changePct ?? 0),
    highPrice: ticker.highPrice ?? ticker.highPx,
    lowPrice: ticker.lowPrice ?? ticker.lowPx,
  };
}

function normalizeBaseSymbol(symbol: string) {
  const [base] = symbol.split("_");

  return base.replace(/^v/i, "").toUpperCase();
}

function normalizeCoin(coin: string) {
  return coin.replace(/^v/i, "").toUpperCase();
}

function buildTickerLookup(tickers: SodexTicker[]) {
  return new Map(
    tickers.map((ticker) => [normalizeBaseSymbol(ticker.symbol), ticker]),
  );
}

function numeric(value: string | number | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function createUnpricedHolding(
  holding: HoldingInput,
  reason = "No live price source",
): EnrichedHolding {
  return {
    symbol: holding.symbol,
    amount: holding.amount,
    costBasis: holding.costBasis,
    currencyId: holding.symbol,
    name: holding.symbol,
    sectors: [reason],
    price: 0,
    changePct24h: 0,
    valueUsd: 0,
    changeUsd24h: 0,
    dataSource: "unpriced",
  };
}

export function buildSodexHolding(
  holding: HoldingInput,
  ticker: SodexTicker,
): EnrichedHolding {
  const price = numeric(ticker.lastPrice ?? ticker.lastPx);
  const changePct24h = numeric(ticker.priceChangePercent ?? ticker.changePct);
  const valueUsd = holding.amount * price;
  const previousValue =
    changePct24h <= -99.9 ? valueUsd : valueUsd / (1 + changePct24h / 100);

  return {
    symbol: holding.symbol,
    amount: holding.amount,
    costBasis: holding.costBasis,
    currencyId: ticker.symbol,
    name: `${holding.symbol} on SoDEX`,
    sectors: ["SoDEX spot market"],
    price,
    changePct24h,
    valueUsd,
    changeUsd24h: valueUsd - previousValue,
    volume24h: numeric(ticker.quoteVolume ?? ticker.volume),
    dataSource: "sodex",
    sourceSymbol: ticker.symbol,
  };
}

export function buildSodexActions(
  holdings: HoldingInput[],
  tickers: SodexTicker[],
): SodexAction[] {
  const bySymbol = buildTickerLookup(tickers);

  return holdings.flatMap((holding) => {
    const ticker = bySymbol.get(holding.symbol.toUpperCase());

    if (!ticker) {
      return [];
    }

    return [
      {
        symbol: holding.symbol,
        marketSymbol: ticker.symbol,
        lastPrice: numeric(ticker.lastPrice ?? ticker.lastPx),
        changePct24h: numeric(ticker.priceChangePercent ?? ticker.changePct),
        quoteVolume: numeric(ticker.quoteVolume ?? ticker.volume),
        actionUrl: env.sodexAppUrl,
        status: "unsigned" as const,
        note: "Market is available. Signed SoDEX order flow is required before execution.",
      },
    ];
  });
}

export function buildSodexOrderPreview(
  request: SodexOrderPreviewRequest,
  tickers: SodexTicker[],
): SodexOrderPreview {
  const bySymbol = buildTickerLookup(tickers);
  const ticker = bySymbol.get(request.symbol);

  if (!ticker) {
    throw new Error(`No SoDEX spot market matched ${request.symbol}.`);
  }

  const lastPrice = numeric(ticker.lastPrice ?? ticker.lastPx);
  const executionPrice =
    request.type === "LIMIT" ? Number(request.limitPrice) : lastPrice;
  const estimatedNotionalUsd =
    request.funds ?? Number(request.quantity ?? 0) * executionPrice;
  const slippageRatio = request.slippagePct / 100;
  const clOrdID = `cb-${Date.now().toString(36)}-${request.symbol}`.slice(0, 36);

  return {
    symbol: request.symbol,
    marketSymbol: ticker.symbol,
    side: request.side,
    type: request.type,
    quantity: request.quantity,
    funds: request.funds,
    limitPrice: request.limitPrice,
    estimatedNotionalUsd,
    slippagePct: request.slippagePct,
    priceProtection: {
      maxBuyPrice:
        request.side === "BUY"
          ? Number((executionPrice * (1 + slippageRatio)).toFixed(8))
          : undefined,
      minSellPrice:
        request.side === "SELL"
          ? Number((executionPrice * (1 - slippageRatio)).toFixed(8))
          : undefined,
    },
    timeInForce: request.type === "MARKET" ? "IOC" : "GTC",
    clOrdID,
    requiresSignature: true,
    endpoint: `${env.sodexSpotBaseUrl.replace(/\/$/, "")}/trade/orders/batch`,
    headersRequired: ["Content-Type", "Accept", "X-API-Sign", "X-API-Nonce"],
    warnings: [
      "Preview only. SoDEX order placement requires an EIP-712 signature.",
      "No private key is collected or sent by CryptoBrief.",
    ],
  };
}

export function buildSodexFallbackHoldings(
  holdings: HoldingInput[],
  tickers: SodexTicker[],
) {
  const bySymbol = buildTickerLookup(tickers);
  const missingSymbols: string[] = [];
  const fallbackHoldings = holdings.flatMap((holding) => {
    const ticker = bySymbol.get(holding.symbol.toUpperCase());

    if (!ticker) {
      missingSymbols.push(holding.symbol);
      return [];
    }

    return [buildSodexHolding(holding, ticker)];
  });

  return {
    holdings: fallbackHoldings,
    missingSymbols,
  };
}

export async function getSodexSpotTickers(symbol?: string) {
  if (!symbol && tickerCache && tickerCache.expiresAt > Date.now()) {
    return tickerCache.tickers;
  }

  const url = new URL(
    `${env.sodexSpotBaseUrl.replace(/\/$/, "")}/markets/tickers`,
  );

  if (symbol) {
    url.searchParams.set("symbol", symbol);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : raw;
    throw new Error(`SoDEX ${response.status}: ${message}`);
  }

  const tickers = unwrap<SodexTicker[]>(payload).map(normalizeTicker);

  if (!symbol) {
    tickerCache = {
      expiresAt: Date.now() + 30_000,
      tickers,
    };
  }

  return tickers;
}

export async function getSodexSpotBalances(
  address: string,
  accountId?: number,
): Promise<SodexImportedHolding[]> {
  const url = new URL(
    `${env.sodexSpotBaseUrl.replace(/\/$/, "")}/accounts/${address}/balances`,
  );

  if (accountId !== undefined) {
    url.searchParams.set("accountID", String(accountId));
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : raw;
    throw new Error(`SoDEX ${response.status}: ${message}`);
  }

  const data = unwrap<SpotAccountBalances | SpotBalance[]>(payload);
  const balances = Array.isArray(data) ? data : data.balances ?? data.data ?? [];

  return balances
    .map((balance) => {
      const sourceCoin =
        balance.coin ?? balance.asset ?? balance.symbol ?? balance.a ?? "";
      const amount = numeric(
        balance.total ?? balance.available ?? balance.free ?? balance.balance ?? balance.t,
      );
      const locked = numeric(balance.locked ?? balance.l);

      return {
        symbol: normalizeCoin(sourceCoin),
        amount,
        locked,
        sourceCoin,
      };
    })
    .filter((holding) => holding.symbol && holding.amount > 0);
}

export async function getSodexHealth() {
  const tickers = await getSodexSpotTickers();

  return {
    configured: true,
    marketCount: tickers.length,
    sample: tickers.slice(0, 5),
  };
}

export async function buildSodexFallbackContext(
  request: BriefingRequest,
  reason: string,
): Promise<MarketContext> {
  const warnings = [
    `SoSoValue context was unavailable, so this briefing used SoDEX spot market fallback where possible. Original error: ${reason}`,
  ];
  const tickers = await getSodexSpotTickers().catch((error) => {
    warnings.push(
      `SoDEX fallback market feed was unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return [];
  });
  const fallback = buildSodexFallbackHoldings(request.holdings, tickers);
  const unpriced = fallback.missingSymbols.map((symbol) => {
    const holding = request.holdings.find((item) => item.symbol === symbol);

    return holding
      ? createUnpricedHolding(holding, "No SoSoValue or SoDEX price match")
      : undefined;
  });
  const holdings = [...fallback.holdings, ...unpriced].filter(
    (holding): holding is EnrichedHolding => Boolean(holding),
  );

  if (fallback.missingSymbols.length > 0) {
    warnings.push(
      `No SoDEX spot market matched: ${fallback.missingSymbols.join(
        ", ",
      )}. These assets are kept in the briefing as unpriced holdings.`,
    );
  }

  const valueUsd = holdings.reduce((sum, holding) => sum + holding.valueUsd, 0);
  const changeUsd24h = holdings.reduce(
    (sum, holding) => sum + holding.changeUsd24h,
    0,
  );
  const previousValue = valueUsd - changeUsd24h;

  return {
    generatedAt: new Date().toISOString(),
    request,
    portfolio: {
      valueUsd,
      changeUsd24h,
      changePct24h:
        previousValue === 0 ? 0 : (changeUsd24h / previousValue) * 100,
      holdings: holdings.sort((a, b) => b.valueUsd - a.valueUsd),
    },
    news: [],
    etfs: [],
    indexes: [],
    sodexActions: buildSodexActions(request.holdings, tickers),
    unlocks: [],
    macroEvents: [],
    warnings,
    sources: [
      {
        label: "SoDEX REST API",
        url: "https://sodex.com/documentation/api/rest-v1",
      },
    ],
  };
}
