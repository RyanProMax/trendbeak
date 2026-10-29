export class SourceError extends Error {
  constructor(message: string, public readonly provider: string, public readonly phase: "http" | "timeout" | "network" | "json" | "shape", public readonly elapsedMs: number, public readonly status?: number) {
    super(message);
    this.name = "SourceError";
  }
}

/** Log bounded diagnostics, never user queries, headers or response bodies. */
export function reportSourceFailure(operation: string, provider: string, error: unknown, context: { market?: string; symbol?: string } = {}) {
  console.warn(JSON.stringify({
    event: "source_failure", operation, ...context,
    provider: error instanceof SourceError ? error.provider : provider,
    phase: error instanceof SourceError ? error.phase : "validation",
    status: error instanceof SourceError ? error.status : undefined,
    elapsedMs: error instanceof SourceError ? error.elapsedMs : undefined,
    reason: (error instanceof Error ? error.message : "Unknown source failure").slice(0, 180),
  }));
}
