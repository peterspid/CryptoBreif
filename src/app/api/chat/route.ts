import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { answerFollowUp } from "@/lib/briefing";
import { ChatRequestSchema } from "@/lib/schemas";
import { buildSodexFallbackContext } from "@/lib/sodex";
import { buildMarketContext } from "@/lib/sosovalue";
import { rateLimit } from "@/lib/route-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "chat",
      limit: 4,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = await request.json();
    const payload = ChatRequestSchema.parse(body);
    let context;

    try {
      context = await buildMarketContext(payload.portfolio);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SoSoValue request failed.";

      context = await buildSodexFallbackContext(payload.portfolio, message);
    }

    const answer = await answerFollowUp(
      context,
      payload.question,
      payload.previousBriefing,
    );

    return NextResponse.json({
      ok: true,
      answer,
      context,
    });
  } catch (error) {
    return apiError(error);
  }
}
