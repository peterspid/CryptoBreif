import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError } from "./env";
import { publicErrorMessage } from "./errors";

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

  const errorStatus =
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;
  const status =
    errorStatus ??
    (error instanceof ConfigError
      ? error.status
      : error instanceof Error && error.message.includes("not configured")
        ? 500
        : 502);

  return NextResponse.json(
    {
      ok: false,
      error: publicErrorMessage(error, "Unexpected API error"),
    },
    { status },
  );
}
