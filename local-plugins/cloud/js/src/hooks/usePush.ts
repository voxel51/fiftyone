/**
 * The push half: the operator, the two progress channels, and the rule that
 * decides which one wins.
 *
 * Panel data is the live channel and only exists while the generator's
 * request stream does. The store is the durable one, and under OSS's
 * default standalone mongod it has no change streams, so its notifications
 * fall back to ~5 s polling. Hence the merge rule: while a local execution
 * is in flight, panel-data patches own `push` and store messages are
 * dropped; when nothing is executing locally, store messages apply. Without
 * it, a 5 s-stale store frame would repeatedly stomp fresh panel-data
 * progress.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PUSH_KEY, SUBSCRIPTION_OPERATOR_URI } from "../constants";
import {
  CloudPanelSchemaView,
  PanelData,
  PushData,
  PushMode,
  PushStatus,
  PushTarget,
  UploadSelection,
} from "../types";
import { PushExecutor } from "./appBindings";
import {
  EventSourceConnect,
  useStoreSubscription,
} from "./useStoreSubscription";

/**
 * A preview skips the confirm step when there is nothing to decide: no
 * missing media, a small enough job, and no partial upload to resume.
 */
export const AUTO_CONFIRM_FILE_LIMIT = 100;

export interface Push {
  push: PushData;
  /** Current form selection, and its setters. */
  selection: UploadSelection;
  setTarget(target: PushTarget): void;
  setDatasetName(name: string): void;
  /** Runs `push_to_cloud` with `mode: "preview"`. */
  preview(): void;
  /** Runs `push_to_cloud` with `mode: "push"`, reusing `plan_token`. */
  confirm(options: { fresh: boolean }): void;
  /** Back out of the preview to the upload form. */
  back(): void;
  /** `reset_push` — clears the store key and returns to idle. */
  reset(): Promise<void>;
  /** True while this browser is driving the operator. */
  isExecuting: boolean;
}

export interface PushDeps {
  executor: PushExecutor;
  panelId: string;
  datasetId?: string;
  datasetName?: string;
  connect: EventSourceConnect;
}

function idle(localDataset: string): PushData {
  return {
    status: PushStatus.Idle,
    updated_at: new Date(0).toISOString(),
    local_dataset: localDataset,
    done: 0,
    total: 0,
  };
}

export function usePush(
  data: PanelData,
  view: CloudPanelSchemaView,
  resetPush: () => Promise<void>,
  deps: PushDeps,
): Push {
  const { executor, panelId, datasetId, datasetName, connect } = deps;

  const [target, setTarget] = useState<PushTarget>(
    view.has_view ? PushTarget.View : PushTarget.Dataset,
  );
  const [cloudName, setCloudName] = useState(view.local_dataset);
  // A snapshot this browser shows in place of panel data: one that arrived
  // on the store, or the local idle that `back()` produces. Newest wins.
  const [override, setOverride] = useState<PushData | null>(null);
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);

  // The local dataset changes under the panel when the user switches
  // datasets; the typed cloud name follows until they touch it again.
  useEffect(() => {
    setCloudName(view.local_dataset);
    setOverride(null);
  }, [view.local_dataset]);

  useEffect(() => {
    if (!view.has_view) {
      setTarget(PushTarget.Dataset);
    }
  }, [view.has_view]);

  const fromPanel = data.push;

  // Panel data is authoritative whenever it exists and this browser is the
  // one driving; a store frame only fills the gap left by a request stream
  // that is not ours or is gone.
  const push = useMemo(() => {
    const local = fromPanel ?? idle(view.local_dataset);
    if (!override) {
      return local;
    }
    return Date.parse(override.updated_at) >= Date.parse(local.updated_at)
      ? override
      : local;
  }, [fromPanel, override, view.local_dataset]);

  const isExecuting = executor.isExecuting;
  const executingRef = useRef(isExecuting);
  executingRef.current = isExecuting;

  const onStoreMessage = useCallback((key: string, value: PushData) => {
    if (key !== PUSH_KEY || !value?.status) {
      return;
    }
    if (executingRef.current) {
      // Our own generator is streaming; the store is up to 5 s behind and
      // applying it here would visibly rewind the bar.
      return;
    }
    setOverride(value);
  }, []);

  useStoreSubscription<PushData>({
    operatorUri: SUBSCRIPTION_OPERATOR_URI,
    datasetId,
    datasetName,
    onMessage: onStoreMessage,
    connect,
  });

  const run = useCallback(
    (params: Record<string, unknown>) => {
      // The local channel takes over for the duration of the run.
      setOverride(null);
      executor.execute({
        target,
        dataset_name: cloudName,
        panel_id: panelId,
        fresh: false,
        ...params,
      });
    },
    [cloudName, executor, panelId, target],
  );

  const preview = useCallback(() => {
    setDismissedToken(null);
    run({ mode: PushMode.Preview });
  }, [run]);

  const confirm = useCallback(
    (options: { fresh: boolean }) => {
      run({
        mode: PushMode.Push,
        fresh: options.fresh,
        plan_token: push.plan_token,
      });
    },
    [push.plan_token, run],
  );

  // Auto-confirm, guarded on the token rather than the status: the preview
  // snapshot stays in panel data across re-renders, so a status guard would
  // fire again on every one.
  const autoConfirmedToken = useRef<string | null>(null);
  useEffect(() => {
    if (push.status !== PushStatus.Preview || !push.plan_token) {
      return;
    }
    // `_preview` emits through the composite sink, so a preview reaches the
    // store as well as panel data — another tab on the same dataset sees it
    // over SSE. Only the browser whose own generator produced the token may
    // act on it: two tabs auto-confirming would race for a single-use plan
    // token, and both would read the store before either wrote `running`,
    // so the 30 s guard would not reliably catch the second worker.
    if (fromPanel?.plan_token !== push.plan_token) {
      return;
    }
    if (autoConfirmedToken.current === push.plan_token) {
      return;
    }
    if (dismissedToken === push.plan_token) {
      return;
    }

    const nothingToDecide =
      push.preview !== undefined &&
      push.preview.missing === 0 &&
      push.preview.files < AUTO_CONFIRM_FILE_LIMIT &&
      push.resumable === undefined;

    if (!nothingToDecide) {
      return;
    }

    autoConfirmedToken.current = push.plan_token;
    confirm({ fresh: false });
  }, [
    confirm,
    dismissedToken,
    fromPanel?.plan_token,
    push.plan_token,
    push.preview,
    push.resumable,
    push.status,
  ]);

  const back = useCallback(() => {
    // Browser-local: the parked plan simply expires. Marking the token as
    // dismissed stops the auto-confirm effect re-firing on the snapshot
    // that is still sitting in panel data.
    if (push.plan_token) {
      setDismissedToken(push.plan_token);
    }
    setOverride({ ...idle(view.local_dataset), updated_at: nowIso() });
  }, [push.plan_token, view.local_dataset]);

  const reset = useCallback(async () => {
    setOverride(null);
    setDismissedToken(null);
    autoConfirmedToken.current = null;
    await resetPush();
  }, [resetPush]);

  const selection = useMemo<UploadSelection>(
    () => ({ target, datasetName: cloudName }),
    [cloudName, target],
  );

  return useMemo(
    () => ({
      push,
      selection,
      setTarget,
      setDatasetName: setCloudName,
      preview,
      confirm,
      back,
      reset,
      isExecuting,
    }),
    [back, confirm, isExecuting, preview, push, reset, selection],
  );
}

function nowIso(): string {
  return new Date().toISOString();
}
