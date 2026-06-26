/**
 * Chat Types for Assistant UI Integration
 * TypeScript interfaces for chat threads, messages, and streaming
 *
 * @packageDocumentation
 */

// ============================================================================
// Chat Thread Types
// ============================================================================

/**
 * Chat thread metadata
 * Represents a conversation thread without messages.
 *
 * Local-first: every thread belongs to a named profile (person) on this device
 * via `profile_id`, mirroring how charts are scoped per profile. `chart_id`
 * optionally links the thread to the chart it was opened from.
 */
export interface ChatThread {
  id: string;
  /** The profile (person) this thread belongs to — local-first per-person scope. */
  profile_id: string;
  /** Optional chart the conversation was opened from. */
  chart_id?: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  message_count: number;
}

/**
 * Chat message within a thread
 */
export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  token_count?: number;
}

/**
 * Chat thread with all messages included
 */
export interface ChatThreadWithMessages extends ChatThread {
  messages: ChatMessage[];
}

// ============================================================================
// Streaming Event Types
// ============================================================================

/**
 * Streaming token event during message generation
 */
export interface StreamingToken {
  content: string;
}

/**
 * Streaming completion event when message is fully generated
 */
export interface StreamingDone {
  message_id: string;
  token_count: number;
}

/**
 * Streaming error event
 */
export interface StreamingError {
  code: string;
  message: string;
  retryable: boolean;
}
