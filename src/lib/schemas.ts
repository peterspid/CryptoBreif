import { z } from "zod";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().finite().nonnegative().optional());

const optionalPositiveNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().finite().positive().optional());

const walletAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM wallet address");

const MarketRegionSchema = z.enum(["global", "china_hk"]);
const ContentLanguageSchema = z.enum(["en", "zh", "tc"]);
const EtfCountryCodeSchema = z.enum(["US", "HK"]);

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
  holdings: z
    .array(HoldingSchema)
    .min(1, "Add at least one portfolio asset")
    .max(6, "Keep each live briefing to 6 assets so SoSoValue rate limits stay safe."),
  deliveryTime: z.string().trim().min(1).default("07:00"),
  timezone: z.string().trim().min(1).default("Asia/Shanghai"),
  marketRegion: MarketRegionSchema.default("china_hk"),
  contentLanguage: ContentLanguageSchema.optional(),
  etfCountryCode: EtfCountryCodeSchema.optional(),
  telegramChatId: z.string().trim().optional().or(z.literal("")),
  telegramHandle: z.string().trim().optional().or(z.literal("")),
  riskTolerance: z
    .enum(["conservative", "balanced", "aggressive"])
    .default("balanced"),
  interests: z
    .array(z.enum(["etf", "news", "macro", "sodex", "unlock"]))
    .default(["etf", "news", "macro", "sodex", "unlock"]),
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

export const DeliverySendSchema = z.object({
  text: z.string().trim().min(1).max(12000),
  subject: z.string().trim().min(1).max(160).default("CryptoBrief"),
  telegramChatId: z.string().trim().optional().or(z.literal("")),
  emailTo: z.string().trim().email().optional().or(z.literal("")),
  channels: z
    .object({
      telegram: z.boolean().default(false),
      email: z.boolean().default(false),
    })
    .default({ telegram: false, email: false }),
});

export const WalletImportSchema = z.object({
  address: walletAddress,
  accountId: z.coerce.number().int().nonnegative().optional(),
});

export const SodexOrderPreviewSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .transform((value) => value.toUpperCase()),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
    quantity: optionalPositiveNumber,
    funds: optionalPositiveNumber,
    limitPrice: optionalPositiveNumber,
    slippagePct: z.coerce.number().finite().min(0.05).max(15).default(0.75),
  })
  .superRefine((value, context) => {
    const hasQuantity = value.quantity !== undefined;
    const hasFunds = value.funds !== undefined;

    if (value.type === "MARKET" && !hasQuantity && !hasFunds) {
      context.addIssue({
        code: "custom",
        message: "Market preview needs quantity or funds.",
        path: ["quantity"],
      });
    }

    if (value.type === "MARKET" && hasQuantity && hasFunds) {
      context.addIssue({
        code: "custom",
        message: "Market preview needs quantity or funds, not both.",
        path: ["funds"],
      });
    }

    if (value.type === "MARKET" && value.side === "SELL" && hasFunds) {
      context.addIssue({
        code: "custom",
        message: "Funds is only available for market buys.",
        path: ["funds"],
      });
    }

    if (value.type === "LIMIT" && !hasQuantity) {
      context.addIssue({
        code: "custom",
        message: "Limit preview needs quantity.",
        path: ["quantity"],
      });
    }

    if (value.type === "LIMIT" && !value.limitPrice) {
      context.addIssue({
        code: "custom",
        message: "Limit preview needs a limit price.",
        path: ["limitPrice"],
      });
    }

    if (value.type === "LIMIT" && hasFunds) {
      context.addIssue({
        code: "custom",
        message: "Limit previews use quantity and price, not funds.",
        path: ["funds"],
      });
    }
  });

export const TelegramWebhookSchema = z
  .object({
    message: z
      .object({
        chat: z.object({ id: z.union([z.string(), z.number()]) }),
        text: z.string().optional(),
      })
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        message: z
          .object({
            chat: z.object({ id: z.union([z.string(), z.number()]) }),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export type HoldingInput = z.infer<typeof HoldingSchema>;
export type BriefingRequest = z.infer<typeof BriefingRequestSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type DeliverySendRequest = z.infer<typeof DeliverySendSchema>;
export type WalletImportRequest = z.infer<typeof WalletImportSchema>;
export type SodexOrderPreviewRequest = z.infer<typeof SodexOrderPreviewSchema>;
