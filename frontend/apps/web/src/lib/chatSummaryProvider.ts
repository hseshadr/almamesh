import {
  applyChatSettings,
  CHAT_SUMMARY_PROMPT_SCHEMA_VERSION,
  generateChatSummaryDraft,
  resolveProviderConfig,
  type ChatSummaryPlan,
  type LlmEnv,
} from '@almamesh/llm';
import type { ChatSummarizeFn, ChatSummaryGenerationResult } from '../hooks/useChatThread';

function readChatSummaryLlmEnv(): LlmEnv {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return applyChatSettings({
    VITE_LLM_API_BASE: env.VITE_LLM_API_BASE,
    VITE_LLM_API_KEY: env.VITE_LLM_API_KEY,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PRIVACY_MODE: env.VITE_LLM_PRIVACY_MODE,
    VITE_LLM_ENGINE: env.VITE_LLM_ENGINE,
  });
}

/**
 * Generate one optional rolling-memory draft with the same explicitly
 * configured chat provider. Planning, validation, and persistence stay local.
 */
function resolvedChatConfig() {
  const config = resolveProviderConfig(readChatSummaryLlmEnv());
  return config;
}

function configFingerprint(config: ReturnType<typeof resolvedChatConfig>): string {
  // Kept in memory only. Including the credential is intentional: rotating the
  // key invalidates a queued job just like changing endpoint/model/privacy.
  return JSON.stringify([
    config.engine,
    config.baseUrl,
    config.model,
    config.privacyMode,
    config.apiKey ?? '',
  ]);
}

/** Bind one immutable provider snapshot before a summary job is detached. */
export function prepareProviderChatSummary(): ChatSummarizeFn {
  const config = resolvedChatConfig();
  const fingerprint = configFingerprint(config);
  return async (
    plan: ChatSummaryPlan,
    signal?: AbortSignal,
  ): Promise<ChatSummaryGenerationResult> => {
    if (signal?.aborted || configFingerprint(resolvedChatConfig()) !== fingerprint) {
      throw new DOMException('Chat summary provider changed', 'AbortError');
    }
    return {
      draft: await generateChatSummaryDraft({
        plan,
        config,
        ...(signal === undefined ? {} : { signal }),
      }),
      generator: {
        kind: 'llm',
        model: config.model,
        prompt_schema_version: CHAT_SUMMARY_PROMPT_SCHEMA_VERSION,
      },
    };
  };
}

const generateWithCurrentProvider: ChatSummarizeFn = async (plan, signal) =>
  prepareProviderChatSummary()(plan, signal);

/** Back-compatible callable plus a synchronous binding hook used by chat. */
export const generateProviderChatSummary: ChatSummarizeFn = Object.assign(
  generateWithCurrentProvider,
  { prepare: prepareProviderChatSummary },
);
