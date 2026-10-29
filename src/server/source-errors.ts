export class SourceError extends Error {
  recoveryAttempted = false;
  constructor(message: string, public readonly provider: string, public readonly phase: "http" | "timeout" | "network" | "json" | "shape", public readonly elapsedMs: number, public readonly status?: number, public readonly retryAfterMs = 0) {
    super(message);
    this.name = "SourceError";
  }
}

/** Log bounded diagnostics, never user queries, headers or response bodies. */
export function reportSourceFailure(operation: string, provider: string, error: unknown, context: { market?: string; symbol?: string; attempt?: number } = {}) {
  console.warn(JSON.stringify({
    event: "source_failure", operation, ...context,
    provider: error instanceof SourceError ? error.provider : provider,
    phase: error instanceof SourceError ? error.phase : "validation",
    status: error instanceof SourceError ? error.status : undefined,
    elapsedMs: error instanceof SourceError ? error.elapsedMs : undefined,
    reason: (error instanceof Error ? error.message : "Unknown source failure").slice(0, 180),
  }));
}

export function isTransientSourceFailure(error: unknown): error is SourceError {
  return error instanceof SourceError && !error.recoveryAttempted && error.retryAfterMs === 0 && (error.phase === "timeout" || error.phase === "network" ||
    (error.phase === "http" && error.status !== undefined && error.status >= 500 && error.status <= 599));
}
