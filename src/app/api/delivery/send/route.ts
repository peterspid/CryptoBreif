import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email";
import { env } from "@/lib/env";
import { publicErrorMessage } from "@/lib/errors";
import {
  assertAllowedDeliveryTarget,
  rateLimit,
} from "@/lib/route-guard";
import { DeliverySendSchema } from "@/lib/schemas";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "delivery",
      limit: 3,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = await request.json();
    const payload = DeliverySendSchema.parse(body);
    const results: Array<{
      channel: "telegram" | "email";
      ok: boolean;
      result?: unknown;
      error?: string;
    }> = [];

    if (!payload.channels.telegram && !payload.channels.email) {
      return NextResponse.json(
        { ok: false, error: "Choose at least one delivery channel." },
        { status: 400 },
      );
    }

    if (payload.channels.telegram) {
      try {
        const telegramChatId = assertAllowedDeliveryTarget(
          request,
          payload.telegramChatId,
          env.telegramChatId,
          "Telegram chat id",
        );
        const result = await sendTelegramMessage(
          payload.text,
          telegramChatId,
          {
            inline_keyboard: [
              [
                { text: "Act on SoDEX", url: env.sodexAppUrl },
                { text: "Snooze", callback_data: "snooze_today" },
              ],
            ],
          },
        );
        results.push({ channel: "telegram", ok: true, result });
      } catch (error) {
        results.push({
          channel: "telegram",
          ok: false,
          error: publicErrorMessage(error, "Telegram failed"),
        });
      }
    }

    if (payload.channels.email) {
      try {
        const emailTo = assertAllowedDeliveryTarget(
          request,
          payload.emailTo,
          env.emailTo,
          "Email recipient",
        );
        const result = await sendEmailMessage(
          payload.subject,
          payload.text,
          emailTo,
        );
        results.push({ channel: "email", ok: true, result });
      } catch (error) {
        results.push({
          channel: "email",
          ok: false,
          error: publicErrorMessage(error, "Email failed"),
        });
      }
    }

    const ok = results.some((result) => result.ok);

    return NextResponse.json(
      {
        ok,
        results,
      },
      { status: ok ? 200 : 502 },
    );
  } catch (error) {
    return apiError(error);
  }
}
