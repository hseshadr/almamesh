/**
 * SSE Parsing and Streaming Utilities
 */

/** Token event data */
export interface SSETokenData {
  t: string;
}

/** Meta event data */
export interface SSEMetaData {
  thread_id?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Done/Error event data */
export interface SSEDoneData {
  message?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Union type for all SSE event data */
export type SSEEventData = SSETokenData | SSEMetaData | SSEDoneData | Record<string, unknown>;

export interface SSEEvent {
  event: string;
  data: SSEEventData;
}

/**
 * Parses a fetch Response as an SSE stream.
 * Yields SSEEvent objects.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split by double newline (SSE frame separator)
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || ''; // Keep the last partial frame in the buffer

    for (const frame of frames) {
      if (!frame.trim()) continue;

      const lines = frame.split('\n');
      let eventType = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr += line.slice(6);
        }
      }

      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          yield { event: eventType, data };
        } catch (e) {
          console.warn('Failed to parse SSE data:', dataStr, e);
        }
      }
    }
  }
}
