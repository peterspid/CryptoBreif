import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { generateAiBriefing } from "@/lib/briefing";
import { sendEmailMessage } from "@/lib/email";
import { env } from "@/lib/env";
import { BriefingRequestSchema } from "@/lib/schemas";
import { buildSodexFallbackContext } from "@/lib/sodex";
import { buildMarketContext } from "@/lib/sosovalue";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

function authorizationError(request: Request) {
  if (!env.cronSecret) {
    return process.env.NODE_ENV === "production"
      ? "CRON_SECRET is required in production."
      : undefined;
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");

  return authorization !== `Bearer ${env.cronSecret}` &&
    headerSecret !== env.cronSecret
    ? "Unauthorized scheduler request."
    : undefined;
}

async function parseOptionalBody(request: Request) {
  const text = await request.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown>;
}

function profileFromEnv(slot: string) {
  if (!env.scheduledBriefingPortfolio) {
    throw new Error(
      "SCHEDULED_BRIEFING_PORTFOLIO is required for scheduled delivery.",
    );
  }

  return BriefingRequestSchema.parse({
    holdings: JSON.parse(env.scheduledBriefingPortfolio),
    deliveryTime:
      slot === "evening"
        ? env.scheduledBriefingEveningTime
        : env.scheduledBriefingMorningTime,
    timezone: env.scheduledBriefingTimezone,
    riskTolerance: "balanced",
    interests: ["etf", "news", "macro", "sodex", "unlock"],
  });
}

async function buildBriefing(profile: ReturnType<typeof BriefingRequestSchema.parse>) {
  try {
    const context = await buildMarketContext(profile);
    return generateAiBriefing(context);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SoSoValue request failed.";
    const context = await buildSodexFallbackContext(profile, message);
    return generateAiBriefing(context);
  }
}

async function handleScheduledRequest(request: Request) {
  const authError = authorizationError(request);

  if (authError) {
    return NextResponse.json({ ok: false, error: authError }, { status: 401 });
  }

  const url = new URL(request.url);
  const slot = url.searchParams.get("slot") === "evening" ? "evening" : "morning";
  const body = request.method === "POST" ? await parseOptionalBody(request) : {};
  const profile = body.profile
    ? BriefingRequestSchema.parse(body.profile)
    : profileFromEnv(slot);
  const briefing = await buildBriefing(profile);
  const subject =
    slot === "evening" ? "CryptoBrief evening check-in" : "CryptoBrief morning brief";
  const results = [];

  if (env.telegramBotToken && env.telegramChatId) {
    results.push({
      channel: "telegram",
      result: await sendTelegramMessage(briefing.text, env.telegramChatId, {
        inline_keyboard: [
          [
            { text: "Act on SoDEX", url: env.sodexAppUrl },
            { text: "Snooze", callback_data: "snooze_today" },
          ],
        ],
      }),
    });
  }

  if (env.resendApiKey && env.emailFrom && env.emailTo) {
    results.push({
      channel: "email",
      result: await sendEmailMessage(subject, briefing.text, env.emailTo),
    });
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        slot,
        delivered: [],
        error:
          "No scheduled delivery channel is configured. Set Telegram or email env vars before enabling cron.",
        briefing,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    slot,
    delivered: results.map((result) => result.channel),
    briefing,
  });
}

export async function GET(request: Request) {
  try {
    return await handleScheduledRequest(request);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return await handleScheduledRequest(request);
  } catch (error) {
    return apiError(error);
  }
}
