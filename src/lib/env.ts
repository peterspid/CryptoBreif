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
  sodexSpotBaseUrl:
    process.env.SODEX_SPOT_BASE_URL ??
    "https://testnet-gw.sodex.dev/api/v1/spot",
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
