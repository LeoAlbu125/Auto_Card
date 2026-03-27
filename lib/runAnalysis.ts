import type { BoardAnalysisResult, WorkItem } from "./types";
import { analyzeBoardLocal } from "./analyzeTranscript";
import { boardAnalysisResponseSchema } from "./suggestionSchema";

export interface AnalysisOptions {
  useRemoteLlm: boolean;
  workItems: WorkItem[];
}

/**
 * Runs board-level analysis: optional POST to `/api/analyze` when `useRemoteLlm` is true;
 * falls back to {@link analyzeBoardLocal} on failure or when disabled.
 */
export async function runAnalysis(
  transcript: string,
  options: AnalysisOptions,
): Promise<{
  analysis: BoardAnalysisResult;
  source: "local" | "remote";
  /** Set when remote was requested but the API failed (for UI hints). */
  remoteError?: string;
}> {
  if (!options.useRemoteLlm) {
    return {
      analysis: analyzeBoardLocal(transcript, options.workItems),
      source: "local",
    };
  }

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        workItems: options.workItems.map((w) => ({
          id: w.id,
          title: w.title,
          description: w.description,
          acceptanceCriteria: w.acceptanceCriteria,
          column: w.column,
        })),
      }),
    });

    const payload: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const o =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const detail =
        typeof o.detail === "string" ? o.detail : `HTTP ${res.status}`;
      const errLabel = typeof o.error === "string" ? o.error : "API error";
      const extra: string[] = [];
      if (typeof o.upstreamStatus === "number") {
        extra.push(`upstream HTTP ${o.upstreamStatus}`);
      }
      if (o.upstreamError != null) {
        try {
          extra.push(JSON.stringify(o.upstreamError).slice(0, 400));
        } catch {
          extra.push(String(o.upstreamError).slice(0, 400));
        }
      }
      const suffix = extra.length ? ` — ${extra.join(" — ")}` : "";
      return {
        analysis: analyzeBoardLocal(transcript, options.workItems),
        source: "local",
        remoteError: `${errLabel}: ${detail}${suffix}`,
      };
    }

    const parsed = boardAnalysisResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        analysis: analyzeBoardLocal(transcript, options.workItems),
        source: "local",
        remoteError: "API returned JSON that did not match the expected schema",
      };
    }

    return { analysis: parsed.data, source: "remote" };
  } catch {
    return {
      analysis: analyzeBoardLocal(transcript, options.workItems),
      source: "local",
      remoteError: "Network error calling /api/analyze",
    };
  }
}
