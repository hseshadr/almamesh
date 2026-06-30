/**
 * ChatPanel - Full chat interface with PERSISTED, per-profile message history.
 *
 * Interactive chat for asking astrological questions. The conversation is no
 * longer ephemeral React-local state — it is backed by the IndexedDB chat store
 * (`@almamesh/store`) via `useChatThread`, so it survives reload / PWA reopen
 * and is scoped to the active profile + chart. Each finalized turn is also
 * indexed into `@almamesh/memory` for semantic search + RAG (best-effort).
 *
 * Mode-aware rendering:
 * - "For You" (layman) mode: bubble-style MessageBubble components
 * - "Astrologer" (technical) mode: document-style ReferenceEntry components
 *
 * Honest streaming UX: the typing dots show only until the FIRST token lands,
 * then yield to the live-streaming answer text (a single fast streaming pass).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatTurn } from '@almamesh/llm';
import { MessageBubble } from './MessageBubble';
import { ReferenceEntry } from './ReferenceEntry';
import { SuggestedQuestions } from './SuggestedQuestions';
import { ChatSearch } from './ChatSearch';
import type { SSEMetaData } from '../../../lib/streaming';
import type { ViewMode } from '../../../lib/types';
import { useChatThread, type ChatStreamInput } from '../../../hooks/useChatThread';

interface ChatPanelProps {
  personName: string;
  /** The active profile whose conversation is loaded + persisted. */
  profileId: string | null;
  /** The chart the conversation is opened from (links a fresh thread). */
  chartId: string | null;
  /** Current view mode - determines response style (plain English vs technical) */
  viewMode: ViewMode;
  /** Streaming question handler — wires `streamChartChat` with RAG context. */
  onAskQuestionStream: (
    question: string,
    onToken: (token: string) => void,
    onMeta: (meta: SSEMetaData) => void,
    viewMode?: ViewMode,
    history?: readonly ChatTurn[],
    retrievedContext?: readonly string[],
  ) => Promise<{
    answer: string;
    timing_guidance?: string | null;
    remedies?: string[] | null;
  }>;
  /** Hide header when used inside FloatingChatPanel which has its own header */
  hideHeader?: boolean;
}

export function ChatPanel({
  personName,
  profileId,
  chartId,
  viewMode,
  onAskQuestionStream,
  hideHeader = false,
}: ChatPanelProps) {
  const { t } = useTranslation('chat');
  const { messages, isStreaming, streamingDraft, submit } = useChatThread(profileId, chartId);
  const [inputValue, setInputValue] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll to the newest message / streaming tokens.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingDraft]);

  const handleSubmit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || isStreaming) {
        return;
      }
      setInputValue('');
      // The hook owns persistence + RAG; here we only delegate the LLM streaming.
      await submit(q, (input: ChatStreamInput) => streamAnswer(input, onAskQuestionStream, viewMode));
      inputRef.current?.focus();
    },
    [isStreaming, submit, onAskQuestionStream, viewMode],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(inputValue);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question);
    void handleSubmit(question);
  };

  // Search result -> scroll to + briefly highlight the target message.
  const handleOpenResult = useCallback((messageId: string, _threadId: string) => {
    const node = messageRefs.current.get(messageId);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId(null), 2000);
  }, []);

  const isLaymanMode = viewMode === 'layman';
  // Typing dots show only until the first streamed token arrives, then yield to
  // the live answer text (single fast streaming pass — no blocking round trip).
  const isStreamingText = isStreaming && streamingDraft.length > 0;
  const showTypingIndicator = isStreaming && streamingDraft.length === 0;

  return (
    <div
      className={`flex flex-col h-[500px] bg-background-secondary ${hideHeader ? '' : 'border border-ui-border rounded-xl'} overflow-hidden`}
      data-testid="chat-panel"
    >
      {/* Header - adapts based on mode, hidden when used in FloatingChatPanel */}
      {!hideHeader && (
        <div className="px-4 py-3 border-b border-ui-border bg-background-tertiary">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            {isLaymanMode ? (
              <>
                <svg className="w-4 h-4 text-accent-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {t('header.layman_title')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('header.technical_title')}
              </>
            )}
          </h3>
          <p className="text-text-muted text-xs">
            {isLaymanMode ? t('header.layman_subtitle') : t('header.technical_subtitle')}
          </p>
        </div>
      )}

      {/* Semantic search over this profile's past conversations (discoverable). */}
      {profileId && <ChatSearch profileId={profileId} onOpenResult={handleOpenResult} />}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-accent-gold/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h4 className="text-text-primary font-medium mb-2">{t('empty.title', { name: personName })}</h4>
            <p className="text-text-muted text-sm max-w-xs">{t('empty.hint')}</p>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              if (message.role === 'system') {
                return null;
              }
              const role = message.role;
              const isHighlighted = message.id === highlightedMessageId;
              return (
                <div
                  key={message.id}
                  ref={(node) => {
                    if (node) messageRefs.current.set(message.id, node);
                    else messageRefs.current.delete(message.id);
                  }}
                  className={
                    isHighlighted ? 'rounded-xl ring-2 ring-accent-gold/60 transition-shadow' : undefined
                  }
                >
                  {isLaymanMode ? (
                    <MessageBubble role={role} content={message.content} timestamp={message.created_at} />
                  ) : (
                    <ReferenceEntry role={role} content={message.content} timestamp={message.created_at} />
                  )}
                </div>
              );
            })}

            {/* Live streaming answer (the in-flight assistant turn before persist). */}
            {isStreamingText &&
              (isLaymanMode ? (
                <MessageBubble role="assistant" content={streamingDraft} />
              ) : (
                <ReferenceEntry role="assistant" content={streamingDraft} />
              ))}

            {/* Typing indicator — only until the first streamed token arrives. */}
            {showTypingIndicator && (
              <div className={isLaymanMode ? 'flex justify-start mb-4' : 'mb-6'} data-testid="chat-loading">
                {isLaymanMode ? (
                  <div className="bg-background-tertiary rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                ) : (
                  <div className="bg-background-tertiary/50 border border-ui-border/50 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-accent-purple rounded-full animate-pulse" />
                        <span className="w-2 h-2 bg-accent-purple rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-accent-purple rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-text-muted">{t('status.analyzing')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Suggested questions (show when no messages or few messages) */}
      {messages.length < 3 && (
        <div className="px-4">
          <SuggestedQuestions onSelect={handleSuggestedQuestion} disabled={isStreaming} />
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-ui-border bg-background-tertiary">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('input.placeholder')}
            className="flex-1 min-w-0 px-4 py-3 bg-background-primary border border-ui-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold/50 resize-none text-sm disabled:opacity-50"
            rows={1}
            disabled={isStreaming}
            data-testid="chat-input"
          />
          <button
            onClick={() => void handleSubmit(inputValue)}
            disabled={!inputValue.trim() || isStreaming}
            className="px-4 py-3 bg-accent-gold text-background-primary font-semibold rounded-xl hover:bg-accent-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="chat-send-button"
          >
            {isStreaming ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Adapt the Dashboard's streaming handler into the `ChatStreamFn` the chat hook
 * expects: forward the RAG context + multi-turn history, surface tokens, and
 * return the final answer text.
 */
async function streamAnswer(
  input: ChatStreamInput,
  onAskQuestionStream: ChatPanelProps['onAskQuestionStream'],
  viewMode: ViewMode,
): Promise<string> {
  const response = await onAskQuestionStream(
    input.question,
    input.onToken,
    () => {
      // Meta (thread_id, etc.) intentionally unused — the store owns the thread.
    },
    viewMode,
    input.history,
    input.retrievedContext,
  );
  return response.answer;
}

export default ChatPanel;
