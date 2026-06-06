import { env, requireSecret } from "./env";

type TelegramResponse = {
  ok: boolean;
  description?: string;
  result?: unknown;
};

type TelegramKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
};

type TelegramBotInfo = {
  username?: string;
};

export async function checkTelegramHealth() {
  if (!env.telegramBotToken) {
    return {
      configured: false,
      hasDefaultChat: Boolean(env.telegramChatId),
    };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.telegramBotToken}/getMe`,
    {
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as TelegramResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram bot check failed.");
  }

  return {
    configured: true,
    hasDefaultChat: Boolean(env.telegramChatId),
    botUsername: (payload.result as TelegramBotInfo | undefined)?.username,
  };
}

export async function sendTelegramMessage(
  text: string,
  chatId?: string,
  replyMarkup?: TelegramKeyboard,
) {
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
        reply_markup: replyMarkup,
      }),
    },
  );

  const payload = (await response.json()) as TelegramResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram send failed.");
  }

  return payload.result;
}

export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  const token = requireSecret(env.telegramBotToken, "TELEGRAM_BOT_TOKEN");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/answerCallbackQuery`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    },
  );
  const payload = (await response.json()) as TelegramResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram callback failed.");
  }

  return payload.result;
}
