/**
 * The signal pipe: high-frequency, NON-persistent cross-surface
 * observation of surface-owned transient state (mid-drag geometry, cursor).
 *
 * Pure firehose: no retention, no replay-on-subscribe — a late subscriber
 * sees only future events. Anything with a queryable current value is
 * interaction state, not a signal. Topics are entity-scoped by
 * `EntityId` (full identity). Observers render from signals and may not
 * write back (signals → render only — the shared dispatch guard enforces it).
 */

import { DispatchGuard } from "../core/dispatchGuard";
import type { EntityId } from "../identity/entityId";

export type SignalHandler<T> = (payload: T, key: EntityId) => void;

interface Subscription {
  key: EntityId | "*";
  handler: SignalHandler<unknown>;
}

export class SignalPipe {
  private topics = new Map<string, Set<Subscription>>();
  private guard: DispatchGuard;

  constructor(guard: DispatchGuard = new DispatchGuard()) {
    this.guard = guard;
  }

  publish<T>(topic: string, key: EntityId, payload: T): void {
    const subscriptions = this.topics.get(topic);

    if (!subscriptions || subscriptions.size === 0) {
      return;
    }

    this.guard.run(() => {
      for (const subscription of subscriptions) {
        if (subscription.key === "*" || subscription.key === key) {
          subscription.handler(payload, key);
        }
      }
    });
  }

  subscribe<T>(
    topic: string,
    key: EntityId | "*",
    handler: SignalHandler<T>
  ): () => void {
    let subscriptions = this.topics.get(topic);

    if (!subscriptions) {
      subscriptions = new Set();
      this.topics.set(topic, subscriptions);
    }

    const subscription: Subscription = {
      key,
      handler: handler as SignalHandler<unknown>,
    };
    subscriptions.add(subscription);

    return () => {
      subscriptions.delete(subscription);
    };
  }
}
