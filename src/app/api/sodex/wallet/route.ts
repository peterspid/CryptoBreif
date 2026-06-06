import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/route-guard";
import { WalletImportSchema } from "@/lib/schemas";
import { getSodexSpotBalances } from "@/lib/sodex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      key: "sodex-wallet",
      limit: 12,
      windowMs: 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = await request.json();
    const payload = WalletImportSchema.parse(body);
    const holdings = await getSodexSpotBalances(
      payload.address,
      payload.accountId,
    );

    return NextResponse.json({
      ok: true,
      address: payload.address,
      holdings,
      warnings:
        holdings.length === 0
          ? ["No non-zero SoDEX spot balances were returned for this wallet."]
          : [],
    });
  } catch (error) {
    return apiError(error);
  }
}
