const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]+/g,
  /SOSO-[A-Za-z0-9_-]+/g,
  /\bre_[A-Za-z0-9_-]{16,}\b/g,
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /\b[A-Za-z0-9_-]{40,}\b/g,
];

export function publicErrorMessage(error: unknown, fallback = "Unexpected error") {
  const raw = error instanceof Error ? error.message : String(error || fallback);

  return SECRET_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "[redacted]"),
    raw,
  );
}
