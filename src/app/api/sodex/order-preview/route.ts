import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/route-guard";
import { SodexOrderPreviewSchema } from "@/lib/schemas";
import { buildSodexOrderPreview, getSodexSpotTickers } from "@/lib/sodex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "sodex-order-preview",
      limit: 20,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = await request.json();
    const payload = SodexOrderPreviewSchema.parse(body);
    const tickers = await getSodexSpotTickers();
    const preview = buildSodexOrderPreview(payload, tickers);

    return NextResponse.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return apiError(error);
  }
}
