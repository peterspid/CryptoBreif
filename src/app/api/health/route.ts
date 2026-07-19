import { NextResponse } from "next/server";
import { checkEmailHealth } from "@/lib/email";
import { env } from "@/lib/env";
import { publicErrorMessage } from "@/lib/errors";
import { checkOpenAiHealth } from "@/lib/openai";
import { rateLimit } from "@/lib/route-guard";
import { getSodexHealth } from "@/lib/sodex";
import { checkSosoHealth } from "@/lib/sosovalue";
import { checkTelegramHealth } from "@/lib/telegram";

export const runtime = "nodejs";

const HEALTH_CHECK_TIMEOUT_MS = 8_000;

function withHealthTimeout<T>(label: string, promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `${label} health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s.`,
        ),
      );
    }, HEALTH_CHECK_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    key: "health",
    limit: 20,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  const [soso, openai, sodex, telegram, email] = await Promise.allSettled([
    withHealthTimeout("SoSoValue", checkSosoHealth()),
    withHealthTimeout("OpenAI", checkOpenAiHealth()),
    withHealthTimeout("SoDEX", getSodexHealth()),
    withHealthTimeout("Telegram", checkTelegramHealth()),
    withHealthTimeout("Email", checkEmailHealth()),
  ]);
  const sosoService =
    soso.status === "fulfilled"
      ? { ok: soso.value.configured, ...soso.value }
      : {
          ok: false,
          configured: Boolean(env.sosovalueApiKey),
          error: publicErrorMessage(soso.reason, "SoSoValue health check failed"),
        };

  return NextResponse.json({
    ok: true,
    services: {
      sosovalue: sosoService,
      ssi:
        soso.status === "fulfilled"
          ? {
              ok: soso.value.configured && Number(soso.value.indexCount ?? 0) > 0,
              configured: soso.value.configured,
              indexCount: soso.value.indexCount,
              mode: soso.value.mode,
            }
          : {
              ok: false,
              configured: Boolean(env.sosovalueApiKey),
              error: publicErrorMessage(soso.reason, "SSI health check failed"),
            },
      openai:
        openai.status === "fulfilled"
          ? { ok: openai.value.configured, ...openai.value }
          : {
              ok: false,
              configured: Boolean(env.openaiApiKey),
              model: env.openaiModel,
              error: publicErrorMessage(openai.reason, "OpenAI health check failed"),
            },
      telegram:
        telegram.status === "fulfilled"
          ? {
              ok:
                telegram.value.configured &&
                Boolean(telegram.value.hasDefaultChat),
              ...telegram.value,
            }
          : {
              ok: false,
              configured: Boolean(env.telegramBotToken),
              hasDefaultChat: Boolean(env.telegramChatId),
              error: publicErrorMessage(
                telegram.reason,
                "Telegram health check failed",
              ),
            },
      email:
        email.status === "fulfilled"
          ? { ok: email.value.configured, ...email.value }
          : {
              ok: false,
              configured: Boolean(env.resendApiKey && env.emailFrom),
              hasDefaultRecipient: Boolean(env.emailTo),
              error: publicErrorMessage(email.reason, "Email health check failed"),
            },
      sodex:
        sodex.status === "fulfilled"
          ? { ok: true, ...sodex.value }
          : {
              ok: false,
              error: publicErrorMessage(sodex.reason, "SoDEX health check failed"),
            },
    },
  });
}
