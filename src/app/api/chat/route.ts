import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { answerFollowUp } from "@/lib/briefing";
import { ChatRequestSchema } from "@/lib/schemas";
import { buildSodexFallbackContext } from "@/lib/sodex";
import { buildMarketContext } from "@/lib/sosovalue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = ChatRequestSchema.parse(body);
    let context;

    try {
      context = await buildMarketContext(payload.portfolio);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SoSoValue request failed.";

      if (!message.includes("429") && !message.toLowerCase().includes("rate")) {
        throw error;
      }

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
