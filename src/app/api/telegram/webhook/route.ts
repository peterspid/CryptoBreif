import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { generateAiBriefing } from "@/lib/briefing";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/route-guard";
import { BriefingRequestSchema, TelegramWebhookSchema } from "@/lib/schemas";
import { buildSodexFallbackContext } from "@/lib/sodex";
import { buildMarketContext } from "@/lib/sosovalue";
import { answerTelegramCallback, sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

function parseBriefCommand(text: string) {
  const pairs = text
    .replace(/^\/brief(@\w+)?/i, "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const holdings = [];

  for (let index = 0; index < pairs.length; index += 2) {
    const symbol = pairs[index];
    const amount = pairs[index + 1];

    if (!symbol || !amount) {
      continue;
    }

    holdings.push({ symbol, amount });
  }

  if (holdings.length === 0) {
    return undefined;
  }

  return BriefingRequestSchema.parse({
    holdings,
    deliveryTime: "07:00",
    timezone: env.scheduledBriefingTimezone,
    riskTolerance: "balanced",
    interests: ["etf", "news", "macro", "sodex", "unlock"],
  });
}

async function buildBriefingText(text: string) {
  const profile = parseBriefCommand(text);

  if (!profile) {
    return "Send /brief followed by your real portfolio pairs, for example: /brief SYMBOL AMOUNT SYMBOL AMOUNT.";
  }

  try {
    const context = await buildMarketContext(profile);
    const briefing = await generateAiBriefing(context);

    return briefing.text;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SoSoValue request failed.";
    const context = await buildSodexFallbackContext(profile, message);
    const briefing = await generateAiBriefing(context);

    return briefing.text;
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "telegram-webhook",
      limit: 20,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    if (env.telegramWebhookSecret) {
      const secret = request.headers.get("x-telegram-bot-api-secret-token");

      if (secret !== env.telegramWebhookSecret) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const update = TelegramWebhookSchema.parse(body);

    if (update.callback_query?.id) {
      await answerTelegramCallback(
        update.callback_query.id,
        update.callback_query.data === "snooze_today"
          ? "Snoozed for today."
          : "Action received.",
      );
      return NextResponse.json({ ok: true });
    }

    const chatId = update.message?.chat.id;
    const text = update.message?.text?.trim() ?? "";

    if (!chatId) {
      return NextResponse.json({ ok: true });
    }

    if (/^\/start/i.test(text)) {
      await sendTelegramMessage(
        "CryptoBrief is ready. Send /brief followed by your real portfolio pairs to generate a live portfolio brief.",
        String(chatId),
      );
      return NextResponse.json({ ok: true });
    }

    if (/^\/brief/i.test(text)) {
      const briefingText = await buildBriefingText(text);
      await sendTelegramMessage(briefingText, String(chatId), {
        inline_keyboard: [
          [
            { text: "Act on SoDEX", url: env.sodexAppUrl },
            { text: "Snooze", callback_data: "snooze_today" },
          ],
        ],
      });
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      "Send /brief followed by your real portfolio pairs for a live morning brief.",
      String(chatId),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
