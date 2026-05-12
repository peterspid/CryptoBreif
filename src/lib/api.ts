import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError } from "./env";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.issues.map((issue) => issue.message).join("; "),
      },
      { status: 400 },
    );
  }

  const status =
    error instanceof ConfigError
      ? error.status
      : error instanceof Error && error.message.includes("not configured")
        ? 500
        : 502;

  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected API error",
    },
    { status },
  );
}
