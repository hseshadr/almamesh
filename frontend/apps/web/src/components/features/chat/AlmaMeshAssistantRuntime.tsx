import { useCallback, useMemo, type PropsWithChildren } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';

import type { ChatMessage } from '@almamesh/shared-types';

interface ConvertOptions {
  readonly streaming?: boolean;
}

/** Convert the app's durable chat contract into assistant-ui's presentation contract. */
export function convertChatMessage(
  message: ChatMessage,
  options: ConvertOptions = {},
): ThreadMessageLike {
  const streaming = options.streaming === true;
  const createdAt = new Date(message.created_at);
  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    createdAt: Number.isNaN(createdAt.valueOf()) ? new Date(0) : createdAt,
    ...(message.role === 'assistant'
      ? { status: streaming ? ({ type: 'running' } as const) : ({ type: 'complete', reason: 'stop' } as const) }
      : {}),
    metadata: {
      custom: {
        error: message.error === true,
        streaming,
      },
    },
  };
}

type ComposerPayload = Pick<AppendMessage, 'content'>;

/** AlmaMesh intentionally accepts text-only chat input in this first runtime integration. */
export function textFromComposerMessage(message: ComposerPayload): string {
  const parts = message.content;
  if (parts.some((part) => part.type !== 'text')) {
    throw new Error('AlmaMesh chat is text-only.');
  }
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

export interface AlmaMeshAssistantRuntimeProps extends PropsWithChildren {
  readonly messages: readonly ChatMessage[];
  readonly streamingDraft: string;
  readonly isRunning: boolean;
  readonly isSendDisabled: boolean;
  readonly onSubmit: (question: string) => Promise<void>;
}

/**
 * A deliberately narrow assistant-ui ExternalStoreRuntime over AlmaMesh state.
 * The app store remains authoritative; assistant-ui owns presentation only.
 */
export function AlmaMeshAssistantRuntime({
  messages,
  streamingDraft,
  isRunning,
  isSendDisabled,
  onSubmit,
  children,
}: AlmaMeshAssistantRuntimeProps) {
  const runtimeMessages = useMemo(() => {
    const converted = messages.map((message) => convertChatMessage(message));
    if (!isRunning || streamingDraft.length === 0) {
      return converted;
    }
    const tailId = messages.at(-1)?.id ?? 'new-thread';
    const tailCreatedAt = messages.at(-1)?.created_at ?? new Date().toISOString();
    const synthetic: ChatMessage = {
      id: `stream:${tailId}`,
      thread_id: messages.at(-1)?.thread_id ?? 'pending',
      role: 'assistant',
      content: streamingDraft,
      created_at: tailCreatedAt,
    };
    return [...converted, convertChatMessage(synthetic, { streaming: true })];
  }, [isRunning, messages, streamingDraft]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = textFromComposerMessage(message).trim();
      if (text.length > 0) {
        await onSubmit(text);
      }
    },
    [onSubmit],
  );

  const runtime = useExternalStoreRuntime({
    messages: runtimeMessages,
    convertMessage: (message) => message,
    isRunning,
    isSendDisabled,
    onNew,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
