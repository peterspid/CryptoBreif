import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { TelegramSendSchema } from "@/lib/schemas";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = TelegramSendSchema.parse(body);
    const result = await sendTelegramMessage(payload.text, payload.chatId);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return apiError(error);
  }
}
