export type ColumnId = "todo" | "inprogress" | "done";

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  column: ColumnId;
}

/** Existing card: never change title; optional full description replace + AC additions. */
export interface BoardUpdateSuggestion {
  kind: "update";
  workItemId: string;
  description?: string;
  criteriaAdditions?: string[];
  gaps?: string[];
  rationale?: string;
}

/** New card grounded in the transcript (title allowed only here). */
export interface BoardCreateSuggestion {
  kind: "create";
  title: string;
  description: string;
  acceptanceCriteria: string[];
  column: ColumnId;
  rationale?: string;
}

export type BoardSuggestion = BoardUpdateSuggestion | BoardCreateSuggestion;

export interface BoardAnalysisResult {
  suggestions: BoardSuggestion[];
  globalGaps?: string[];
}

export const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: "To Do",
  inprogress: "In Progress",
  done: "Done",
};
