import { env } from "./env";
import type { BriefingRequest } from "./schemas";
import type { EnrichedHolding, MarketContext } from "./types";

export type SodexTicker = {
  symbol: string;
  lastPx?: string;
  lastPrice?: string;
  changePct?: number;
  priceChangePercent?: string;
  volume?: string;
  quoteVolume?: string;
  highPrice?: string;
  lowPrice?: string;
};

type SodexEnvelope<T> = {
  code: number;
  data: T;
  error?: string;
  timestamp?: number;
};

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

export async function getSodexSpotTickers(symbol?: string) {
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

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`SoDEX ${response.status}`);
  }

  return unwrap<SodexTicker[]>(payload)
    .map((ticker) => ({
      ...ticker,
      lastPrice: ticker.lastPrice ?? ticker.lastPx,
      priceChangePercent:
        ticker.priceChangePercent ?? String(ticker.changePct ?? 0),
    }))
    .slice(0, 20);
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
  const tickers = await getSodexSpotTickers();
  const bySymbol = new Map(
    tickers.map((ticker) => [
      ticker.symbol.replace(/^v/i, "").replace(/_vUSDC$/i, "").toUpperCase(),
      ticker,
    ]),
  );

  const holdings = request.holdings.flatMap<EnrichedHolding>((holding) => {
    const ticker = bySymbol.get(holding.symbol.toUpperCase());

    if (!ticker) {
      return [];
    }

    const price = Number(ticker.lastPrice ?? ticker.lastPx ?? 0);
    const changePct24h = Number(ticker.priceChangePercent ?? ticker.changePct ?? 0);
    const valueUsd = holding.amount * price;
    const previousValue =
      changePct24h <= -99.9 ? valueUsd : valueUsd / (1 + changePct24h / 100);

    return [
      {
        symbol: holding.symbol,
        amount: holding.amount,
        costBasis: holding.costBasis,
        currencyId: ticker.symbol,
        name: holding.symbol,
        sectors: ["SoDEX market"],
        price,
        changePct24h,
        valueUsd,
        changeUsd24h: valueUsd - previousValue,
        volume24h: Number(ticker.quoteVolume ?? ticker.volume ?? 0),
      },
    ];
  });

  if (holdings.length === 0) {
    throw new Error(reason);
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
    macroEvents: [],
    warnings: [
      `SoSoValue is currently rate-limited, so this briefing used real SoDEX testnet market prices for supported assets. Original error: ${reason}`,
    ],
    sources: [
      {
        label: "SoDEX REST API",
        url: "https://sodex.com/documentation/api/rest-v1",
      },
    ],
  };
}
