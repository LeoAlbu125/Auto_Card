import { z } from "zod";

const columnIdSchema = z.enum(["todo", "inprogress", "done"]);

export const boardUpdateSuggestionSchema = z.object({
  kind: z.literal("update"),
  workItemId: z.string(),
  description: z.string().optional(),
  criteriaAdditions: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  rationale: z.string().optional(),
});

export const boardCreateSuggestionSchema = z.object({
  kind: z.literal("create"),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  column: columnIdSchema,
  rationale: z.string().optional(),
});

export const boardSuggestionSchema = z.discriminatedUnion("kind", [
  boardUpdateSuggestionSchema,
  boardCreateSuggestionSchema,
]);

export const boardAnalysisResponseSchema = z.object({
  suggestions: z.array(boardSuggestionSchema),
  globalGaps: z.array(z.string()).optional(),
});

export type BoardAnalysisPayload = z.infer<typeof boardAnalysisResponseSchema>;
