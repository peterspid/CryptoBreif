import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/route-guard";
import { getSodexSpotTickers } from "@/lib/sodex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "sodex-markets",
      limit: 60,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol") ?? undefined;
    const tickers = await getSodexSpotTickers(symbol);

    return NextResponse.json({
      ok: true,
      tickers,
    });
  } catch (error) {
    return apiError(error);
  }
}
