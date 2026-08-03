import { protectedProcedure } from "../index";

const PROVIDER_NAMES: Record<string, string> = {
  alibaba: "Alibaba",
  anthropic: "Anthropic",
  databricks: "Databricks",
  deepseek: "DeepSeek",
  google: "Google",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral",
  openai: "OpenAI",
  qwen: "Qwen",
};

interface GatewayModel {
  id: string;
  name: string;
  owned_by: string;
  enabled: boolean;
}

export interface AiModel {
  id: string;
  name: string;
  provider: string;
  /** Supports reasoning_effort (per models.dev's neon provider metadata). */
  reasoning: boolean;
  /**
   * reasoning_effort values the gateway accepts for this model; "none"
   * disables thinking server-side. Empty for non-reasoning models.
   */
  efforts: string[];
}

/**
 * Per-family reasoning_effort support, verified against the live gateway
 * 2026-07-22 (every value probed per model; "max" is real nowhere).
 * The gateway's /v1/models exposes no capability flags, so this is the
 * machine-verified table until it does.
 */
const EFFORT_SUPPORT: [RegExp, string[]][] = [
  [/^(gpt-oss-|qwen35-)/, ["none", "minimal", "low", "medium", "high"]],
  [/^gpt-5(-mini|-nano)?$/, ["minimal", "low", "medium", "high"]],
  [/^gpt-5-1$/, ["none", "low", "medium", "high"]],
  [/^(gpt-5-2|gpt-5-4)/, ["none", "low", "medium", "high", "xhigh"]],
];

const effortsFor = (id: string): string[] =>
  EFFORT_SUPPORT.find(([rule]) => rule.test(id))?.[1] ?? [];

/**
 * The gateway's "enabled" flag doesn't mean chat-capable: codex models are
 * responses-endpoint only, and some gemini routes 400/404 upstream (verified
 * empirically 2026-07). Until the gateway exposes per-endpoint support,
 * filter the known-broken shapes so the composer only offers models the
 * agent can actually run.
 */
const UNCHATTABLE = [
  // gemini-3-pro 404s upstream; gemini-2-5-* endpoints are deprecated
  // (400); gemini-3-flash serves but tool loops still 400 on the replay
  // leg without its thoughtSignature echoed (all re-verified 2026-07-22).
  /^gemini-/,
];
// codex variants and gpt-oss-*/qwen35-* used to be filtered here: the former
// are Responses-only, the latter stream array-shaped content. @neon/ai-sdk-
// provider routes each id to the endpoint it is served on and normalizes the
// array shape, so both are chat-capable now.

/**
 * Models available on the branch's Neon AI Gateway, shaped for ModelSelect.
 * Only enabled, chat-capable models are returned — the composer should
 * offer exactly what the agent will accept. Empty when unconfigured.
 */
export const modelsRouter = {
  list: protectedProcedure.handler(async (): Promise<AiModel[]> => {
    const base = process.env.NEON_AI_GATEWAY_BASE_URL;
    const token = process.env.NEON_AI_GATEWAY_TOKEN;
    if (!(base && token)) {
      return [];
    }

    const res = await fetch(`${base.replace(/\/+$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as { data: GatewayModel[] };
    return data.data
      .filter((m) => m.enabled && !UNCHATTABLE.some((rule) => rule.test(m.id)))
      .map((m) => {
        const efforts = effortsFor(m.id);
        return {
          id: m.id,
          name: m.name || m.id,
          provider: PROVIDER_NAMES[m.owned_by] ?? m.owned_by,
          reasoning: efforts.length > 0,
          efforts,
        };
      });
  }),
};
