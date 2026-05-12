import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSodexHealth } from "@/lib/sodex";
import { checkSosoHealth } from "@/lib/sosovalue";

export const runtime = "nodejs";

export async function GET() {
  const [soso, sodex] = await Promise.allSettled([
    checkSosoHealth(),
    getSodexHealth(),
  ]);

  return NextResponse.json({
    ok: true,
    services: {
      sosovalue:
        soso.status === "fulfilled"
          ? { ok: true, ...soso.value }
          : {
              ok: false,
              configured: Boolean(env.sosovalueApiKey),
              error: soso.reason?.message ?? "SoSoValue health check failed",
            },
      openai: {
        ok: Boolean(env.openaiApiKey),
        configured: Boolean(env.openaiApiKey),
        model: env.openaiModel,
      },
      telegram: {
        ok: Boolean(env.telegramBotToken && env.telegramChatId),
        configured: Boolean(env.telegramBotToken),
        hasDefaultChat: Boolean(env.telegramChatId),
      },
      sodex:
        sodex.status === "fulfilled"
          ? { ok: true, ...sodex.value }
          : {
              ok: false,
              error: sodex.reason?.message ?? "SoDEX health check failed",
            },
    },
  });
}
