import OpenAI from "openai";
import { env } from "./env";
import { compactMoney, money, percent, todayLine } from "./format";
import type { BriefingResult, EnrichedHolding, MarketContext } from "./types";

function holdingLine(holding: EnrichedHolding) {
  return `${holding.symbol} ${percent(holding.changePct24h)} at ${money(
    holding.price,
  )}, position ${compactMoney(holding.valueUsd)}`;
}

function pickWatch(holdings: EnrichedHolding[]) {
  return [...holdings].sort((a, b) => a.changePct24h - b.changePct24h)[0];
}

function pickBrightSpot(holdings: EnrichedHolding[]) {
  return [...holdings].sort((a, b) => b.changePct24h - a.changePct24h)[0];
}

function etfLine(context: MarketContext) {
  const latest = context.etfs[0];

  if (!latest) {
    return "ETF flow data is unavailable for this portfolio mix right now.";
  }

  const direction =
    Number(latest.total_net_inflow) >= 0 ? "net inflow" : "net outflow";

  return `${latest.symbol} ETF ${direction}: ${compactMoney(
    Number(latest.total_net_inflow),
  )} on ${latest.date}.`;
}

function macroLine(context: MarketContext) {
  const next = context.macroEvents[0];

  if (!next) {
    return "No major macro events returned by SoSoValue for the next 7 days.";
  }

  return `${next.date}: ${next.events.slice(0, 3).join(", ")}.`;
}

function newsLine(context: MarketContext) {
  const top = context.news[0];

  if (!top) {
    return "No portfolio-matched overnight news returned by SoSoValue.";
  }

  const assets =
    top.matched_currencies?.map((currency) => currency.name).join(", ") ??
    "market";

  return `${assets}: ${top.title}`;
}

export function deterministicBriefing(
  context: MarketContext,
  aiStatus: BriefingResult["aiStatus"] = "fallback",
): BriefingResult {
  const watch = pickWatch(context.portfolio.holdings);
  const brightSpot = pickBrightSpot(context.portfolio.holdings);
  const portfolioLine = `${compactMoney(
    context.portfolio.valueUsd,
  )} portfolio, ${context.portfolio.changeUsd24h >= 0 ? "up" : "down"} ${money(
    Math.abs(context.portfolio.changeUsd24h),
  )} (${percent(context.portfolio.changePct24h)}) over the latest 24h window.`;
  const watchText = `${watch.symbol}: ${holdingLine(watch)}.`;
  const brightText = `${brightSpot.symbol}: ${holdingLine(brightSpot)}.`;
  const suggestion =
    context.request.riskTolerance === "conservative"
      ? `Keep the next action defensive: review ${watch.symbol} size first and avoid adding risk until the next briefing confirms stabilization.`
      : context.request.riskTolerance === "aggressive"
        ? `Watch ${brightSpot.symbol} for continuation, but only after checking SoDEX liquidity and the latest news signal.`
        : `Rebalance attention toward ${brightSpot.symbol} strength while keeping ${watch.symbol} on the watch list.`;

  const text = [
    `CryptoBreif - ${todayLine()}`,
    "",
    `Portfolio: ${portfolioLine}`,
    "",
    `Watch: ${watchText}`,
    `Bright spot: ${brightText}`,
    `News: ${newsLine(context)}`,
    `ETF flows: ${etfLine(context)}`,
    `Coming up: ${macroLine(context)}`,
    "",
    `AI suggestion: ${suggestion}`,
    "",
    "One tap actions: Full report | Act on SoDEX | Snooze today",
  ].join("\n");

  return {
    headline: `Your ${todayLine()} crypto morning brief`,
    text,
    portfolioLine,
    watch: watchText,
    brightSpot: brightText,
    suggestion,
    dataQuality: context.warnings.length > 0 ? "partial" : "live",
    aiStatus,
  };
}

export async function generateAiBriefing(context: MarketContext) {
  const fallback = deterministicBriefing(context, "not_configured");

  if (!env.openaiApiKey) {
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const compactContext = {
      generatedAt: context.generatedAt,
      deliveryTime: context.request.deliveryTime,
      timezone: context.request.timezone,
      riskTolerance: context.request.riskTolerance,
      portfolio: context.portfolio,
      topNews: context.news.slice(0, 8),
      etfs: context.etfs.slice(0, 6),
      macroEvents: context.macroEvents,
      warnings: context.warnings,
    };

    const response = await client.responses.create({
      model: env.openaiModel,
      instructions:
        "You are CryptoBreif, a concise AI crypto morning briefing assistant. Use only the supplied live market data. Do not invent prices, news, ETF flows, token unlocks, or trade execution. Keep the answer useful, calm, and under 220 words. It is not financial advice. Format it as clean plain text for a web preview and Telegram message: no Markdown symbols, no emoji, no tables, no inline links, no bullet characters. Use short section labels such as Portfolio:, Watch:, Bright spot:, News:, ETF flows:, Coming up:, Suggestion:, Actions:.",
      input: `Create a personalized morning briefing from this JSON data:\n${JSON.stringify(
        compactContext,
      )}`,
      max_output_tokens: 700,
    });

    const text = response.output_text?.trim();

    if (!text) {
      throw new Error("OpenAI returned an empty briefing.");
    }

    return {
      ...deterministicBriefing(context, "generated"),
      text,
      aiStatus: "generated" as const,
    };
  } catch (error) {
    return {
      ...deterministicBriefing(context, "fallback"),
      text: `${deterministicBriefing(context, "fallback").text}\n\nAI note: OpenAI generation failed, so this briefing used the deterministic live-data fallback. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    };
  }
}

export async function answerFollowUp(
  context: MarketContext,
  question: string,
  previousBriefing?: string,
) {
  if (!env.openaiApiKey) {
    return "OpenAI is not configured yet. Add OPENAI_API_KEY to .env.local to enable conversational follow-ups.";
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const response = await client.responses.create({
    model: env.openaiModel,
    instructions:
      "You answer follow-up questions for CryptoBreif. Use only supplied live SoSoValue and SoDEX context. Be concise, cite which asset/news/ETF/macro signal you are using, and avoid pretending a trade can be executed without a connected SoDEX wallet and signed order.",
    input: JSON.stringify({
      question,
      previousBriefing,
      context,
    }),
    max_output_tokens: 550,
  });

  return (
    response.output_text?.trim() ??
    "I could not generate a follow-up answer from the current data."
  );
}
