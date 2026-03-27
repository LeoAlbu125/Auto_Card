"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  COLUMN_LABELS,
  type BoardCreateSuggestion,
  type BoardSuggestion,
  type BoardUpdateSuggestion,
  type ColumnId,
  type WorkItem,
} from "@/lib/types";
import { DEMO_TRANSCRIPT, INITIAL_WORK_ITEMS } from "@/lib/seed";
import { runAnalysis } from "@/lib/runAnalysis";
import { analyzeBoardLocal } from "@/lib/analyzeTranscript";

const COLUMNS: ColumnId[] = ["todo", "inprogress", "done"];

function mergeCriteria(base: string[], additions: string[]): string[] {
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const next = [...base];
  for (const a of additions) {
    const k = a.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      next.push(a);
    }
  }
  return next;
}

function cloneBoard(items: WorkItem[]): WorkItem[] {
  return items.map((w) => ({
    ...w,
    acceptanceCriteria: [...w.acceptanceCriteria],
  }));
}

function applyUpdate(item: WorkItem, sug: BoardUpdateSuggestion): WorkItem {
  return {
    ...item,
    description:
      sug.description !== undefined ? sug.description : item.description,
    acceptanceCriteria: mergeCriteria(
      item.acceptanceCriteria,
      sug.criteriaAdditions ?? [],
    ),
  };
}

function newWorkItemFromCreate(sug: BoardCreateSuggestion): WorkItem {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `wi-${crypto.randomUUID()}`
      : `wi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    title: sug.title,
    description: sug.description,
    acceptanceCriteria: [...sug.acceptanceCriteria],
    column: sug.column,
  };
}

function suggestionHeading(
  sug: BoardSuggestion,
  snapshot: WorkItem[] | null,
): string {
  if (sug.kind === "create") {
    return `New card: ${sug.title}`;
  }
  const w = snapshot?.find((x) => x.id === sug.workItemId);
  return `Update: ${w?.title ?? sug.workItemId}`;
}

export function MeetingDemo() {
  const [workItems, setWorkItems] = useState<WorkItem[]>(INITIAL_WORK_ITEMS);
  const [selectedId, setSelectedId] = useState("wi-1");
  const [transcript, setTranscript] = useState(DEMO_TRANSCRIPT);

  const [pendingSuggestions, setPendingSuggestions] = useState<
    BoardSuggestion[]
  >(() => {
    const first = analyzeBoardLocal(DEMO_TRANSCRIPT, INITIAL_WORK_ITEMS);
    return first.suggestions;
  });
  const [globalGaps, setGlobalGaps] = useState<string[]>(() => {
    const first = analyzeBoardLocal(DEMO_TRANSCRIPT, INITIAL_WORK_ITEMS);
    return first.globalGaps ?? [];
  });
  const [boardSnapshot, setBoardSnapshot] = useState<WorkItem[] | null>(() =>
    cloneBoard(INITIAL_WORK_ITEMS),
  );

  const [analyzing, setAnalyzing] = useState(false);
  const [useRemoteLlm, setUseRemoteLlm] = useState(false);
  const [lastSource, setLastSource] = useState<"local" | "remote" | null>(
    "local",
  );
  const [remoteNote, setRemoteNote] = useState<string | null>(null);

  const pendingRef = useRef(pendingSuggestions);
  pendingRef.current = pendingSuggestions;

  const selected = useMemo(
    () => workItems.find((w) => w.id === selectedId) ?? workItems[0],
    [workItems, selectedId],
  );

  const resolveBeforeItem = useCallback(
    (workItemId: string): WorkItem | undefined =>
      boardSnapshot?.find((w) => w.id === workItemId),
    [boardSnapshot],
  );

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setRemoteNote(null);
    try {
      setBoardSnapshot(cloneBoard(workItems));
      const { analysis, source, remoteError } = await runAnalysis(transcript, {
        useRemoteLlm,
        workItems,
      });
      setPendingSuggestions(analysis.suggestions);
      setGlobalGaps(analysis.globalGaps ?? []);
      setLastSource(source);
      if (useRemoteLlm && source === "local") {
        setRemoteNote(
          remoteError
            ? `Live AI failed — ${remoteError}. Using local analyzer.`
            : "Live AI unavailable (missing OPENROUTER_API_KEY in .env.local, network error, or invalid response). Using local analyzer.",
        );
      }
    } finally {
      setAnalyzing(false);
    }
  }, [transcript, useRemoteLlm, workItems]);

  const handleAcceptOne = useCallback((index: number) => {
    const list = pendingRef.current;
    const sug = list[index];
    if (!sug) return;

    if (sug.kind === "update") {
      setWorkItems((items) =>
        items.map((w) => (w.id === sug.workItemId ? applyUpdate(w, sug) : w)),
      );
    } else {
      setWorkItems((items) => [...items, newWorkItemFromCreate(sug)]);
    }

    setPendingSuggestions((l) => l.filter((_, i) => i !== index));
  }, []);

  const handleAcceptAll = useCallback(() => {
    setWorkItems((items) => {
      let next = items;
      for (const sug of pendingSuggestions) {
        if (sug.kind === "update") {
          next = next.map((w) =>
            w.id === sug.workItemId ? applyUpdate(w, sug) : w,
          );
        } else {
          next = [...next, newWorkItemFromCreate(sug)];
        }
      }
      return next;
    });
    setPendingSuggestions([]);
    setGlobalGaps([]);
  }, [pendingSuggestions]);

  const handleDismissOne = useCallback((index: number) => {
    setPendingSuggestions((list) => list.filter((_, i) => i !== index));
  }, []);

  const handleRejectAll = useCallback(() => {
    setPendingSuggestions([]);
    setGlobalGaps([]);
    setBoardSnapshot(null);
  }, []);

  const hasPending = pendingSuggestions.length > 0 || globalGaps.length > 0;

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div
          className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-[var(--muted)]">
            <span className="font-semibold text-amber-400/90">
              Showcase prototype
            </span>
            {" — "}
            Not connected to real meetings or Azure DevOps. For product
            illustration only.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Meeting decisions → work item updates
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Capture discussion; review suggested updates per card or new cards.
            Existing titles are never changed—only descriptions and acceptance
            criteria, or brand-new cards.
          </p>
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Meeting input
            </h2>
            <textarea
              className="mt-3 h-40 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={useRemoteLlm}
                  onChange={(e) => setUseRemoteLlm(e.target.checked)}
                  className="size-4 rounded border-[var(--border)]"
                />
                Live AI (OpenRouter via server)
              </label>
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={analyzing}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-muted)] disabled:opacity-50"
              >
                {analyzing ? "Analyzing…" : "Analyze transcript"}
              </button>
            </div>
            {remoteNote ? (
              <p className="mt-2 text-sm text-amber-400/90">{remoteNote}</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Mock board
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {COLUMNS.map((col) => (
                <div key={col} className="min-h-[140px]">
                  <div className="mb-2 text-center text-xs font-medium text-[var(--muted)]">
                    {COLUMN_LABELS[col]}
                  </div>
                  <div className="flex flex-col gap-2">
                    {workItems
                      .filter((w) => w.column === col)
                      .map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedId(w.id)}
                          className={`rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                            w.id === selectedId
                              ? "border-[var(--accent)] bg-[var(--surface-hover)] ring-1 ring-[var(--accent)]"
                              : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--muted)]"
                          }`}
                        >
                          {w.title}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Ticket
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Selected: {selected.title}
            </p>
            <h3 className="mt-4 text-lg font-semibold">{selected.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {selected.description}
            </p>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Acceptance criteria
            </h4>
            <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-sm">
              {selected.acceptanceCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                Suggested updates
              </h2>
              {lastSource ? (
                <span className="rounded bg-[var(--bg)] px-2 py-0.5 font-mono text-xs text-[var(--muted)]">
                  {lastSource === "remote" ? "Live AI" : "Local demo"}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-amber-400/80">
              Illustrative AI-style suggestions for demo purposes only.
            </p>

            {globalGaps.length > 0 ? (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
                <h3 className="text-xs font-semibold text-[var(--warning)]">
                  Board-level gaps
                </h3>
                <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                  {globalGaps.map((g, i) => (
                    <li key={i}>
                      <span className="text-[var(--warning)]">⚠ </span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!hasPending ? (
              <p className="mt-6 text-sm text-[var(--muted)]">
                Run <strong>Analyze transcript</strong> to see proposed changes
                across cards.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {pendingSuggestions.map((sug, index) => (
                  <div
                    key={`${sug.kind}-${index}-${sug.kind === "update" ? sug.workItemId : sug.title}`}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3"
                  >
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      {suggestionHeading(sug, boardSnapshot)}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                      {sug.kind === "update"
                        ? `id=${sug.workItemId}`
                        : `column=${sug.column}`}
                    </p>

                    {sug.rationale ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {sug.rationale}
                      </p>
                    ) : null}

                    {sug.kind === "update" ? (
                      <UpdateSuggestionBody
                        sug={sug}
                        before={resolveBeforeItem(sug.workItemId)}
                      />
                    ) : (
                      <CreateSuggestionBody sug={sug} />
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptOne(index)}
                        className="rounded-md bg-[var(--success)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissOne(index)}
                        className="rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}

                {pendingSuggestions.length > 1 ? (
                  <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                    <button
                      type="button"
                      onClick={handleAcceptAll}
                      className="rounded-md bg-[var(--success)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
                    >
                      Accept all
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectAll}
                      className="rounded-md border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      Dismiss all
                    </button>
                  </div>
                ) : pendingSuggestions.length === 1 ||
                  (pendingSuggestions.length === 0 &&
                    globalGaps.length > 0) ? (
                  <button
                    type="button"
                    onClick={handleRejectAll}
                    className="rounded-md border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Dismiss all
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function UpdateSuggestionBody({
  sug,
  before,
}: {
  sug: BoardUpdateSuggestion;
  before: WorkItem | undefined;
}) {
  const add = sug.criteriaAdditions ?? [];
  const afterCriteria = before
    ? mergeCriteria(before.acceptanceCriteria, add)
    : add;
  const afterDesc =
    sug.description !== undefined
      ? sug.description
      : before?.description ?? "";

  return (
    <div className="mt-3 space-y-3 text-sm">
      {add.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold text-[var(--success)]">
            Criteria additions
          </h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {add.map((a, i) => (
              <li key={i}>
                <span className="text-[var(--success)]">+ </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sug.description !== undefined && before ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
              Description before
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {before.description}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-[var(--success)]">
              After accept
            </p>
            <p className="mt-1 text-xs">{afterDesc}</p>
          </div>
        </div>
      ) : null}

      {(sug.gaps ?? []).length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold text-[var(--warning)]">
            Missing / unclear
          </h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {(sug.gaps ?? []).map((g, i) => (
              <li key={i}>
                <span className="text-[var(--warning)]">⚠ </span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {before && add.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
            Acceptance criteria preview
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ul className="list-inside list-disc font-mono text-xs text-[var(--muted)]">
              {before.acceptanceCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <ul className="list-inside list-disc font-mono text-xs">
              {afterCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateSuggestionBody({ sug }: { sug: BoardCreateSuggestion }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-xs text-[var(--muted)]">{sug.description}</p>
      <h4 className="text-xs font-semibold text-[var(--muted)]">
        Acceptance criteria
      </h4>
      <ul className="list-inside list-disc font-mono text-xs">
        {sug.acceptanceCriteria.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
