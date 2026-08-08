import { useKeyBinding } from "@fiftyone/keymap";
import { useCallback } from "react";
import * as recoil from "recoil";
import { useRecoilTransaction_UNSTABLE } from "recoil";

/**
 * looker-3d's hotkey hook, now a thin adapter over the keymap bus.
 *
 * What changed: the first argument is a **command id from the manifest**, not a
 * raw `event.code`. That is the declaration/binding split (design doc §4.4) —
 * the key itself now lives in `manifest.ts`, where the settings pane can see
 * and remap it, and this hook only supplies the handler.
 *
 * What stayed: the recoil transaction/callback ergonomics, which is the actual
 * reason this hook exists and why its call sites are pleasant to write.
 *
 * What went away, because it is now the bus's job:
 *  - its own `window` keydown listener (one of ~60; §4.1)
 *  - the `ignoreModifiers` bail, replaced by exact modifier matching, so a
 *    binding on `KeyR` declines `Ctrl+R` rather than silently ignoring it
 *  - a text-input guard checking `tagName === "INPUT"`, which missed
 *    contenteditable (F4)
 */
export const useHotkey = (
  commandId: string,
  cb: (props: {
    get: recoil.GetRecoilValue;
    set: recoil.SetRecoilState;
    snapshot: recoil.Snapshot;
  }) => void,
  deps: readonly unknown[] = [],
  props: {
    useTransaction?: boolean;
  } = {},
) => {
  const useTransaction = props.useTransaction ?? true;

  const transactionCb = useRecoilTransaction_UNSTABLE(
    (ctx) => () => cb(ctx),
    deps,
  );
  const callbackCb = recoil.useRecoilCallback((ctx) => () => cb(ctx), deps);
  const decoratedCb = useTransaction ? transactionCb : callbackCb;

  const handler = useCallback(() => {
    decoratedCb();
  }, [decoratedCb]);

  useKeyBinding(commandId, handler);
};
