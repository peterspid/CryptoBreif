import "server-only";

export class ConfigError extends Error {
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function envEnum<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const value = process.env[key]?.trim();

  if (!value) {
    return fallback;
  }

  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }

  throw new ConfigError(`${key} must be one of: ${allowed.join(", ")}.`);
}

export const env = {
  sosovalueApiKey: process.env.SOSOVALUE_API_KEY ?? process.env.SOSO_API_KEY,
  sosovalueBaseUrl:
    process.env.SOSOVALUE_BASE_URL ??
    "https://openapi.sosovalue.com/openapi/v1",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  emailTo: process.env.EMAIL_TO,
  appApiSecret: process.env.APP_API_SECRET,
  allowCustomDeliveryRecipients:
    process.env.ALLOW_CUSTOM_DELIVERY_RECIPIENTS === "true",
  cronSecret: process.env.CRON_SECRET,
  scheduledBriefingPortfolio: process.env.SCHEDULED_BRIEFING_PORTFOLIO,
  scheduledBriefingTimezone:
    process.env.SCHEDULED_BRIEFING_TIMEZONE ?? "Asia/Shanghai",
  scheduledBriefingMorningTime:
    process.env.SCHEDULED_BRIEFING_MORNING_TIME ?? "07:00",
  scheduledBriefingEveningTime:
    process.env.SCHEDULED_BRIEFING_EVENING_TIME ?? "18:00",
  scheduledBriefingMarketRegion: envEnum(
    "SCHEDULED_BRIEFING_MARKET_REGION",
    ["global", "china_hk"],
    "china_hk",
  ),
  scheduledBriefingLanguage: envEnum(
    "SCHEDULED_BRIEFING_LANGUAGE",
    ["en", "zh", "tc"],
    "zh",
  ),
  sodexSpotBaseUrl:
    process.env.SODEX_SPOT_BASE_URL ??
    "https://testnet-gw.sodex.dev/api/v1/spot",
  sodexAppUrl:
    process.env.SODEX_APP_URL ??
    process.env.NEXT_PUBLIC_SODEX_APP_URL ??
    "https://sodex.com",
};

export function requireSecret(value: string | undefined, label: string) {
  if (!value) {
    throw new ConfigError(`${label} is not configured.`);
  }

  return value;
}
