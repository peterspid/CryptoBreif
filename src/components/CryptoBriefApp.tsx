"use client";

import Image from "next/image";
import {
  Activity,
  Bell,
  Clock,
  ExternalLink,
  MessageCircle,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
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
    macroEvents: Array<{ date: string; events: string[] }>;
    warnings: string[];
  };
};

type HealthResponse = {
  services?: Record<
    string,
    { ok?: boolean; configured?: boolean; model?: string; error?: string }
  >;
};

type SodexTicker = {
  symbol: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
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

const defaultHoldings: HoldingForm[] = [
  { symbol: "BTC", amount: "0.05", costBasis: "" },
  { symbol: "ETH", amount: "1.2", costBasis: "" },
  { symbol: "SOL", amount: "18", costBasis: "" },
];

const serviceNames: Record<string, string> = {
  sosovalue: "SoSoValue",
  openai: "OpenAI",
  telegram: "Telegram",
  sodex: "SoDEX",
};

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
    return "Live";
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

export function CryptoBriefApp() {
  const [holdings, setHoldings] = useState<HoldingForm[]>(defaultHoldings);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [riskTolerance, setRiskTolerance] = useState<
    "conservative" | "balanced" | "aggressive"
  >("balanced");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramHandle, setTelegramHandle] = useState("");
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sodexTickers, setSodexTickers] = useState<SodexTicker[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta",
    [],
  );

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null));

    fetch("/api/sodex/markets")
      .then((response) => response.json())
      .then((payload) => setSodexTickers(payload.tickers ?? []))
      .catch(() => setSodexTickers([]));
  }, []);

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
    telegramHandle,
    riskTolerance,
    interests: ["etf", "news", "macro", "sodex"] as const,
  };

  async function generateBriefing(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setStatus("Fetching live SoSoValue data...");
    setAnswer("");

    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Briefing failed");
      }

      setBriefing(data);
      setStatus("Briefing generated from live market data.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Briefing failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendTelegram() {
    if (!briefing?.briefing.text) {
      setStatus("Generate a briefing first.");
      return;
    }

    setLoading(true);
    setStatus("Sending Telegram briefing...");

    try {
      const response = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: briefing.briefing.text,
          chatId: telegramChatId,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Telegram send failed");
      }

      setStatus("Telegram briefing sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Telegram send failed");
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

  const heroNewsImage =
    briefing?.context.news.find((item) => item.feature_image)?.feature_image ??
    "/briefing-signal.png";

  return (
    <main className="app-shell">
      <section className="hero-section">
        <Image
          src={heroNewsImage}
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
              <span>SoSoValue live signal</span>
            </div>
            <h1>CryptoBreif</h1>
            <p>Morning brief for the money you actually hold.</p>
            <div className="service-strip" aria-label="service status">
              {["sosovalue", "openai", "telegram", "sodex"].map((service) => (
                <span key={service}>
                  <span className="status-dot" />
                  {serviceNames[service]} {serviceLabel(health?.services?.[service])}
                </span>
              ))}
            </div>
          </div>

          <form className="briefing-panel" onSubmit={generateBriefing}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Wave 1 demo</p>
                <h2>Build today&apos;s briefing</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Refresh service status"
                onClick={() => window.location.reload()}
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

            <button className="text-button" type="button" onClick={addHolding}>
              <Plus size={17} />
              Add asset
            </button>

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
                <span>Handle</span>
                <input
                  value={telegramHandle}
                  onChange={(event) => setTelegramHandle(event.target.value)}
                  placeholder="@you"
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
                onClick={sendTelegram}
                type="button"
              >
                <Send size={17} />
                Send Telegram
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
            {(briefing?.briefing.text ?? "Generate a briefing to pull live prices, news, ETF flows, macro events, and SoDEX markets.").split(
              "\n",
            ).map((line, index) => {
              const cleanLine = cleanBriefingLine(line);

              return cleanLine ? (
                <p key={`${cleanLine}-${index}`}>{cleanLine}</p>
              ) : (
                <br key={index} />
              );
            })}
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

      <section className="report-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Full report</p>
            <h2>Portfolio, catalysts, action path</h2>
          </div>
          <a
            className="secondary-button link-button"
            href="https://sodex.com"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Act on SoDEX
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
                </div>
              ))}
              {!briefing ? <p className="muted">No live report yet.</p> : null}
            </div>
          </div>

          <div className="data-panel">
            <div className="panel-head tight">
              <h3>SoDEX testnet markets</h3>
              <Zap size={17} />
            </div>
            <div className="ticker-list">
              {sodexTickers.slice(0, 6).map((ticker) => (
                <div className="ticker-row" key={ticker.symbol}>
                  <span>{ticker.symbol}</span>
                  <strong>{ticker.lastPrice ?? "n/a"}</strong>
                  <em>{formatPercent(ticker.priceChangePercent)}</em>
                </div>
              ))}
              {sodexTickers.length === 0 ? (
                <p className="muted">SoDEX market feed is loading.</p>
              ) : null}
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
                    {item.matched_currencies?.map((currency) => currency.name).join(", ") ||
                      "MARKET"}
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
