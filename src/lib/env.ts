import "server-only";

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
    process.env.SCHEDULED_BRIEFING_TIMEZONE ?? "Asia/Calcutta",
  scheduledBriefingMorningTime:
    process.env.SCHEDULED_BRIEFING_MORNING_TIME ?? "07:00",
  scheduledBriefingEveningTime:
    process.env.SCHEDULED_BRIEFING_EVENING_TIME ?? "18:00",
  sodexSpotBaseUrl:
    process.env.SODEX_SPOT_BASE_URL ??
    "https://testnet-gw.sodex.dev/api/v1/spot",
  sodexAppUrl:
    process.env.SODEX_APP_URL ??
    process.env.NEXT_PUBLIC_SODEX_APP_URL ??
    "https://sodex.com",
};

export class ConfigError extends Error {
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function requireSecret(value: string | undefined, label: string) {
  if (!value) {
    throw new ConfigError(`${label} is not configured.`);
  }

  return value;
}
