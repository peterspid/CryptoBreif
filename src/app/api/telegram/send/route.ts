import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { env } from "@/lib/env";
import {
  assertAllowedDeliveryTarget,
  rateLimit,
} from "@/lib/route-guard";
import { TelegramSendSchema } from "@/lib/schemas";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "telegram-send",
      limit: 3,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = await request.json();
    const payload = TelegramSendSchema.parse(body);
    const chatId = assertAllowedDeliveryTarget(
      request,
      payload.chatId,
      env.telegramChatId,
      "Telegram chat id",
    );
    const result = await sendTelegramMessage(payload.text, chatId);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return apiError(error);
  }
}
