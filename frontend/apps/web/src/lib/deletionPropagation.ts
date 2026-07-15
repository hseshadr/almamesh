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

export function createDeletionPropagation(channel?: DeletionChannel): DeletionPropagation {
  return {
    publish: (notice) => channel?.postMessage(notice),
    subscribe: (listener) => {
      if (!channel) {
        return () => undefined;
      }
      const onMessage: MessageListener = (event) => listener(event.data as DeletionNotice);
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
