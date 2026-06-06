"use client";

import Image from "next/image";
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type HoldingForm = {
  symbol: string;
  amount: string;
  costBasis: string;
};

type DeliverySettings = {
  morning: boolean;
  evening: boolean;
  telegram: boolean;
  email: boolean;
  emailTo: string;
};

type OrderForm = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  funds: string;
  limitPrice: string;
  slippagePct: string;
};

type BriefingResponse = {
  ok: boolean;
  briefing: {
    headline: string;
    text: string;
    portfolioLine: string;
    watch: string;
    brightSpot: string;
    suggestion: string;
    dataQuality: "live" | "partial" | "fallback";
    aiStatus: "generated" | "fallback" | "not_configured";
  };
  context: {
    generatedAt: string;
    portfolio: {
      valueUsd: number;
      changeUsd24h: number;
      changePct24h: number;
      holdings: Array<{
        symbol: string;
        name: string;
        amount: number;
        price: number;
        changePct24h: number;
        valueUsd: number;
        changeUsd24h: number;
        icon?: string;
        sectors: string[];
        dataSource: "sosovalue" | "sodex" | "unpriced";
        sourceSymbol?: string;
      }>;
    };
    news: Array<{
      id: string;
      title: string;
      content?: string;
      release_time: number;
      source_link?: string;
      original_link?: string;
      feature_image?: string;
      matched_currencies?: Array<{ name: string }>;
    }>;
    etfs: Array<{
      date: string;
      symbol: string;
      total_net_inflow: number;
      total_value_traded?: number;
      total_net_assets?: number;
    }>;
    indexes: Array<{
      ticker: string;
      price: number;
      changePct24h: number;
      roi7d?: number;
      ytd?: number;
      matchedSymbols: string[];
      matchedWeight: number;
      constituents: Array<{ symbol: string; weight: number }>;
    }>;
    sodexActions: Array<{
      symbol: string;
      marketSymbol: string;
      lastPrice: number;
      changePct24h: number;
      quoteVolume: number;
      actionUrl: string;
      status: "ready" | "unsigned";
      note: string;
    }>;
    unlocks: Array<{
      symbol: string;
      unlocked?: number;
      totalLocked?: number;
      nextUnlocks: Array<{
        symbol: string;
        label: string;
        amount: number;
        unlockAt: string;
        daysUntil: number;
      }>;
    }>;
    macroEvents: Array<{ date: string; events: string[] }>;
    warnings: string[];
  };
};

type HistoryItem = {
  id: string;
  headline: string;
  text: string;
  generatedAt: string;
  valueUsd: number;
  dataQuality: BriefingResponse["briefing"]["dataQuality"];
  response?: BriefingResponse;
};

type HealthResponse = {
  services?: Record<
    string,
    {
      ok?: boolean;
      configured?: boolean;
      model?: string;
      error?: string;
      indexCount?: number;
      marketCount?: number;
      botUsername?: string;
    }
  >;
};

type SodexTicker = {
  symbol: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};

type ImportedHolding = {
  symbol: string;
  amount: number;
  locked: number;
  sourceCoin: string;
};

type OrderPreview = {
  symbol: string;
  marketSymbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  estimatedNotionalUsd: number;
  slippagePct: number;
  clOrdID: string;
  requiresSignature: true;
  endpoint: string;
  warnings: string[];
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const defaultHoldings: HoldingForm[] = [
  { symbol: "BTC", amount: "0.05", costBasis: "" },
  { symbol: "ETH", amount: "1.2", costBasis: "" },
  { symbol: "SOL", amount: "18", costBasis: "" },
];

const defaultDeliverySettings: DeliverySettings = {
  morning: true,
  evening: false,
  telegram: false,
  email: false,
  emailTo: "",
};

const defaultOrderForm: OrderForm = {
  symbol: "BTC",
  side: "BUY",
  type: "MARKET",
  quantity: "",
  funds: "100",
  limitPrice: "",
  slippagePct: "0.75",
};

const followUpPrompts = [
  "What changed my risk score?",
  "Which unlock matters most?",
  "What should I do on SoDEX?",
  "Any ETF flow warning?",
];

const serviceNames: Record<string, string> = {
  sosovalue: "SoSoValue",
  ssi: "SSI",
  openai: "OpenAI",
  telegram: "Telegram",
  email: "Email",
  sodex: "SoDEX",
};

const sodexAppUrl =
  process.env.NEXT_PUBLIC_SODEX_APP_URL || "https://sodex.com";

function formatMoney(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? moneyFormatter.format(parsed) : "n/a";
}

function formatPercent(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return "n/a";
  }

  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function serviceLabel(value?: { ok?: boolean; configured?: boolean }) {
  if (!value?.configured && value?.ok === false) {
    return "Missing";
  }

  if (value?.ok || value?.configured) {
    return value.ok === false ? "Check" : "Live";
  }

  return "Ready";
}

function cleanBriefingLine(line: string) {
  return line
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^---+$/, "")
    .trim();
}

function holdingSourceLabel(source: "sosovalue" | "sodex" | "unpriced") {
  if (source === "sosovalue") {
    return "SoSoValue";
  }

  if (source === "sodex") {
    return "SoDEX";
  }

  return "Unpriced";
}

function asHistoryItem(response: BriefingResponse): HistoryItem {
  return {
    id: response.context.generatedAt,
    headline: response.briefing.headline,
    text: response.briefing.text,
    generatedAt: response.context.generatedAt,
    valueUsd: response.context.portfolio.valueUsd,
    dataQuality: response.briefing.dataQuality,
    response,
  };
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked in private browsing or locked-down webviews.
  }
}

export function CryptoBriefApp() {
  const [holdings, setHoldings] = useState<HoldingForm[]>(defaultHoldings);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [riskTolerance, setRiskTolerance] = useState<
    "conservative" | "balanced" | "aggressive"
  >("balanced");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(
    defaultDeliverySettings,
  );
  const [walletAddress, setWalletAddress] = useState("");
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sodexTickers, setSodexTickers] = useState<SodexTicker[]>([]);
  const [orderForm, setOrderForm] = useState<OrderForm>(defaultOrderForm);
  const [orderPreview, setOrderPreview] = useState<OrderPreview | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta",
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeliverySettings(
        readStoredJson("cryptobrief-delivery", defaultDeliverySettings),
      );
      setHistory(readStoredJson("cryptobrief-history", []));
      setHoldings(readStoredJson("cryptobrief-holdings", defaultHoldings));
      setStorageReady(true);
    }, 0);
    refreshHealth();

    fetch("/api/sodex/markets")
      .then((response) => response.json())
      .then((payload) => setSodexTickers(payload.tickers ?? []))
      .catch(() => setSodexTickers([]));

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (storageReady) {
      writeStoredJson("cryptobrief-holdings", holdings);
    }
  }, [holdings, storageReady]);

  const payload = {
    holdings: holdings
      .filter((holding) => holding.symbol.trim() && holding.amount.trim())
      .map((holding) => ({
        symbol: holding.symbol,
        amount: holding.amount,
        costBasis: holding.costBasis,
      })),
    deliveryTime,
    timezone,
    telegramChatId,
    riskTolerance,
    interests: ["etf", "news", "macro", "sodex", "unlock"] as const,
  };

  async function refreshHealth() {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }

  function persistHistory(nextBriefing: BriefingResponse) {
    const item = asHistoryItem(nextBriefing);

    setHistory((current) => {
      const next = [
        item,
        ...current.filter((entry) => entry.id !== item.id),
      ].slice(0, 10);

      writeStoredJson("cryptobrief-history", next);
      return next;
    });
  }

  async function generateBriefing(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setStatus("Fetching live SoSoValue, SSI, and SoDEX data...");
    setAnswer("");
    setLastQuestion("");

    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as BriefingResponse & { error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Briefing failed");
      }

      setBriefing(data);
      persistHistory(data);
      setStatus("Briefing generated and saved to history.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Briefing failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendDelivery() {
    if (!briefing?.briefing.text) {
      setStatus("Generate a briefing first.");
      return;
    }

    if (!deliverySettings.telegram && !deliverySettings.email) {
      setStatus("Choose Telegram, email, or both before sending.");
      return;
    }

    setLoading(true);
    setStatus("Sending configured delivery channels...");

    try {
      const response = await fetch("/api/delivery/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: briefing.briefing.text,
          subject: briefing.briefing.headline,
          telegramChatId,
          emailTo: deliverySettings.emailTo,
          channels: {
            telegram: deliverySettings.telegram,
            email: deliverySettings.email,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        const failed =
          data.results
            ?.filter((result: { ok: boolean }) => !result.ok)
            .map((result: { channel: string; error?: string }) =>
              `${result.channel}: ${result.error}`,
            )
            .join("; ") ?? data.error;
        throw new Error(failed ?? "Delivery failed");
      }

      setStatus("Delivery sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delivery failed");
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    const wallet = (
      window as Window & {
        ethereum?: { request: (args: { method: string }) => Promise<string[]> };
      }
    ).ethereum;

    if (!wallet) {
      setStatus("No browser wallet was detected.");
      return;
    }

    try {
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0] ?? "");
      setStatus("Wallet connected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connect failed");
    }
  }

  async function importWallet() {
    if (!walletAddress.trim()) {
      setStatus("Enter or connect a wallet first.");
      return;
    }

    setLoading(true);
    setStatus("Importing SoDEX spot balances...");

    try {
      const response = await fetch("/api/sodex/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        holdings?: ImportedHolding[];
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Wallet import failed");
      }

      if (!data.holdings?.length) {
        setStatus("No non-zero SoDEX balances found for this wallet.");
        return;
      }

      setHoldings(
        data.holdings.map((holding) => ({
          symbol: holding.symbol,
          amount: String(holding.amount),
          costBasis: "",
        })),
      );
      setStatus("Wallet balances imported.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet import failed");
    } finally {
      setLoading(false);
    }
  }

  async function previewSodexOrder(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setOrderPreview(null);
    setStatus("Building SoDEX signed-order preview...");

    try {
      const response = await fetch("/api/sodex/order-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderForm),
      });
      const data = (await response.json()) as {
        ok: boolean;
        preview?: OrderPreview;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.preview) {
        throw new Error(data.error ?? "Order preview failed");
      }

      setOrderPreview(data.preview);
      setStatus("SoDEX preview is ready for wallet signing.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Order preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function askFollowUp(event: FormEvent) {
    event.preventDefault();

    if (!question.trim()) {
      return;
    }

    setLoading(true);
    setStatus("Asking the briefing assistant...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          previousBriefing: briefing?.briefing.text,
          portfolio: payload,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Follow-up failed");
      }

      setAnswer(data.answer);
      setStatus("Follow-up answered with fresh context.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Follow-up failed");
    } finally {
      setLoading(false);
    }
  }

  function updateHolding(index: number, patch: Partial<HoldingForm>) {
    setHoldings((current) =>
      current.map((holding, itemIndex) =>
        itemIndex === index ? { ...holding, ...patch } : holding,
      ),
    );
  }

  function removeHolding(index: number) {
    setHoldings((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addHolding() {
    setHoldings((current) => [
      ...current,
      { symbol: "", amount: "", costBasis: "" },
    ]);
  }

  function saveDeliverySettings() {
    writeStoredJson("cryptobrief-delivery", deliverySettings);
    setStatus("Notification controls saved locally. Server cron uses env settings.");
  }

  function restoreHistoryItem(item: HistoryItem) {
    if (item.response) {
      setBriefing(item.response);
      setStatus("History item loaded.");
      return;
    }

    setBriefing({
      ok: true,
      briefing: {
        headline: item.headline,
        text: item.text,
        portfolioLine: "",
        watch: "",
        brightSpot: "",
        suggestion: "",
        dataQuality: item.dataQuality,
        aiStatus: "fallback",
      },
      context: {
        generatedAt: item.generatedAt,
        portfolio: {
          valueUsd: item.valueUsd,
          changeUsd24h: 0,
          changePct24h: 0,
          holdings: [],
        },
        news: [],
        etfs: [],
        indexes: [],
        sodexActions: [],
        unlocks: [],
        macroEvents: [],
        warnings: ["Loaded from local briefing history."],
      },
    });
    setStatus("History item loaded.");
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem("cryptobrief-history");
    setStatus("Local briefing history cleared.");
  }

  const firstSodexAction = briefing?.context.sodexActions[0];

  return (
    <main className="app-shell">
      <section className="hero-section" id="compose">
        <Image
          src="/hero-market-console.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hero-image"
        />
        <div className="hero-scan" />
        <div className="hero-content">
          <div className="brand-stack">
            <div className="signal-pill">
              <Radio size={16} />
              <span>SoSoValue + SSI + SoDEX</span>
            </div>
            <h1>CryptoBrief</h1>
            <p>Morning intelligence for the portfolio you actually hold.</p>
            <nav className="workflow-nav" aria-label="workflow">
              {[
                ["#compose", "Compose"],
                ["#briefing", "Brief"],
                ["#report", "Report"],
                ["#automations", "Automations"],
                ["#history", "History"],
              ].map(([href, label]) => (
                <a href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="service-strip" aria-label="service status">
              {["sosovalue", "ssi", "openai", "telegram", "email", "sodex"].map(
                (service) => (
                  <span key={service}>
                    <span className="status-dot" />
                    {serviceNames[service]}{" "}
                    {serviceLabel(health?.services?.[service])}
                  </span>
                ),
              )}
            </div>
          </div>

          <form className="briefing-panel" onSubmit={generateBriefing}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Wave 2 console</p>
                <h2>Build today&apos;s brief</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Refresh service status"
                onClick={refreshHealth}
              >
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="holdings-list">
              {holdings.map((holding, index) => (
                <div className="holding-row" key={`${holding.symbol}-${index}`}>
                  <input
                    aria-label="Asset symbol"
                    value={holding.symbol}
                    onChange={(event) =>
                      updateHolding(index, {
                        symbol: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="BTC"
                  />
                  <input
                    aria-label="Amount"
                    value={holding.amount}
                    onChange={(event) =>
                      updateHolding(index, { amount: event.target.value })
                    }
                    inputMode="decimal"
                    placeholder="0.05"
                  />
                  <input
                    aria-label="Cost basis"
                    value={holding.costBasis}
                    onChange={(event) =>
                      updateHolding(index, { costBasis: event.target.value })
                    }
                    inputMode="decimal"
                    placeholder="Cost"
                  />
                  <button
                    className="icon-button ghost"
                    type="button"
                    title="Remove holding"
                    onClick={() => removeHolding(index)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>

            <div className="inline-actions">
              <button className="text-button" type="button" onClick={addHolding}>
                <Plus size={17} />
                Add asset
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setHoldings(defaultHoldings)}
              >
                <RefreshCw size={16} />
                Reset sample
              </button>
            </div>

            <div className="wallet-import">
              <label>
                <Wallet size={15} />
                <span>Wallet</span>
                <input
                  value={walletAddress}
                  onChange={(event) => setWalletAddress(event.target.value)}
                  placeholder="0x..."
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={connectWallet}
              >
                <Wallet size={16} />
                Connect
              </button>
              <button
                className="secondary-button"
                disabled={loading}
                type="button"
                onClick={importWallet}
              >
                <Activity size={16} />
                Import SoDEX
              </button>
            </div>

            <div className="field-grid">
              <label>
                <Clock size={15} />
                <span>Delivery</span>
                <input
                  type="time"
                  value={deliveryTime}
                  onChange={(event) => setDeliveryTime(event.target.value)}
                />
              </label>
              <label>
                <ShieldCheck size={15} />
                <span>Risk</span>
                <select
                  value={riskTolerance}
                  onChange={(event) =>
                    setRiskTolerance(
                      event.target.value as
                        | "conservative"
                        | "balanced"
                        | "aggressive",
                    )
                  }
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
            </div>

            <div className="field-grid">
              <label>
                <MessageCircle size={15} />
                <span>Telegram chat</span>
                <input
                  value={telegramChatId}
                  onChange={(event) => setTelegramChatId(event.target.value)}
                  placeholder="123456789"
                />
              </label>
              <label>
                <Wallet size={15} />
                <span>Timezone</span>
                <input
                  value={timezone}
                  readOnly
                />
              </label>
            </div>

            <div className="action-row">
              <button className="primary-button" disabled={loading} type="submit">
                <Zap size={18} />
                {loading ? "Working..." : "Generate briefing"}
              </button>
              <button
                className="secondary-button"
                disabled={loading || !briefing}
                onClick={sendDelivery}
                type="button"
              >
                <Send size={17} />
                Send channels
              </button>
            </div>
            <p className="status-line">{status || "Ready for live data."}</p>
          </form>
        </div>
      </section>

      <section className="briefing-section" id="briefing">
        <div className="briefing-copy">
          <p className="eyebrow">Live preview</p>
          <h2>{briefing?.briefing.headline ?? "Your briefing appears here"}</h2>
          <div className="briefing-message">
            {(briefing?.briefing.text ??
              "Generate a briefing to pull live prices, news, ETF flows, SSI indexes, token unlocks, macro events, and SoDEX action readiness.")
              .split("\n")
              .map((line, index) => {
                const cleanLine = cleanBriefingLine(line);

                return cleanLine ? (
                  <p key={`${cleanLine}-${index}`}>{cleanLine}</p>
                ) : (
                  <br key={index} />
                );
              })}
          </div>
          <div className="inline-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={!briefing}
              onClick={() => {
                if (briefing) {
                  navigator.clipboard
                    .writeText(briefing.briefing.text)
                    .then(() => setStatus("Briefing copied."))
                    .catch(() => setStatus("Clipboard is unavailable."));
                }
              }}
            >
              <Copy size={16} />
              Copy
            </button>
            <a className="secondary-button" href="#report">
              <ExternalLink size={16} />
              Report
            </a>
          </div>
          {briefing?.context.warnings.length ? (
            <div className="warning-line">
              {briefing.context.warnings.join(" ")}
            </div>
          ) : null}
        </div>

        <div className="metric-rail">
          <div className="metric-row">
            <span>Portfolio</span>
            <strong>
              {briefing
                ? formatMoney(briefing.context.portfolio.valueUsd)
                : "n/a"}
            </strong>
          </div>
          <div className="metric-row">
            <span>24h move</span>
            <strong
              className={
                briefing && briefing.context.portfolio.changeUsd24h < 0
                  ? "negative"
                  : "positive"
              }
            >
              {briefing
                ? `${formatMoney(
                    briefing.context.portfolio.changeUsd24h,
                  )} ${formatPercent(briefing.context.portfolio.changePct24h)}`
                : "n/a"}
            </strong>
          </div>
          <div className="metric-row">
            <span>AI mode</span>
            <strong>{briefing?.briefing.aiStatus ?? "waiting"}</strong>
          </div>
          <div className="metric-row">
            <span>Data</span>
            <strong>{briefing?.briefing.dataQuality ?? "waiting"}</strong>
          </div>
        </div>
      </section>

      <section className="report-section" id="report">
        <div className="section-head">
          <div>
            <p className="eyebrow">Full report</p>
            <h2>Portfolio, catalysts, action path</h2>
          </div>
          <a
            className="secondary-button link-button"
            href={firstSodexAction?.actionUrl ?? sodexAppUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            SoDEX
          </a>
        </div>

        <div className="data-grid">
          <div className="data-panel holdings-panel">
            <div className="panel-head tight">
              <h3>Holdings</h3>
              <Activity size={17} />
            </div>
            <div className="table-like">
              {(briefing?.context.portfolio.holdings ?? []).map((holding) => (
                <div className="table-row" key={holding.symbol}>
                  <span>{holding.symbol}</span>
                  <span>{numberFormatter.format(holding.amount)}</span>
                  <span>{formatMoney(holding.valueUsd)}</span>
                  <strong
                    className={holding.changePct24h < 0 ? "negative" : "positive"}
                  >
                    {formatPercent(holding.changePct24h)}
                  </strong>
                  <span>{holdingSourceLabel(holding.dataSource)}</span>
                </div>
              ))}
              {!briefing ? <p className="muted">No live report yet.</p> : null}
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-head tight">
              <h3>SSI index match</h3>
              <Radio size={17} />
            </div>
            <div className="signal-list">
              {(briefing?.context.indexes ?? []).slice(0, 4).map((index) => (
                <div className="signal-row" key={index.ticker}>
                  <span>{index.ticker}</span>
                  <strong>{formatPercent(index.changePct24h)}</strong>
                  <em>
                    {index.matchedSymbols.join(", ")}{" "}
                    {formatPercent(index.matchedWeight * 100)}
                  </em>
                </div>
              ))}
              {briefing && briefing.context.indexes.length === 0 ? (
                <p className="muted">No SSI index matched this portfolio.</p>
              ) : null}
              {!briefing ? <p className="muted">Indexes load after briefing.</p> : null}
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-head tight">
              <h3>Unlock calendar</h3>
              <CalendarClock size={17} />
            </div>
            <div className="signal-list">
              {(briefing?.context.unlocks ?? [])
                .flatMap((summary) => summary.nextUnlocks)
                .slice(0, 5)
                .map((unlock) => (
                  <div
                    className="signal-row"
                    key={`${unlock.symbol}-${unlock.unlockAt}-${unlock.label}`}
                  >
                    <span>{unlock.symbol}</span>
                    <strong>{unlock.label}</strong>
                    <em>{unlock.daysUntil}d</em>
                  </div>
                ))}
              {briefing && briefing.context.unlocks.length === 0 ? (
                <p className="muted">No near-term unlocks returned.</p>
              ) : null}
              {!briefing ? <p className="muted">Unlocks load after briefing.</p> : null}
            </div>
          </div>

          <div className="data-panel news-panel">
            <div className="panel-head tight">
              <h3>Overnight news</h3>
              <Bell size={17} />
            </div>
            <div className="news-list">
              {(briefing?.context.news ?? []).slice(0, 5).map((item) => (
                <a
                  href={item.original_link ?? item.source_link ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  key={item.id}
                >
                  <span>
                    {item.matched_currencies
                      ?.map((currency) => currency.name)
                      .join(", ") || "MARKET"}
                  </span>
                  <strong>{item.title}</strong>
                </a>
              ))}
              {!briefing ? <p className="muted">News loads after briefing.</p> : null}
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-head tight">
              <h3>ETF and macro</h3>
              <Radio size={17} />
            </div>
            <div className="signal-list">
              {(briefing?.context.etfs ?? []).slice(0, 4).map((etf) => (
                <div key={`${etf.symbol}-${etf.date}`} className="signal-row">
                  <span>{etf.symbol} ETF</span>
                  <strong>{formatMoney(etf.total_net_inflow)}</strong>
                  <em>{etf.date}</em>
                </div>
              ))}
              {(briefing?.context.macroEvents ?? []).slice(0, 3).map((event) => (
                <div key={event.date} className="signal-row">
                  <span>{event.date}</span>
                  <strong>{event.events.slice(0, 2).join(", ")}</strong>
                </div>
              ))}
              {!briefing ? <p className="muted">Signals load after briefing.</p> : null}
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-head tight">
              <h3>SoDEX preview</h3>
              <Zap size={17} />
            </div>
            <div className="ticker-list">
              {firstSodexAction ? (
                <button
                  className="ticker-row action-row-button"
                  type="button"
                  onClick={() =>
                    setOrderForm((current) => ({
                      ...current,
                      symbol: firstSodexAction.symbol,
                    }))
                  }
                >
                  <span>{firstSodexAction.marketSymbol}</span>
                  <strong>{formatMoney(firstSodexAction.lastPrice)}</strong>
                  <em>Preview ready</em>
                </button>
              ) : (
                sodexTickers.slice(0, 4).map((ticker) => (
                  <div className="ticker-row" key={ticker.symbol}>
                    <span>{ticker.symbol}</span>
                    <strong>{ticker.lastPrice ?? "n/a"}</strong>
                    <em>{formatPercent(ticker.priceChangePercent)}</em>
                  </div>
                ))
              )}
              <form className="order-form" onSubmit={previewSodexOrder}>
                <select
                  aria-label="Order side"
                  value={orderForm.side}
                  onChange={(event) =>
                    setOrderForm((current) => ({
                      ...current,
                      side: event.target.value as "BUY" | "SELL",
                      funds:
                        event.target.value === "SELL" ? "" : current.funds,
                    }))
                  }
                >
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
                <select
                  aria-label="Order type"
                  value={orderForm.type}
                  onChange={(event) =>
                    setOrderForm((current) => {
                      const type = event.target.value as "MARKET" | "LIMIT";

                      return {
                        ...current,
                        type,
                        funds: type === "LIMIT" ? "" : current.funds,
                        limitPrice: type === "MARKET" ? "" : current.limitPrice,
                      };
                    })
                  }
                >
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                </select>
                <input
                  aria-label="Order asset symbol"
                  value={orderForm.symbol}
                  onChange={(event) =>
                    setOrderForm((current) => ({
                      ...current,
                      symbol: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="BTC"
                />
                <input
                  aria-label="Order quantity"
                  value={orderForm.quantity}
                  onChange={(event) =>
                    setOrderForm((current) => {
                      const quantity = event.target.value;

                      return {
                        ...current,
                        quantity,
                        funds: quantity ? "" : current.funds,
                      };
                    })
                  }
                  inputMode="decimal"
                  placeholder="Qty"
                />
                <input
                  aria-label="Order funds"
                  value={orderForm.funds}
                  onChange={(event) =>
                    setOrderForm((current) => {
                      const funds = event.target.value;

                      return {
                        ...current,
                        funds,
                        quantity: funds ? "" : current.quantity,
                      };
                    })
                  }
                  disabled={orderForm.type !== "MARKET" || orderForm.side !== "BUY"}
                  inputMode="decimal"
                  placeholder="USDC"
                />
                <input
                  aria-label="Limit price"
                  value={orderForm.limitPrice}
                  onChange={(event) =>
                    setOrderForm((current) => ({
                      ...current,
                      limitPrice: event.target.value,
                    }))
                  }
                  disabled={orderForm.type !== "LIMIT"}
                  inputMode="decimal"
                  placeholder="Limit"
                />
                <input
                  aria-label="Slippage percent"
                  value={orderForm.slippagePct}
                  onChange={(event) =>
                    setOrderForm((current) => ({
                      ...current,
                      slippagePct: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                  placeholder="Slip %"
                />
                <button className="secondary-button" disabled={loading} type="submit">
                  <SlidersHorizontal size={16} />
                  Preview
                </button>
              </form>
              {orderPreview ? (
                <div className="preview-note">
                  <CheckCircle2 size={16} />
                  <span>
                    {orderPreview.marketSymbol} {orderPreview.side} preview,{" "}
                    {formatMoney(orderPreview.estimatedNotionalUsd)}, signature
                    required.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="automation-section" id="automations">
        <div className="section-head">
          <div>
            <p className="eyebrow">Automations</p>
            <h2>Delivery and notification controls</h2>
          </div>
          <button className="secondary-button" type="button" onClick={saveDeliverySettings}>
            <CheckCircle2 size={16} />
            Save
          </button>
        </div>
        <div className="control-grid">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={deliverySettings.morning}
              onChange={(event) =>
                setDeliverySettings((current) => ({
                  ...current,
                  morning: event.target.checked,
                }))
              }
            />
            <span>Morning brief</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={deliverySettings.evening}
              onChange={(event) =>
                setDeliverySettings((current) => ({
                  ...current,
                  evening: event.target.checked,
                }))
              }
            />
            <span>Evening check-in</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={deliverySettings.telegram}
              onChange={(event) =>
                setDeliverySettings((current) => ({
                  ...current,
                  telegram: event.target.checked,
                }))
              }
            />
            <span>Telegram</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={deliverySettings.email}
              onChange={(event) =>
                setDeliverySettings((current) => ({
                  ...current,
                  email: event.target.checked,
                }))
              }
            />
            <span>Email</span>
          </label>
          <label className="wide-field">
            <Mail size={15} />
            <span>Email recipient</span>
            <input
              value={deliverySettings.emailTo}
              onChange={(event) =>
                setDeliverySettings((current) => ({
                  ...current,
                  emailTo: event.target.value,
                }))
              }
              placeholder="you@example.com"
            />
          </label>
        </div>
      </section>

      <section className="history-section" id="history">
        <div className="section-head">
          <div>
            <p className="eyebrow">History</p>
            <h2>Recent briefings</h2>
          </div>
          <button
            className="secondary-button link-button"
            disabled={history.length === 0}
            type="button"
            onClick={clearHistory}
          >
            <Trash2 size={16} />
            Clear
          </button>
        </div>
        <div className="history-list">
          {history.map((item) => (
            <button
              className="history-row"
              key={item.id}
              type="button"
              onClick={() => restoreHistoryItem(item)}
            >
              <span>{dateFormatter.format(new Date(item.generatedAt))}</span>
              <strong>{item.headline}</strong>
              <em>{formatMoney(item.valueUsd)}</em>
            </button>
          ))}
          {history.length === 0 ? <p className="muted">No saved briefings yet.</p> : null}
        </div>
      </section>

      <section className="chat-section">
        <div>
          <p className="eyebrow">Follow-up</p>
          <h2>Ask the morning bot</h2>
        </div>
        <form className="chat-form" onSubmit={askFollowUp}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Should I be worried about anything today?"
          />
          <button className="primary-button" disabled={loading} type="submit">
            <MessageCircle size={17} />
            Ask
          </button>
        </form>
        {answer ? <div className="answer-panel">{answer}</div> : null}
      </section>
    </main>
  );
}
