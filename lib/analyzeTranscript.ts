import type {
  BoardAnalysisResult,
  BoardCreateSuggestion,
  BoardSuggestion,
  BoardUpdateSuggestion,
  WorkItem,
} from "./types";
import { DEMO_TRANSCRIPT } from "./seed";

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesDemoTranscript(transcript: string): boolean {
  const a = normalize(transcript);
  const b = normalize(DEMO_TRANSCRIPT);
  if (a === b) return true;
  const needles = [
    "validation",
    "payment api",
    "null",
    "response format",
  ];
  return needles.every((n) => a.includes(n));
}

function scoreWorkItemMatch(t: string, w: WorkItem): number {
  const words = t.split(/\s+/).filter((x) => x.length > 2);
  const blob = `${w.title} ${w.description}`.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (blob.includes(word)) score += 1;
  }
  if (t.includes(w.title.toLowerCase())) score += 3;
  return score;
}

function bestWorkItemForLine(line: string, workItems: WorkItem[]): WorkItem | null {
  const t = line.toLowerCase();
  let best: WorkItem | null = null;
  let bestScore = 0;
  for (const w of workItems) {
    const s = scoreWorkItemMatch(t, w);
    if (s > bestScore) {
      bestScore = s;
      best = w;
    }
  }
  return bestScore >= 1 ? best : null;
}

function heuristicLineToAdditions(line: string): { additions: string[]; gaps: string[] } {
  const additions: string[] = [];
  const gaps: string[] = [];
  const actionRe =
    /^(?:we need to|need to|must|should|add|implement|handle|clarify|define|let's|lets)\s+(.+)/i;
  const m = line.match(actionRe);
  const chunk = m ? m[1] : line;
  const cleaned = chunk.replace(/^[,:\s]+/, "").replace(/\s+$/, "");
  if (cleaned.length < 6) return { additions, gaps };
  const lower = cleaned.toLowerCase();
  if (
    lower.includes("error") &&
    (lower.includes("missing") ||
      lower.includes("handle") ||
      lower.includes("define"))
  ) {
    gaps.push(`${cleaned} (needs definition)`);
    return { additions, gaps };
  }
  if (
    lower.includes("unclear") ||
    lower.includes("tbd") ||
    lower.includes("not defined")
  ) {
    gaps.push(cleaned);
    return { additions, gaps };
  }
  additions.push(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
  return { additions, gaps };
}

const CREATE_HINTS =
  /(?:new card|spin up|new ticket|new work item|create (?:a )?card|track (?:a )?separate|follow[- ]up ticket)\s*[—\-:]?\s*(.+)/i;

function heuristicBoardFromTranscript(
  transcript: string,
  workItems: WorkItem[],
): BoardAnalysisResult {
  const lines = transcript
    .split(/[\n.]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const byId = new Map<string, { additions: string[]; gaps: string[] }>();
  const creates: BoardCreateSuggestion[] = [];
  const globalGaps: string[] = [];

  for (const w of workItems) {
    byId.set(w.id, { additions: [], gaps: [] });
  }

  for (const line of lines) {
    const createMatch = line.match(CREATE_HINTS);
    if (createMatch) {
      const topic = createMatch[1]?.trim() ?? "New follow-up from meeting";
      const title =
        topic.length > 60 ? `${topic.slice(0, 57)}…` : topic;
      creates.push({
        kind: "create",
        title: title.charAt(0).toUpperCase() + title.slice(1),
        description: `Discussed in meeting: ${topic}`,
        acceptanceCriteria: ["Scope and acceptance criteria to be refined"],
        column: "todo",
        rationale: "Detected as new work not mapped to an existing card.",
      });
      continue;
    }

    const { additions, gaps } = heuristicLineToAdditions(line);
    const target = bestWorkItemForLine(line, workItems);
    if (target && (additions.length > 0 || gaps.length > 0)) {
      const bucket = byId.get(target.id)!;
      bucket.additions.push(...additions);
      bucket.gaps.push(...gaps);
    } else if (additions.length > 0 || gaps.length > 0) {
      globalGaps.push(...additions, ...gaps);
    }
  }

  const dedupe = (xs: string[]) => [...new Set(xs)];

  const suggestions: BoardSuggestion[] = [];

  for (const w of workItems) {
    const b = byId.get(w.id)!;
    const add = dedupe(b.additions).slice(0, 8);
    const gap = dedupe(b.gaps).slice(0, 5);
    if (add.length === 0 && gap.length === 0) continue;
    const u: BoardUpdateSuggestion = {
      kind: "update",
      workItemId: w.id,
      criteriaAdditions: add.length ? add : undefined,
      gaps: gap.length ? gap : undefined,
    };
    suggestions.push(u);
  }

  suggestions.push(...creates);

  const gg = dedupe(globalGaps).slice(0, 8);

  if (suggestions.length === 0 && gg.length === 0) {
    return {
      suggestions: [
        {
          kind: "update",
          workItemId: workItems[0]?.id ?? "wi-1",
          criteriaAdditions: [
            `Capture requirements from the meeting as acceptance criteria`,
          ],
          gaps: [
            "No concrete action items detected — add explicit needs to the transcript",
          ],
        },
      ],
    };
  }

  return {
    suggestions,
    globalGaps: gg.length ? gg : undefined,
  };
}

const CANNED_PAYMENT_UPDATE: BoardUpdateSuggestion = {
  kind: "update",
  workItemId: "wi-1",
  criteriaAdditions: [
    "Add validation for currency format",
    "Handle null input edge case",
    "Clarify API response structure",
  ],
  gaps: ["Error handling definition"],
  rationale:
    "Derived from discussion about payment API validation, null handling, and response shape.",
};

/**
 * Offline analyzer: deterministic for the demo transcript; lightweight heuristics otherwise.
 */
export function analyzeBoardLocal(
  transcript: string,
  workItems: WorkItem[],
): BoardAnalysisResult {
  const t = transcript.trim();
  if (!t) {
    return {
      suggestions: [],
      globalGaps: ["Paste meeting notes to analyze"],
    };
  }

  if (matchesDemoTranscript(t)) {
    const payment = workItems.find((w) =>
      w.title.toLowerCase().includes("payment"),
    );
    const rest: BoardSuggestion[] = [];
    if (payment) {
      rest.push({ ...CANNED_PAYMENT_UPDATE, workItemId: payment.id });
    } else {
      rest.push(CANNED_PAYMENT_UPDATE);
    }

    const auth = workItems.find((w) => w.title.toLowerCase().includes("auth"));
    if (auth && /auth|mfa|session|oauth|login/i.test(t)) {
      rest.push({
        kind: "update",
        workItemId: auth.id,
        criteriaAdditions: [
          "Document OAuth/session edge cases mentioned in the meeting",
        ],
        gaps: [],
        rationale: "Transcript mentions authentication-related work.",
      });
    }

    if (/invoice|csv|export|finance/i.test(t)) {
      rest.push({
        kind: "create",
        title: "Invoice CSV export",
        description: "Finance requested exporting invoices to CSV.",
        acceptanceCriteria: [
          "Export includes required invoice fields",
          "CSV format agreed with finance",
        ],
        column: "todo",
        rationale: "New scope called out in the meeting.",
      });
    }

    return { suggestions: rest };
  }

  return heuristicBoardFromTranscript(t, workItems);
}
