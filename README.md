# CryptoBreif

CryptoBreif is a personal AI crypto morning briefing app for WaveHack. It gives a user a short daily briefing about the exact assets they hold, using live SoSoValue market data, OpenAI generation, Telegram delivery, and SoDEX market context.

Instead of opening several crypto apps every morning, the user enters their portfolio once and gets a focused 60-second brief: what moved, why it matters, what news hit overnight, what ETF or macro signals are relevant, and what action path to consider next.

## Live Deployment

Production URL: https://cryptobreif.vercel.app

## What The App Does

- Builds a personalized crypto morning brief from a user's portfolio.
- Fetches real asset prices and 24h moves from SoSoValue.
- Pulls matched overnight news from SoSoValue feeds.
- Adds ETF flow context for supported assets such as BTC, ETH, SOL, XRP, DOGE, LINK, AVAX, DOT, LTC, and HBAR.
- Adds upcoming macro event context when SoSoValue returns events.
- Uses OpenAI to turn live data into concise, natural briefing text.
- Shows a polished web preview with portfolio, news, ETF, macro, and SoDEX sections.
- Sends the generated briefing to Telegram when bot credentials are configured.
- Answers follow-up questions using fresh live context.
- Shows SoDEX testnet market data and links users toward the future trade-action flow.
- Uses real SoDEX prices as an emergency fallback for supported assets if SoSoValue rate-limits during a live demo.

CryptoBreif does not hardcode market prices, news, ETF numbers, or AI output. If an upstream service or credential is missing, the app reports the missing configuration instead of faking data.

## Why It Is Useful

Crypto investors waste time every morning checking prices, headlines, ETF flows, macro calendars, social posts, and exchange apps. Generic summaries are noisy because they rarely focus on the user's actual holdings.

CryptoBreif solves that by turning the user's portfolio into a daily routine:

1. Wake up.
2. Read one personalized briefing.
3. Know what moved, what caused it, and what deserves attention.
4. Ask follow-up questions naturally.
5. Move toward SoDEX actions only after explicit user approval.

## How It Works

1. The user enters holdings, delivery time, Telegram details, and risk level.
2. The backend resolves each token symbol against SoSoValue's currency list.
3. It fetches SoSoValue market snapshots for live prices and 24h change.
4. It fetches matched news from the last several hours.
5. It fetches ETF summary history for supported assets.
6. It fetches macro events where available.
7. OpenAI generates a concise plain-text briefing from that live context.
8. The web app renders the preview and full report.
9. The Telegram endpoint sends the same briefing when `TELEGRAM_BOT_TOKEN` and a chat id are configured.
10. Follow-up questions re-fetch context and answer against current data.

If SoSoValue returns a rate-limit response during a demo, CryptoBreif falls back to real SoDEX testnet market prices for supported symbols and clearly labels the briefing as partial.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- SoSoValue OpenAPI
- Telegram Bot API
- SoDEX REST API testnet market endpoints
- Vercel-ready serverless API routes

## API Routes

- `POST /api/briefing` - generates a personalized briefing from portfolio input.
- `POST /api/chat` - answers follow-up questions with fresh market context.
- `GET /api/health` - checks SoSoValue, OpenAI, Telegram, and SoDEX configuration status.
- `GET /api/sodex/markets` - returns public SoDEX testnet spot market tickers.
- `POST /api/telegram/send` - sends the current briefing through Telegram.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
SOSOVALUE_API_KEY=your_sosovalue_api_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
SODEX_SPOT_BASE_URL=https://testnet-gw.sodex.dev/api/v1/spot
```

Telegram delivery needs a bot token and chat id. A Telegram bot cannot reliably send to a user handle until that user starts the bot and the app knows the numeric chat id.

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
```

The app has also been tested against live local API routes for health, briefing generation, follow-up answers, and SoDEX market data.

## Demo Flow

1. Open the app.
2. Keep the sample portfolio or enter BTC, ETH, SOL, or any SoSoValue-listed assets.
3. Click `Generate briefing`.
4. Show the live preview with price, news, ETF, macro, and SoDEX context.
5. Ask: `Should I be worried about anything today?`
6. If Telegram credentials are configured, click `Send Telegram` for the live delivery moment.

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

## Roadmap To Wave 3

### Wave 2

- Scheduled daily and evening delivery.
- Telegram webhook for interactive replies.
- Email delivery.
- Wallet connect for automatic portfolio detection.
- Briefing history dashboard.
- Token unlock and event calendar expansion.
- SoDEX testnet signed order preview.
- User notification controls.

### Wave 3

- SoDEX mainnet one-tap trading after explicit user approval.
- WhatsApp and Discord delivery channels.
- Full mobile PWA.
- Weekly performance review briefings.
- Group briefings for investment clubs.
- AI preference learning from user follow-ups.
- Security review, rate-limit hardening, and production documentation.

## Safety Notes

CryptoBreif is informational software, not financial advice. Trade execution should always require an explicit user approval and a signed SoDEX order. API keys must stay in environment variables and should never be committed to source control.
