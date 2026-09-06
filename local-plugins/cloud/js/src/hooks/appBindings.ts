/**
 * The one module that reaches into the App.
 *
 * Everything below it — `usePanelMethods`, `usePush`, `useStoreSubscription`
 * — takes its collaborators as arguments instead of importing them, so the
 * state machines are testable without the App, its recoil store, or a
 * server. This module is the composition root that supplies the real ones.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useTriggerPanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { getEventSource } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";

import { PUSH_OPERATOR_URI } from "../constants";
import { EventSourceConnect } from "./useStoreSubscription";

/** The subset of `useOperatorExecutor`'s return this plugin drives. */
export interface PushExecutor {
  execute(params: Record<string, unknown>): void;
  isExecuting: boolean;
}

/** What `useTriggerPanelEvent` gives back, narrowed to what we call. */
export type PanelEventTrigger = (
  uri: string,
  params?: Record<string, unknown>,
  prompt?: boolean,
  callback?: (result: { result?: unknown; error?: unknown }) => void,
) => void;

export interface AppBindings {
  panelId: string;
  datasetId?: string;
  datasetName?: string;
  trigger: PanelEventTrigger;
  executor: PushExecutor;
  connect: EventSourceConnect;
}

export function useAppBindings(): AppBindings {
  const panelId = usePanelId();
  const datasetId = useRecoilValue(fos.datasetId) as string | undefined;
  const datasetName = useRecoilValue(fos.datasetName) as string | undefined;
  const trigger = useTriggerPanelEvent() as unknown as PanelEventTrigger;
  const executor = useOperatorExecutor(PUSH_OPERATOR_URI);

  // `getEventSource` is fire-and-forget: it owns the retry loop and stops
  // when the signal aborts.
  const connect = useCallback<EventSourceConnect>(
    (path, handlers, signal, body) =>
      getEventSource(path, handlers, signal, body),
    [],
  );

  return useMemo(
    () => ({
      panelId,
      datasetId,
      datasetName,
      trigger,
      executor: {
        execute: executor.execute,
        isExecuting: executor.isExecuting,
      },
      connect,
    }),
    [
      panelId,
      datasetId,
      datasetName,
      trigger,
      executor.execute,
      executor.isExecuting,
      connect,
    ],
  );
}
