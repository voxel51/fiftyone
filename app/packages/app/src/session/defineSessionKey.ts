/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Session } from "@fiftyone/state";

import registerEvent, {
  type EventHandlerHook,
} from "../useEvents/registerEvent";
import registerSetter, {
  type RegisteredSetter,
} from "../useSetters/registerSetter";
import {
  REGISTERED_WRITERS,
  type RegisteredWriter,
  type WriterKeys,
} from "../useWriters/registerWriter";

/**
 * One declaration per session field, replacing the three registries that kept
 * a field's behavior in three directories under three key spaces.
 *
 * The legs are named for when they run rather than what they touch: `event`
 * is inbound from the server, `onWrite` runs inside the write that changes
 * the value, and `onWritten` after it lands. Several of each reach the
 * server, so what they touch does not separate them.
 */
export interface SessionKey<K extends keyof Session> {
  /** The field, and the identity the rest hangs off. */
  key: K;
  /**
   * The server's name for the field, which is not the field's own name: a
   * `modalSelector` change arrives as `setSample`. Given in camel case, as
   * registration snake-cases it for the wire.
   */
  event?: string;
  /** Handles the server's message. */
  fromServer?: EventHandlerHook;
  /** Runs inside the write, holding the transaction's accessors. */
  onWrite?: RegisteredSetter;
  /** Runs once the write has landed. */
  onWritten?: K extends WriterKeys ? RegisteredWriter<K> : never;
}

const defined = new Map<string, SessionKey<keyof Session>>();

export const defineSessionKey = <K extends keyof Session>(
  definition: SessionKey<K>,
): SessionKey<K> => {
  if (defined.has(definition.key)) {
    throw new Error(`session field "${definition.key}" is defined twice`);
  }

  defined.set(definition.key, definition as SessionKey<keyof Session>);

  /**
   * Fills the three registries the hooks already read, so a field moves here
   * on its own rather than behind a rewrite of everything that consumes them.
   */
  if (definition.fromServer) {
    if (!definition.event) {
      throw new Error(`session field "${definition.key}" handles a server
        message without naming it`);
    }

    registerEvent(definition.event, definition.fromServer);
  }

  if (definition.onWrite) {
    registerSetter(definition.key, definition.onWrite);
  }

  if (definition.onWritten) {
    REGISTERED_WRITERS[definition.key as WriterKeys] =
      definition.onWritten as RegisteredWriter<WriterKeys>;
  }

  return definition;
};

/** Every field, for the hooks that drive the three legs. */
export const sessionKeys = (): readonly SessionKey<keyof Session>[] => [
  ...defined.values(),
];

export const sessionKeyFor = (key: string) => defined.get(key);

/** Reset between tests, which define fields as they mount them. */
export const clearSessionKeys = () => defined.clear();
