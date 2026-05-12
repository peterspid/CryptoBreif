import { z } from "zod";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().finite().nonnegative().optional());

export const HoldingSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(2, "Symbol is required")
    .max(16, "Symbol is too long")
    .transform((value) => value.toUpperCase()),
  amount: z.coerce.number().finite().positive("Amount must be greater than 0"),
  costBasis: optionalNumber,
});

export const BriefingRequestSchema = z.object({
  holdings: z.array(HoldingSchema).min(1, "Add at least one portfolio asset"),
  deliveryTime: z.string().trim().min(1).default("07:00"),
  timezone: z.string().trim().min(1).default("Asia/Calcutta"),
  telegramChatId: z.string().trim().optional().or(z.literal("")),
  telegramHandle: z.string().trim().optional().or(z.literal("")),
  riskTolerance: z
    .enum(["conservative", "balanced", "aggressive"])
    .default("balanced"),
  interests: z
    .array(z.enum(["etf", "news", "macro", "sodex", "unlock"]))
    .default(["etf", "news", "macro", "sodex"]),
});

export const ChatRequestSchema = z.object({
  question: z.string().trim().min(2).max(600),
  previousBriefing: z.string().trim().max(8000).optional(),
  portfolio: BriefingRequestSchema,
});

export const TelegramSendSchema = z.object({
  text: z.string().trim().min(1).max(12000),
  chatId: z.string().trim().optional().or(z.literal("")),
});

export type HoldingInput = z.infer<typeof HoldingSchema>;
export type BriefingRequest = z.infer<typeof BriefingRequestSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
