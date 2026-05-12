import { env, requireSecret } from "./env";

type TelegramResponse = {
  ok: boolean;
  description?: string;
  result?: unknown;
};

export async function sendTelegramMessage(text: string, chatId?: string) {
  const token = requireSecret(env.telegramBotToken, "TELEGRAM_BOT_TOKEN");
  const targetChatId = chatId || env.telegramChatId;

  if (!targetChatId) {
    throw new Error(
      "Telegram chat id is missing. Start the bot, get your chat id, then set TELEGRAM_CHAT_ID or paste it in the app.",
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
    },
  );

  const payload = (await response.json()) as TelegramResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram send failed.");
  }

  return payload.result;
}
