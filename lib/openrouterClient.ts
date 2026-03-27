import OpenAI from "openai";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Server-only OpenRouter client (OpenAI-compatible API).
 * Set {@link process.env.OPENROUTER_API_KEY} in `.env.local`.
 */
export function createOpenRouterClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const headers: Record<string, string> = {};
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  return new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    defaultHeaders: Object.keys(headers).length ? headers : undefined,
  });
}

export const DEFAULT_OPENROUTER_MODEL = "stepfun/step-3.5-flash:free";
