import { NextResponse } from "next/server";
import { APIError } from "openai";
import { z } from "zod";
import { boardAnalysisResponseSchema } from "@/lib/suggestionSchema";
import { extractJsonCandidate } from "@/lib/parseModelJson";
import {
  createOpenRouterClient,
  DEFAULT_OPENROUTER_MODEL,
} from "@/lib/openrouterClient";

function upstreamErrorBody(e: unknown): Record<string, unknown> {
  if (e instanceof APIError) {
    return {
      detail: e.message,
      upstreamStatus: e.status ?? null,
      upstreamError: e.error ?? null,
    };
  }
  if (e instanceof Error) return { detail: e.message };
  return { detail: String(e) };
}

type AssistantRead =
  | { kind: "text"; text: string }
  | { kind: "refusal"; text: string }
  | { kind: "empty" };

function readAssistant(completion: {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
  }>;
}): AssistantRead {
  const msg = completion.choices?.[0]?.message;
  if (msg?.refusal?.trim()) return { kind: "refusal", text: msg.refusal };
  const c = msg?.content?.trim();
  if (c) return { kind: "text", text: c };
  return { kind: "empty" };
}

function refusalResponse(text: string) {
  return NextResponse.json(
    { error: "Model refused", detail: text },
    { status: 502 },
  );
}

const workItemInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  column: z.enum(["todo", "inprogress", "done"]),
});

const requestSchema = z.object({
  transcript: z.string(),
  workItems: z.array(workItemInputSchema),
});

const SYSTEM = `You extract execution-oriented updates for a work board from meeting notes.
Return ONLY valid JSON with this shape:
{
  "suggestions": [ ... ],
  "globalGaps": string[]   // optional; transcript-level missing/unclear items not tied to one card
}

Each element of "suggestions" is ONE of:

1) Update an EXISTING card (must use an id from the board list):
{ "kind": "update", "workItemId": "<id>", "description"?: string, "criteriaAdditions"?: string[], "gaps"?: string[], "rationale"?: string }
- NEVER change or output a new title for existing cards. Do not include a "title" field on updates.
- If "description" is present, it is the FULL replacement body for that card's description (not a patch sentence).
- "criteriaAdditions": new acceptance criteria bullets to ADD (do not repeat existing criteria verbatim).
- You may emit multiple "update" objects for different workItemIds when the meeting covers multiple cards.

2) Create a NEW card when the meeting clearly implies work that does not match any existing card:
{ "kind": "create", "title": string, "description": string, "acceptanceCriteria": string[], "column": "todo"|"inprogress"|"done", "rationale"?: string }

Rules:
- Map discussion to cards by matching topics to titles/descriptions/criteria. Use workItemId exactly as given.
- If nothing applies, return { "suggestions": [] } (and optional globalGaps).
- Be concise. Do not write a meeting summary.`;

function filterSuggestions(
  workItemIds: Set<string>,
  raw: z.infer<typeof boardAnalysisResponseSchema>,
): z.infer<typeof boardAnalysisResponseSchema> {
  const suggestions = raw.suggestions.filter((s) => {
    if (s.kind === "create") return true;
    return workItemIds.has(s.workItemId);
  });
  return { ...raw, suggestions };
}

export async function POST(req: Request) {
  const client = createOpenRouterClient();
  if (!client) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set" },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { transcript, workItems } = parsed.data;
  const idSet = new Set(workItems.map((w) => w.id));

  const boardList = workItems
    .map(
      (w) =>
        `id=${w.id}
title=${w.title}
description=${w.description}
column=${w.column}
acceptanceCriteria:
${w.acceptanceCriteria.map((c) => `  - ${c}`).join("\n")}`,
    )
    .join("\n\n---\n\n");

  const user = `Current board (reference by id on updates):\n\n${boardList}\n\nMeeting notes:\n${transcript}`;

  const model =
    process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;

  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: user },
  ];

  const runChat = (jsonObjectMode: boolean) =>
    client.chat.completions.create({
      model,
      ...(jsonObjectMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    });

  try {
    let content: string | undefined;

    try {
      const completion = await runChat(true);
      const r = readAssistant(completion);
      if (r.kind === "refusal") return refusalResponse(r.text);
      if (r.kind === "text") content = r.text;
    } catch (e: unknown) {
      const authFail =
        e instanceof APIError && (e.status === 401 || e.status === 403);
      if (authFail) {
        return NextResponse.json(
          { error: "Upstream model error", ...upstreamErrorBody(e) },
          { status: 502 },
        );
      }
      try {
        const completion = await runChat(false);
        const r = readAssistant(completion);
        if (r.kind === "refusal") return refusalResponse(r.text);
        if (r.kind === "text") content = r.text;
      } catch (e2: unknown) {
        return NextResponse.json(
          { error: "Upstream model error", ...upstreamErrorBody(e2) },
          { status: 502 },
        );
      }
    }

    if (!content) {
      try {
        const completion = await runChat(false);
        const r = readAssistant(completion);
        if (r.kind === "refusal") return refusalResponse(r.text);
        if (r.kind === "text") content = r.text;
      } catch {
        /* ignore */
      }
    }

    if (!content) {
      return NextResponse.json(
        { error: "Empty model response" },
        { status: 502 },
      );
    }

    const jsonStr = extractJsonCandidate(content);
    let raw: unknown;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        {
          error: "Model did not return JSON",
          preview: content.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const out = boardAnalysisResponseSchema.safeParse(raw);
    if (!out.success) {
      const detail = out.error.issues
        .slice(0, 6)
        .map((i) => i.message)
        .join("; ");
      return NextResponse.json(
        { error: "Model JSON did not match schema", detail },
        { status: 502 },
      );
    }

    const filtered = filterSuggestions(idSet, out.data);
    return NextResponse.json(filtered);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
