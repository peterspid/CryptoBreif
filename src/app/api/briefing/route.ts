import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { generateAiBriefing } from "@/lib/briefing";
import { BriefingRequestSchema } from "@/lib/schemas";
import { buildSodexFallbackContext } from "@/lib/sodex";
import { buildMarketContext } from "@/lib/sosovalue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = BriefingRequestSchema.parse(body);
    let context;

    try {
      context = await buildMarketContext(profile);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SoSoValue request failed.";

      if (!message.includes("429") && !message.toLowerCase().includes("rate")) {
        throw error;
      }

      context = await buildSodexFallbackContext(profile, message);
    }

    const briefing = await generateAiBriefing(context);

    return NextResponse.json({
      ok: true,
      briefing,
      context,
    });
  } catch (error) {
    return apiError(error);
  }
}
