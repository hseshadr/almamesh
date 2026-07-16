import type { DeletionNotice } from './profileDataLifecycle';

type MessageListener = (event: MessageEvent<unknown>) => void;

export interface DeletionChannel {
  postMessage: (notice: DeletionNotice) => void;
  addEventListener: (type: 'message', listener: MessageListener) => void;
  removeEventListener: (type: 'message', listener: MessageListener) => void;
}

export interface DeletionPropagation {
  publish: (notice: DeletionNotice) => void;
  subscribe: (listener: (notice: DeletionNotice) => void) => () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDeletionNotice(value: unknown): value is DeletionNotice {
  if (!isRecord(value)) return false;
  if (value.kind === 'thread') return typeof value.threadId === 'string';
  if (value.kind === 'profile') {
    return (
      typeof value.profileId === 'string' &&
      isStringList(value.chartIds) &&
      isStringList(value.threadIds)
    );
  }
  if (value.kind !== 'dataset' || !['reset', 'replace'].includes(String(value.operation))) {
    return false;
  }
  const validPhase =
    value.phase === undefined || ['begin', 'complete', 'abort'].includes(String(value.phase));
  const validStoreKeys = value.presentStoreKeys === undefined || isStringList(value.presentStoreKeys);
  return validPhase && validStoreKeys;
}

export function createDeletionPropagation(channel?: DeletionChannel): DeletionPropagation {
  return {
    publish: (notice) => channel?.postMessage(notice),
    subscribe: (listener) => {
      if (!channel) {
        return () => undefined;
      }
      const onMessage: MessageListener = (event) => {
        if (isDeletionNotice(event.data)) listener(event.data);
      };
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    },
  };
}

function browserChannel(): DeletionChannel | undefined {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') {
    return undefined;
  }
  return new window.BroadcastChannel('almamesh-data-deletions');
}

const propagation = createDeletionPropagation(browserChannel());

export const publishDeletionNotice = propagation.publish;
export const subscribeDeletionNotices = propagation.subscribe;
