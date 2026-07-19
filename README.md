# CryptoBrief

CryptoBrief is a personal AI crypto morning briefing app for WaveHack. It gives a user a short daily briefing about the assets they hold, using live SoSoValue market data, SoSoValue Indexes, OpenAI generation, Telegram/email delivery, and SoDEX market context.

Instead of opening several crypto apps every morning, the user enters their portfolio once and gets a focused 60-second brief: what moved, why it matters, what news hit overnight, what ETF or macro signals are relevant, and what action path to consider next.

## Live Deployment

Production URL: https://cryptobreif.vercel.app

## What The App Does

- Builds a personalized crypto morning brief from a user's portfolio.
- Supports a China/Hong Kong market profile with SoSoValue `zh`/`tc` news and Hong Kong ETF flow data.
- Fetches real asset prices and 24h moves from SoSoValue.
- Pulls matched overnight news from SoSoValue feeds.
- Adds ETF flow context for supported assets such as BTC, ETH, SOL, XRP, DOGE, LINK, AVAX, DOT, LTC, and HBAR using documented `US` or `HK` country codes.
- Adds matching SoSoValue Index exposure through SSI constituents and market snapshots.
- Adds token unlock context from SoSoValue token economics when available.
- Adds upcoming macro event context when SoSoValue returns events.
- Uses OpenAI to turn live data into concise, natural briefing text.
- Shows a polished web preview with portfolio, news, ETF, macro, SSI, unlock, and SoDEX sections.
- Shows a source-audit panel with the active region, news language, ETF market, API source links, and rate-safe portfolio count.
- Sends the generated briefing to Telegram when bot credentials are configured.
- Sends the generated briefing to email when Resend credentials are configured.
- Supports Telegram webhook replies for `/brief` and snooze callbacks.
- Supports scheduled morning/evening delivery through a protected cron endpoint.
- Imports SoDEX spot balances from a connected or pasted EVM wallet address.
- Answers follow-up questions using fresh live context.
- Builds a SoDEX signed-order preview for supported spot markets without collecting private keys or submitting trades.
- Saves recent briefings in local browser history for judge verification and repeat demos.
- Uses real SoDEX prices as an emergency fallback for supported assets if SoSoValue is unavailable or rate-limits during a live demo.
- Caps each live briefing at 6 assets and caches short-lived SoSoValue responses to stay inside the documented 20 requests/minute API limit.

CryptoBrief does not hardcode market prices, news, ETF numbers, index values, unlock data, or AI output. If an upstream service or credential is missing, the app reports the missing configuration instead of faking data.

## Why It Is Useful

Crypto investors waste time every morning checking prices, headlines, ETF flows, macro calendars, social posts, and exchange apps. Generic summaries are noisy because they rarely focus on the user's actual holdings.

CryptoBrief solves that by turning the user's portfolio into a daily routine:

1. Wake up.
2. Read one personalized briefing.
3. Know what moved, what caused it, and what deserves attention.
4. Ask follow-up questions naturally.
5. Move toward SoDEX actions only after explicit user approval and a signed order.

## How It Works

1. The user enters holdings, market profile, news language, delivery time, Telegram details, and risk level.
2. The backend resolves each token symbol against SoSoValue's currency list.
3. It fetches SoSoValue market snapshots for live prices and 24h change.
4. It fetches matched news from the last several hours in the selected SoSoValue language.
5. It fetches ETF summary history for supported assets in the selected `US` or `HK` ETF market.
6. It fetches SoSoValue Index constituents and snapshots for matching SSI exposure.
7. It fetches token unlock timelines where available.
8. It fetches macro events where available.
9. OpenAI generates a concise plain-text briefing from that live context.
10. The web app renders the preview, full report, automation controls, SoDEX preview, and history dashboard.
11. The Telegram/email delivery endpoints send the same briefing when credentials and recipients are configured.
12. Follow-up questions re-fetch context and answer against current data.

If SoSoValue returns a rate-limit response during a demo, CryptoBrief falls back to real SoDEX testnet market prices for supported symbols and clearly labels the briefing as partial. Unrecognized assets are retained as unpriced holdings instead of breaking the briefing.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- SoSoValue OpenAPI
- SoSoValue Indexes
- Telegram Bot API
- Resend email API
- SoDEX REST API testnet market endpoints
- Vercel-ready serverless API routes

## API Routes

- `POST /api/briefing` - generates a personalized briefing from portfolio input.
- `POST /api/chat` - answers follow-up questions with fresh market context.
- `GET /api/health` - checks SoSoValue, SSI, OpenAI, Telegram, email, and SoDEX configuration status.
- `GET|POST /api/cron/briefings` - generates and delivers scheduled morning/evening briefings.
- `POST /api/delivery/send` - sends the current briefing through selected delivery channels.
- `GET /api/sodex/markets` - returns public SoDEX testnet spot market tickers.
- `POST /api/sodex/wallet` - imports non-zero SoDEX spot balances for a wallet address.
- `POST /api/sodex/order-preview` - builds a signed-order preview for a SoDEX spot market.
- `POST /api/telegram/send` - sends the current briefing through Telegram.
- `POST /api/telegram/webhook` - handles Telegram `/brief` replies and inline callbacks.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM=CryptoBrief <briefings@example.com>
EMAIL_TO=
CRON_SECRET=
APP_API_SECRET=
ALLOW_CUSTOM_DELIVERY_RECIPIENTS=false
SCHEDULED_BRIEFING_PORTFOLIO=[{"symbol":"BTC","amount":0.05},{"symbol":"ETH","amount":1.2}]
SCHEDULED_BRIEFING_TIMEZONE=Asia/Shanghai
SCHEDULED_BRIEFING_MORNING_TIME=07:00
SCHEDULED_BRIEFING_EVENING_TIME=18:00
SCHEDULED_BRIEFING_MARKET_REGION=china_hk
SCHEDULED_BRIEFING_LANGUAGE=zh
SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
SODEX_SPOT_BASE_URL=https://testnet-gw.sodex.dev/api/v1/spot
SODEX_APP_URL=https://sodex.com
NEXT_PUBLIC_SODEX_APP_URL=https://sodex.com
```

Telegram delivery needs a bot token and chat id. A Telegram bot cannot reliably send to a user handle until that user starts the bot and the app knows the numeric chat id.
Email delivery needs `RESEND_API_KEY`, `EMAIL_FROM`, and either `EMAIL_TO` or an in-app recipient.
Scheduled delivery should set `CRON_SECRET` and call `/api/cron/briefings?slot=morning` or `/api/cron/briefings?slot=evening` from Vercel Cron or another scheduler.
Public API routes use best-effort per-IP throttling. Custom in-app Telegram/email recipients are blocked by default; set `ALLOW_CUSTOM_DELIVERY_RECIPIENTS=true` for controlled demos, or send `Authorization: Bearer <APP_API_SECRET>` from trusted server-to-server calls.

Market profile values:

- If a request omits market profile fields, the app defaults to `china_hk`, `zh` news, `HK` ETF flows, and `Asia/Shanghai` scheduling.
- `SCHEDULED_BRIEFING_MARKET_REGION=china_hk` uses Simplified Chinese news by default and `country_code=HK` ETF flows.
- `SCHEDULED_BRIEFING_MARKET_REGION=global` uses English news by default and `country_code=US` ETF flows.
- `SCHEDULED_BRIEFING_LANGUAGE` may be `en`, `zh`, or `tc`.
- Invalid scheduled market/language values are rejected at startup instead of silently producing the wrong regional brief.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` or the port printed by Next.js.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
npm audit
```

The app has also been tested against local API routes for health, briefing generation, follow-up answers, and SoDEX market data. Live SoSoValue/OpenAI/Telegram/Resend checks require real credentials in `.env.local`.

## Demo Flow

1. Open the app.
2. Select `China / Hong Kong` for Simplified Chinese SoSoValue news and Hong Kong ETF flows, or switch to `Global / US`.
3. Enter up to 6 SoSoValue-listed assets such as BTC, ETH, SOL, XRP, DOGE, LINK, AVAX, DOT, LTC, or HBAR.
4. Click `Generate briefing`.
5. Show the live preview with price, localized news, ETF, SSI, unlock, macro, and SoDEX context.
6. Open `Source audit` to show the active language, ETF country, source links, and rate-safe asset count.
7. Preview a SoDEX signed-order action for a supported market.
8. Save notification controls and send Telegram/email if credentials are configured.
9. Ask: `Should I be worried about anything today?`
10. Open the history section to show the saved briefing proof.

## Wave 1 Status

Completed:

- Portfolio onboarding form.
- Live SoSoValue integration.
- OpenAI briefing generation.
- Deterministic live-data fallback if AI generation fails.
- SoDEX price fallback if SoSoValue is temporarily rate-limited.
- Follow-up Q&A route.
- Telegram send endpoint.
- SoDEX public testnet market panel.
- Responsive web UI.
- README, roadmap, and deployment-ready setup.

Not included in Wave 1:

- Mainnet trade execution.
- Wallet signing.
- Production scheduler.
- Persistent user accounts.
- Database-backed briefing history.

## Wave 2 Status

Completed:

- Scheduled morning/evening delivery endpoint with optional protected cron secret.
- Telegram webhook for `/brief` replies and inline snooze callbacks.
- Email delivery through Resend when credentials are configured.
- Browser wallet connect plus SoDEX spot balance import by wallet address.
- Browser-local briefing history dashboard for judge verification.
- Token unlock/event expansion through SoSoValue token economics.
- SoSoValue Index matching through SSI constituents and market snapshots.
- SoDEX signed-order preview for supported testnet spot markets.
- User notification controls for morning, evening, Telegram, and email delivery.
- Graceful unrecognized-asset handling and explicit ETF coverage warnings.
- Health checks that verify configured services instead of only checking env vars.
- Corrected CryptoBrief naming in app, metadata, and package configuration.

 

## Wave 3 Final Status

Completed:

- China/Hong Kong market profile using real SoSoValue `language=zh` or `language=tc` news parameters.
- Hong Kong ETF flow mode using documented SoSoValue `country_code=HK`; global mode continues to use `country_code=US`.
- Editable timezone control with `Asia/Shanghai` defaults for China/Hong Kong scheduled briefings.
- OpenAI briefing and follow-up prompts now answer in the selected SoSoValue content language.
- Source audit panel for region, language, ETF market, source links, and rate-safe portfolio count.
- Main web, scheduled cron, and Telegram `/brief` flows now share the same China/Hong Kong market-profile defaults.
- SoSoValue request-budget hardening: 6-asset briefing cap, short-lived response caches, reduced index constituent probes, and 429 retry handling using documented headers/body fields.
- SoSoValue response hardening: empty or non-JSON upstream error bodies are handled cleanly and surfaced as explicit partial-data fallbacks.
- Production dependency cleanup: Next.js and `eslint-config-next` patched to `16.2.10`, PostCSS overridden to `^8.5.10`, and `npm audit` is clean.
- README and environment documentation updated for final deployment.

Checked SoSoValue docs one by one for this final pass:

1. Introduction: confirmed base URL `https://openapi.sosovalue.com/openapi/v1` and `x-soso-api-key` header.
2. Response Format: confirmed unified `{ code, message, data }` response envelopes.
3. Rate Limit: confirmed 100,000 monthly quota and 20 requests/minute per API key, plus 429 retry metadata.
4. Currency List: confirmed `GET /currencies` for symbol-to-currency ID resolution.
5. Currency Market Snapshot: confirmed `GET /currencies/{currency_id}/market-snapshot` fields for price, 24h change, volume, market cap, and rank.
6. Token Economics: confirmed `GET /currencies/{currency_id}/token-economics` for unlock summary and timeline data.
7. News Feed: confirmed `GET /news` and language values `en`, `zh`, and `tc`.
8. ETF Summary History: confirmed `GET /etfs/summary-history`, supported symbols, and `country_code` values `US` and `HK`.
9. SoSoValue Index: confirmed `GET /indices`, `GET /indices/{index_ticker}/constituents`, and `GET /indices/{index_ticker}/market-snapshot`.
10. Macro Events: confirmed `GET /macro/events` for upcoming event dates and event names.

Not included by design:

- Mainnet trade execution and private-key handling. CryptoBrief remains preview-only for SoDEX orders; users must sign externally.
- WhatsApp, Discord, database-backed user accounts, and group briefings. The shipped delivery channels are Telegram, email, cron, local history, and the web app.

## Safety Notes

CryptoBrief is informational software, not financial advice. Trade execution should always require an explicit user approval and a signed SoDEX order. API keys must stay in environment variables and should never be committed to source control.
