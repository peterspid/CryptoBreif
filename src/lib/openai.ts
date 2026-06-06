import OpenAI from "openai";
import { env } from "./env";

let healthCache:
  | {
      expiresAt: number;
      result: {
        configured: boolean;
        model: string;
      };
    }
  | undefined;

export async function checkOpenAiHealth() {
  if (!env.openaiApiKey) {
    return {
      configured: false,
      model: env.openaiModel,
    };
  }

  if (healthCache && healthCache.expiresAt > Date.now()) {
    return healthCache.result;
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });

  await client.models.retrieve(env.openaiModel);

  const result = {
    configured: true,
    model: env.openaiModel,
  };
  healthCache = {
    expiresAt: Date.now() + 60_000,
    result,
  };

  return result;
}
